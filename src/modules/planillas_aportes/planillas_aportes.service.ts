import { Injectable, BadRequestException, StreamableFile, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Not, Repository } from 'typeorm';
import { PlanillasAporte } from './entities/planillas_aporte.entity';
import { PlanillaAportesDetalles } from './entities/planillas_aportes_detalles.entity';
import { HttpService } from '@nestjs/axios';
import axios, { AxiosResponse } from 'axios';
import { firstValueFrom, Observable, Subject } from 'rxjs';
import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import * as carbone from 'carbone';
import * as moment from 'moment-timezone';
import { EmpresasService } from '../empresas/empresas.service';
import { CreateNotificacioneDto } from '../notificaciones/dto/create-notificacione.dto';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { CreatePlanillasAporteDto } from './dto/create-planillas_aporte.dto';
import { CreatePlanillaAportesDetallesDto } from './dto/create-planillas_aportes_detalles.dto';
import { ExternalApiService } from '../api-client/service/external-api.service';
import pLimit from 'p-limit';
import { number } from 'joi';


@Injectable()
export class PlanillasAportesService {
  constructor(
    @InjectRepository(PlanillasAporte)
    private planillaRepo: Repository<PlanillasAporte>,
    private readonly httpService: HttpService,
    private notificacionesService: NotificacionesService,

    @InjectRepository(PlanillaAportesDetalles)
    private detalleRepo: Repository<PlanillaAportesDetalles>,

    private readonly empresasService: EmpresasService,
    private readonly externalApiService: ExternalApiService,
  ) {}


//* DESCARGAR PLANTILLA DE EXCEL PARA PLANILLAS DE APORTES
async descargarPlantilla(): Promise<StreamableFile> {
  const filePath = path.resolve('reports/plantilla.xlsx',);
  console.log('Ruta generada:', filePath);
  if (!fs.existsSync(filePath)) {
    throw new BadRequestException('La plantilla no se encuentra en el servidor');
  }
  const fileStream = fs.createReadStream(filePath);
  return new StreamableFile(fileStream);
}
//? MÉTODO AUXILIAR: Actualizar totales de la planilla mensual con todos sus adicionales
private async actualizarTotalesPlanillaMensual(idPlanillaMensual: number, tipoEmpresa: string) {
  // Obtener todas las planillas relacionadas (mensual + adicionales)
  const planillasRelacionadas = await this.planillaRepo.find({
    where: [
      { id_planilla_aportes: idPlanillaMensual }, // La mensual
      { id_planilla_origen: idPlanillaMensual }   // Todas las adicionales
    ]
  });

  const idsToCheck = planillasRelacionadas.map(p => p.id_planilla_aportes);

  // Calcular totales consolidados desde los detalles
  const totalesConsolidados = await this.detalleRepo
    .createQueryBuilder('detalle')
    .select([
      'SUM(detalle.salario) as total_importe',
      'COUNT(*) as total_trabajadores'
    ])
    .where('detalle.id_planilla_aportes IN (:...ids)', { ids: idsToCheck })
    .getRawOne();

  const totalImporte = parseFloat(totalesConsolidados?.total_importe || '0');
  const totalTrabajadores = parseInt(totalesConsolidados?.total_trabajadores || '0');

  // Calcular nueva cotización tasa
  let cotizacionTasa: number;
  if (tipoEmpresa === 'PA') {
    cotizacionTasa = parseFloat((totalImporte * 0.03).toFixed(6));
  } else {
    cotizacionTasa = parseFloat((totalImporte * 0.1).toFixed(6));
  }

  // Actualizar la planilla mensual
  const planillaMensual = await this.planillaRepo.findOne({
    where: { id_planilla_aportes: idPlanillaMensual }
  });

  if (planillaMensual) {
    planillaMensual.total_importe = parseFloat(totalImporte.toFixed(6));
    planillaMensual.total_trabaj = totalTrabajadores;
    planillaMensual.cotizacion_tasa = cotizacionTasa;
    
    await this.planillaRepo.save(planillaMensual);
    
    console.log(`✅ Planilla mensual ${idPlanillaMensual} actualizada: Total Importe: ${totalImporte}, Total Trabajadores: ${totalTrabajadores}`);
  }
}

// 1 .-  PROCESAR EXCEL DE APORTES -------------------------------------------------------------------------------------------------------
procesarExcel(filePath: string) {
    try {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];  
      const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

      if (!data.length) {
        throw new BadRequestException('El archivo Excel está vacío o tiene un formato incorrecto');
      }

      fs.unlinkSync(filePath);
      return data;
    } catch (error) {
      throw new BadRequestException('Error al procesar el archivo Excel');
    }
  }
// 2 .- GUARDAR PLANILLA DE APORTES -------------------------------------------------------------------------------------------------------
async guardarPlanilla(data: any[], createPlanillaDto: CreatePlanillasAporteDto) {
  const { cod_patronal, gestion, mes, tipo_planilla, usuario_creacion, nombre_creacion } = createPlanillaDto;

  const empresa = await this.empresasService.findByCodPatronal(cod_patronal);
  if (!empresa) {
    throw new BadRequestException('No se encontró una empresa con el código patronal proporcionado');
  }

  const tipoEmpresa = empresa.tipo?.toUpperCase();
  if (!tipoEmpresa) {
    throw new BadRequestException('No se pudo determinar el tipo de empresa');
  }
  if (!['PA', 'AP', 'AV', 'VA'].includes(tipoEmpresa)) {
    throw new BadRequestException(`Tipo de empresa no válido: ${tipoEmpresa}`);
  }

  const fechaPlanilla = new Date(`${gestion}-${mes.padStart(2, '0')}-01`);

  let planillaMensualExistente: PlanillasAporte | null = null;

  if (tipo_planilla === 'Planilla Adicional') {
    // Solo aceptamos adicionales si hay una mensual activa (estado = 1)
    planillaMensualExistente = await this.planillaRepo.findOne({
      where: {
        cod_patronal,
        fecha_planilla: fechaPlanilla,
        tipo_planilla: 'Mensual',
        estado: 1,
      },
    });

    if (!planillaMensualExistente) {
      throw new BadRequestException('Debe existir una planilla Mensual activa (estado = 1) antes de subir una Adicional.');
    }
  } else if (tipo_planilla === 'Mensual') {
    // Validación para no duplicar planilla mensual (sin importar estado)
    planillaMensualExistente = await this.planillaRepo.findOne({
      where: {
        cod_patronal,
        fecha_planilla: fechaPlanilla,
        tipo_planilla: 'Mensual',
      },
    });

    if (planillaMensualExistente) {
      throw new BadRequestException('Ya existe una planilla Mensual para este mes y gestión.');
    }
  }

  const parseOrZero = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'string') {
      const clean = val.replace(/\./g, '').replace(',', '.').trim();
      const parsed = parseFloat(clean);
      return isNaN(parsed) ? 0 : parsed;
    }
    if (typeof val === 'number') return val;
    return 0;
  };

  let totalImporte = 0;
  data.forEach((row, index) => {
    const haberBasico = parseOrZero(row['Haber Básico']);
    const bonoAntiguedad = parseOrZero(row['Bono de antigüedad']);
    const montoHorasExtra = parseOrZero(row['Monto horas extra']);
    const montoHorasExtraNocturnas = parseOrZero(row['Monto horas extra nocturnas']);
    const otrosBonosPagos = parseOrZero(row['Otros bonos y pagos']);

    const sumaFila = haberBasico + bonoAntiguedad + montoHorasExtra + montoHorasExtraNocturnas + otrosBonosPagos;

    if (isNaN(sumaFila)) {
      throw new BadRequestException(`Error al calcular total en la fila ${index + 1}: valores no numéricos`);
    }

    totalImporte += sumaFila;
  });

  let cotizacionTasa: number;
  if (tipoEmpresa === 'PA') {
    cotizacionTasa = parseFloat((totalImporte * 0.03).toFixed(6));
  } else {
    cotizacionTasa = parseFloat((totalImporte * 0.1).toFixed(6));
  }

  const totalTrabaj = data.length;

  const nuevaPlanilla = this.planillaRepo.create({
    cod_patronal,
    id_empresa: empresa.id_empresa,
    fecha_planilla: fechaPlanilla,
    tipo_planilla,
    total_importe: totalImporte,
    total_trabaj: totalTrabaj,
    estado: 0,
    fecha_declarada: null,
    mes,
    gestion,
    usuario_creacion,
    nombre_creacion,
    cotizacion_tasa: cotizacionTasa,
    id_planilla_origen: tipo_planilla === 'Planilla Adicional' ? planillaMensualExistente.id_planilla_aportes : null,
  });

  const planillaGuardada = await this.planillaRepo.save(nuevaPlanilla);

  function parseExcelDate(value: any): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'number' && !isNaN(value) && value > 0) {
      const date = new Date(1900, 0, value - 1);
      return date.toISOString();
    }
    if (typeof value === 'string') {
      const parsedDate = moment(value, ['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'], true);
      if (parsedDate.isValid()) return parsedDate.toISOString();
      throw new BadRequestException(`Formato de fecha no válido: ${value}`);
    }
    return undefined;
  }

  let nroBase = 1;

  if (tipo_planilla === 'Planilla Adicional') {
    // Buscar el máximo número en TODAS las planillas relacionadas
    const planillasRelacionadas = await this.planillaRepo.find({
      where: [
        { id_planilla_aportes: planillaMensualExistente.id_planilla_aportes }, // La mensual
        { id_planilla_origen: planillaMensualExistente.id_planilla_aportes }   // Todas las adicionales
      ]
    });

    const idsToCheck = planillasRelacionadas.map(p => p.id_planilla_aportes);

    const maxNro = await this.detalleRepo
      .createQueryBuilder('detalle')
      .select('MAX(detalle.nro)', 'max')
      .where('detalle.id_planilla_aportes IN (:...ids)', { ids: idsToCheck })
      .getRawOne();

    nroBase = (parseInt(maxNro?.max || '0', 10) || 0) + 1;
  }

  const detalles: CreatePlanillaAportesDetallesDto[] = data.map((row, index) => {
    const redondear = (valor: any): number => parseFloat(parseOrZero(valor).toFixed(6));
    const haberBasico = redondear(row['Haber Básico']);
    const bonoAntiguedad = redondear(row['Bono de antigüedad']);
    const montoHorasExtra = redondear(row['Monto horas extra']);
    const montoHorasExtraNocturnas = redondear(row['Monto horas extra nocturnas']);
    const otrosBonosPagos = redondear(row['Otros bonos y pagos']);

    return {
      id_planilla_aportes: planillaGuardada.id_planilla_aportes,
      nro: tipo_planilla === 'Mensual' ? index + 1 : nroBase + index,
      ci: row['Número documento de identidad']?.toString(),
      apellido_paterno: row['Apellido Paterno']?.toString(),
      apellido_materno: row['Apellido Materno']?.toString(),
      nombres: row['Nombres']?.toString(),
      sexo: row['Sexo (M/F)']?.toString(),
      cargo: row['Cargo']?.toString(),
      fecha_nac: parseExcelDate(row['Fecha de nacimiento']),
      fecha_ingreso: parseExcelDate(row['Fecha de ingreso']),
      fecha_retiro: parseExcelDate(row['Fecha de retiro']),
      dias_pagados: parseInt(row['Días pagados'] || '0', 10) || null,
      haber_basico: haberBasico,
      bono_antiguedad: bonoAntiguedad,
      monto_horas_extra: montoHorasExtra,
      monto_horas_extra_nocturnas: montoHorasExtraNocturnas,
      otros_bonos_pagos: otrosBonosPagos,
      salario: parseFloat((haberBasico + bonoAntiguedad + montoHorasExtra + montoHorasExtraNocturnas + otrosBonosPagos).toFixed(6)),
      regional: row['regional']?.toString(),
      tipo: tipo_planilla.toLowerCase().replace(' ', '_') as 'mensual' | 'planilla_adicional',
    };
  });

  const batchSize = 1000;
  for (let i = 0; i < detalles.length; i += batchSize) {
    const batch = detalles.slice(i, i + batchSize);
    await this.detalleRepo.save(batch, { chunk: 1000 });
  }

  // NUEVO: Si es una planilla adicional, actualizar los totales de la planilla mensual
  if (tipo_planilla === 'Planilla Adicional' && planillaMensualExistente) {
    await this.actualizarTotalesPlanillaMensual(planillaMensualExistente.id_planilla_aportes, tipoEmpresa);
  }

  return {
    mensaje: '✅ Planilla guardada con éxito',
    id_planilla: planillaGuardada.id_planilla_aportes,
  };
}
// 3 .- ACTUALIZAR DETALLES DE PLANILLA DE APORTES -------------------------------------------------------------------------------------------------------
async actualizarDetallesPlanilla(id_planilla: number, data: any[], createPlanillaDto?: CreatePlanillasAporteDto) {
  const planilla = await this.planillaRepo.findOne({
    where: { id_planilla_aportes: id_planilla },
    relations: ['empresa'],
  });

  if (!planilla) {
    throw new NotFoundException('❌ La planilla no existe.');
  }

  if (planilla.estado !== 0) {
    throw new BadRequestException('❌ Solo se pueden actualizar planillas en estado borrador.');
  }

  const datosValidos = data.filter(row =>
    row['Número documento de identidad'] &&
    row['Nombres'] &&
    row['Haber Básico']
  );

  if (datosValidos.length === 0) {
    throw new BadRequestException('❌ No se encontraron registros válidos en el archivo.');
  }

  let planillaMensualExistente: PlanillasAporte | null = null;
  
  if (planilla.tipo_planilla === 'Planilla Adicional') {
    if (planilla.id_planilla_origen) {
      planillaMensualExistente = await this.planillaRepo.findOne({
        where: { id_planilla_aportes: planilla.id_planilla_origen }
      });
    } else {
      const fechaPlanilla = new Date(`${planilla.gestion}-${planilla.mes.padStart(2, '0')}-01`);
      planillaMensualExistente = await this.planillaRepo.findOne({
        where: {
          cod_patronal: planilla.cod_patronal,
          fecha_planilla: fechaPlanilla,
          tipo_planilla: 'Mensual',
          estado: 1,
        },
      });
    }

    if (!planillaMensualExistente) {
      throw new BadRequestException('No se encontró la planilla mensual correspondiente.');
    }
  }

  if (createPlanillaDto) {
    const { cod_patronal, gestion, mes, tipo_planilla } = createPlanillaDto;

    const empresa = await this.empresasService.findByCodPatronal(cod_patronal);
    if (!empresa) {
      throw new BadRequestException('No se encontró una empresa con el código patronal proporcionado');
    }

    if (tipo_planilla === 'Planilla Adicional') {
      planillaMensualExistente = await this.planillaRepo.findOne({
        where: {
          cod_patronal,
          tipo_planilla: 'Mensual',
          estado: 1,
        },
      });

      if (!planillaMensualExistente) {
        throw new BadRequestException('Debe existir una planilla Mensual activa (estado = 1) antes de subir una Adicional.');
      }
    } else if (tipo_planilla === 'Mensual') {
      planillaMensualExistente = await this.planillaRepo.findOne({
        where: {
          cod_patronal,
          tipo_planilla: 'Mensual',
        },
      });

      if (planillaMensualExistente && planillaMensualExistente.id_planilla_aportes !== id_planilla) {
        throw new BadRequestException('Ya existe una planilla Mensual para este mes y gestión.');
      }
    }
  }

  function parseExcelDate(value: any): string | undefined {
    if (!value) return undefined;

    if (typeof value === 'number' && !isNaN(value) && value > 0) {
      const date = new Date(1900, 0, value - 1);
      return isNaN(date.getTime()) ? undefined : date.toISOString();
    }

    if (typeof value === 'string') {
      const parsedDate = moment(value, ['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'], true);
      if (parsedDate.isValid()) return parsedDate.toISOString();
      throw new BadRequestException(`Formato de fecha no válido: ${value}`);
    }

    return undefined;
  }

  let nroBase = 1;
  const tipoPlanilla = createPlanillaDto?.tipo_planilla || planilla.tipo_planilla;
  
  if (tipoPlanilla === 'Planilla Adicional' && planillaMensualExistente) {
    const planillasRelacionadas = await this.planillaRepo.find({
      where: [
        { id_planilla_aportes: planillaMensualExistente.id_planilla_aportes },
        { id_planilla_origen: planillaMensualExistente.id_planilla_aportes }
      ]
    });

    const idsToCheck = planillasRelacionadas
      .filter(p => p.id_planilla_aportes !== id_planilla)
      .map(p => p.id_planilla_aportes);

    if (idsToCheck.length > 0) {
      const maxNro = await this.detalleRepo
        .createQueryBuilder('detalle')
        .select('MAX(detalle.nro)', 'max')
        .where('detalle.id_planilla_aportes IN (:...ids)', { ids: idsToCheck })
        .getRawOne();

      nroBase = (parseInt(maxNro?.max || '0', 10) || 0) + 1;
    }
  }

  let totalImporte = 0;
  const totalTrabaj = datosValidos.length;

  const nuevosDetalles: CreatePlanillaAportesDetallesDto[] = datosValidos.map((row, index) => {
    try {
      const haber_basico = parseFloat(row['Haber Básico'] || '0');
      const bono_antiguedad = parseFloat(row['Bono de antigüedad'] || '0');
      const horas_extra = parseFloat(row['Monto horas extra'] || '0');
      const horas_extra_nocturnas = parseFloat(row['Monto horas extra nocturnas'] || '0');
      const otros_bonos = parseFloat(row['Otros bonos y pagos'] || '0');

      const salario = haber_basico + bono_antiguedad + horas_extra + horas_extra_nocturnas + otros_bonos;

      totalImporte += salario;

      return {
        id_planilla_aportes: id_planilla,
        nro: tipoPlanilla === 'Mensual' ? index + 1 : nroBase + index,
        ci: row['Número documento de identidad'] || '',
        apellido_paterno: row['Apellido Paterno'] || '',
        apellido_materno: row['Apellido Materno'] || '',
        nombres: row['Nombres'] || '',
        sexo: row['Sexo (M/F)'] || '',
        cargo: row['Cargo'] || '',
        fecha_nac: parseExcelDate(row['Fecha de nacimiento']),
        fecha_ingreso: parseExcelDate(row['Fecha de ingreso']),
        fecha_retiro: parseExcelDate(row['Fecha de retiro']),
        dias_pagados: row['Días pagados'] || 0,
        haber_basico,
        bono_antiguedad,
        monto_horas_extra: horas_extra,
        monto_horas_extra_nocturnas: horas_extra_nocturnas,
        otros_bonos_pagos: otros_bonos,
        salario,
        regional: row['regional'] || '',
        tipo: planilla.tipo_planilla.toLowerCase().replace(' ', '_') as 'mensual' | 'planilla_adicional',
      };
    } catch (error) {
      throw new BadRequestException(`Error en la fila ${row['Nro.'] || index + 1}: ${error.message}`);
    }
  });

  await this.detalleRepo.delete({ id_planilla_aportes: id_planilla });

  const batchSize = 1000;
  const totalnuevosDetalles = nuevosDetalles.length;
  console.log(`Total de registros a guardar: ${totalnuevosDetalles}`);

  for (let i = 0; i < totalnuevosDetalles; i += batchSize) {
    const batch = nuevosDetalles.slice(i, i + batchSize);
    console.log(`Guardando lote ${i / batchSize + 1} (${batch.length} registros)`);
    try {
      await this.detalleRepo.save(batch, { chunk: 1000 });
    } catch (error) {
      console.error(`Error al guardar lote ${i / batchSize + 1}:`, error);
      throw new BadRequestException(`Error al guardar lote ${i / batchSize + 1}: ${error.message}`);
    }
  }

  // Actualizar la planilla actual
  planilla.total_importe = parseFloat(totalImporte.toFixed(6));
  planilla.total_trabaj = totalTrabaj;
  await this.planillaRepo.save(planilla);

  // NUEVO: Si es una planilla adicional, actualizar también la planilla mensual
  if (tipoPlanilla === 'Planilla Adicional' && planillaMensualExistente) {
    await this.actualizarTotalesPlanillaMensual(planillaMensualExistente.id_planilla_aportes, planilla.empresa.tipo?.toUpperCase());
  }

  return {
    mensaje: '✅ Detalles de la planilla actualizados con éxito',
    id_planilla: planilla.id_planilla_aportes,
    total_importe: planilla.total_importe,
    total_trabajadores: totalTrabaj,
  };
}
// 4 .- OBTENER HISTORIAL DETALLADO PAGINACION Y BUSQUEDA DE TABLA PLANILLAS DE APORTES -------------------------------------------------------------------------------------------------------
async obtenerHistorial(cod_patronal: string,pagina: number = 1,limite: number = 10,busqueda: string = '', mes?: string, anio?: string) {
  try {
    // Validar parámetros
    if (pagina < 1 || limite < 1) {
      throw new BadRequestException('La página y el límite deben ser mayores que 0');
    }
    if (mes && (isNaN(Number(mes)) || Number(mes) < 1 || Number(mes) > 12)) {
      throw new BadRequestException('El mes debe ser un número entre 1 y 12');
    }
    if (anio && (isNaN(Number(anio)) || Number(anio) < 1900 || Number(anio) > 2100)) {
      throw new BadRequestException('El año debe ser un número válido (1900-2100)');
    }

    const skip = (pagina - 1) * limite;

    const query = this.planillaRepo.createQueryBuilder('planilla')
      .leftJoinAndSelect('planilla.empresa', 'empresa')
      .leftJoin('planillas_adicionales', 'pa', 'pa.id_planilla_aportes = planilla.id_planilla_aportes')
      .where('TRIM(LOWER(planilla.cod_patronal)) = TRIM(LOWER(:cod_patronal))', { cod_patronal })
      .orderBy('planilla.fecha_creacion', 'DESC')
      .skip(skip)
      .take(limite)
      .groupBy('planilla.id_planilla_aportes, empresa.id_empresa')
      .select([
        'planilla.id_planilla_aportes',
        'planilla.com_nro',
        'planilla.tipo_planilla',
        'planilla.fecha_planilla',
        'planilla.cod_patronal',
        'planilla.total_importe',
        'planilla.total_trabaj',
        'planilla.estado',
        'planilla.fecha_creacion',
        'planilla.fecha_declarada',
        'planilla.fecha_pago',
        'planilla.fecha_liquidacion',
        'empresa.emp_nom AS empresa',
        'COUNT(pa.id_planilla_adicional) AS planillas_adicionales'
      ]);

    // Filtro por mes
    if (mes) {
      query.andWhere('TO_CHAR(planilla.fecha_planilla, \'MM\') = :mes', { mes });
    }

    // Filtro por año
    if (anio) {
      query.andWhere('TO_CHAR(planilla.fecha_planilla, \'YYYY\') = :anio', { anio });
    }

    // Búsqueda en todos los campos
    if (busqueda) {
      query.andWhere(
        new Brackets(qb => {
          qb.where('CAST(planilla.id_planilla_aportes AS TEXT) LIKE :busqueda')
            .orWhere('CAST(planilla.com_nro AS TEXT) LIKE :busqueda')
            .orWhere('CAST(planilla.fecha_planilla AS TEXT) LIKE :busqueda')
            .orWhere('planilla.cod_patronal LIKE :busqueda')
            .orWhere('empresa.emp_nom LIKE :busqueda')
            .orWhere('CAST(planilla.total_importe AS TEXT) LIKE :busqueda')
            .orWhere('CAST(planilla.total_trabaj AS TEXT) LIKE :busqueda')
            .orWhere('CAST(planilla.estado AS TEXT) LIKE :busqueda')
            .orWhere('CAST(planilla.fecha_creacion AS TEXT) LIKE :busqueda');
        }),
        { busqueda: `%${busqueda}%` }
      );
    }

    // Obtener entidades y datos crudos
    const { entities, raw } = await query.getRawAndEntities();
    const total = await query.getCount();

    // Mapear los resultados combinando entidades y datos crudos
    const mappedPlanillas = entities.map((planilla: PlanillasAporte, index: number) => {
      const rawData = raw[index];
      return {
        id_planilla_aportes: planilla.id_planilla_aportes,
        com_nro: planilla.com_nro,
        tipo_planilla: planilla.tipo_planilla,
        fecha_planilla: planilla.fecha_planilla,
        cod_patronal: planilla.cod_patronal,
        empresa: rawData.empresa || null,
        total_importe: planilla.total_importe,
        total_trabaj: planilla.total_trabaj,
        estado: planilla.estado,
        fecha_creacion: planilla.fecha_creacion,
        fecha_declarada: planilla.fecha_declarada,
        fecha_pago: planilla.fecha_pago,
        planillas_adicionales: parseInt(rawData.planillas_adicionales, 10) || 0
      };
    });

    if (!entities.length) {
      return {
        mensaje: 'No hay planillas registradas para este código patronal',
        planillas: [],
        total: 0,
        pagina,
        limite,
      };
    }

    return {
      mensaje: 'Historial obtenido con éxito',
      planillas: mappedPlanillas,
      total,
      pagina,
      limite,
    };
  } catch (error) {
    throw new BadRequestException(`Error al obtener el historial de planillas: ${error.message}`);
  }
}
// 4.1 .- OBTENER HISTORIAL DETALLADO PAGINACION Y BUSQUEDA DE TABLA PLANILLAS DE APORTES ADMINISTRADOR -------------------------------------------------------------------------------------------------------
async obtenerHistorialAdmin(
  pagina: number = 1,
  limite: number = 10,
  busqueda: string = '',
  mes?: string,
  anio?: string,
  estado?: number
) {
  try {
    // Validar parámetros
    if (pagina < 1 || limite < 1) {
      throw new BadRequestException('La página y el límite deben ser mayores que 0');
    }
    if (mes && (isNaN(Number(mes)) || Number(mes) < 1 || Number(mes) > 12)) {
      throw new BadRequestException('El mes debe ser un número entre 1 y 12');
    }
    if (anio && (isNaN(Number(anio)) || Number(anio) < 1900 || Number(anio) > 2100)) {
      throw new BadRequestException('El año debe ser un número válido (1900-2100)');
    }
    if (estado !== undefined && estado !== null && (isNaN(estado) || ![0, 1, 2].includes(estado))) {
      throw new BadRequestException('El estado debe ser 0, 1 o 2');
    }

    const skip = (pagina - 1) * limite;

    const query = this.planillaRepo.createQueryBuilder('planilla')
      .leftJoinAndSelect('planilla.empresa', 'empresa')
      .leftJoin('planillas_adicionales', 'pa', 'pa.id_planilla_aportes = planilla.id_planilla_aportes')
      .where('planilla.estado IN (:...estados)', { estados: [1, 2] })
      .orderBy('planilla.fecha_planilla', 'DESC')
      .skip(skip)
      .take(limite)
      .groupBy('planilla.id_planilla_aportes, empresa.id_empresa')
      .select([
        'planilla.id_planilla_aportes',
        'planilla.com_nro',
        'planilla.fecha_planilla',
        'planilla.tipo_planilla',
        'planilla.cod_patronal',
        'planilla.total_importe',
        'planilla.total_trabaj',
        'planilla.estado',
        'planilla.fecha_creacion',
        'planilla.fecha_declarada',
        'planilla.fecha_pago',
        'planilla.fecha_liquidacion',
        'empresa.emp_nom AS empresa',
        'COUNT(pa.id_planilla_adicional) AS planillas_adicionales'
      ]);

    // Filtro por mes
    if (mes) {
      query.andWhere('TO_CHAR(planilla.fecha_planilla, \'MM\') = :mes', { mes });
    }

    // Filtro por año
    if (anio) {
      query.andWhere('TO_CHAR(planilla.fecha_planilla, \'YYYY\') = :anio', { anio });
    }

    // Filtro por estado
    if (estado !== undefined && estado !== null && !isNaN(estado)) {
      query.andWhere('planilla.estado = :estado', { estado });
    }

    // Búsqueda en todos los campos
    if (busqueda) {
      query.andWhere(
        new Brackets(qb => {
          qb.where('CAST(planilla.id_planilla_aportes AS TEXT) LIKE :busqueda')
            .orWhere('CAST(planilla.com_nro AS TEXT) LIKE :busqueda')
            .orWhere('CAST(planilla.fecha_planilla AS TEXT) LIKE :busqueda')
            .orWhere('planilla.cod_patronal LIKE :busqueda')
            .orWhere('empresa.emp_nom LIKE :busqueda')
            .orWhere('CAST(planilla.total_importe AS TEXT) LIKE :busqueda')
            .orWhere('CAST(planilla.total_trabaj AS TEXT) LIKE :busqueda')
            .orWhere('CAST(planilla.estado AS TEXT) LIKE :busqueda')
            .orWhere('CAST(planilla.fecha_creacion AS TEXT) LIKE :busqueda');
        }),
        { busqueda: `%${busqueda}%` }
      );
    }

    // Obtener entidades y datos crudos
    const { entities, raw } = await query.getRawAndEntities();
    const total = await query.getCount();

    // Mapear los resultados combinando entidades y datos crudos
    const mappedPlanillas = entities.map((planilla: PlanillasAporte, index: number) => {
      const rawData = raw[index];
      return {
        id_planilla_aportes: planilla.id_planilla_aportes,
        com_nro: planilla.com_nro,
        tipo_planilla: planilla.tipo_planilla,
        fecha_planilla: planilla.fecha_planilla,
        cod_patronal: planilla.cod_patronal,
        empresa: rawData.empresa || null,
        total_importe: planilla.total_importe,
        total_trabaj: planilla.total_trabaj,
        estado: planilla.estado,
        fecha_creacion: planilla.fecha_creacion,
        fecha_declarada: planilla.fecha_declarada,
        fecha_pago: planilla.fecha_pago,
        fecha_liquidacion: planilla.fecha_liquidacion,
        planillas_adicionales: parseInt(rawData.planillas_adicionales, 10) || 0
      };
    });

    if (!entities.length) {
      return {
        mensaje: 'No hay planillas registradas con los criterios especificados',
        planillas: [],
        total: 0,
        pagina,
        limite,
      };
    }

    return {
      mensaje: 'Historial obtenido con éxito',
      planillas: mappedPlanillas,
      total,
      pagina,
      limite,
    };
  } catch (error) {
    throw new BadRequestException(`Error al obtener el historial de planillas: ${error.message}`);
  }
}
// 5 .- OBTENER HISTORIAL DE TABLA PLANILLAS DE APORTES CUANDO ESTADO = 1 (presentadas) -------------------------------------------------------------------------------------------------------
async obtenerTodoHistorial(mes?: number, gestion?: number) {
  try {
    // Validar parámetros
    if (mes && (isNaN(mes) || mes < 1 || mes > 12)) {
      throw new BadRequestException('El mes debe ser un número entre 1 y 12');
    }
    if (gestion && (isNaN(gestion) || gestion < 1900 || gestion > 2100)) {
      throw new BadRequestException('El año debe ser un número válido (1900-2100)');
    }

    const query = this.planillaRepo.createQueryBuilder('planilla')
      .leftJoinAndSelect('planilla.empresa', 'empresa')
      .where('planilla.estado = :estado', { estado: 1 })
      .orderBy('planilla.fecha_creacion', 'DESC');

    // Filtrar por mes y año si se proporcionan
    if (mes && gestion) {
      query.andWhere('TO_CHAR(planilla.fecha_planilla, \'MM\') = :mes', { mes: mes.toString().padStart(2, '0') })
           .andWhere('TO_CHAR(planilla.fecha_planilla, \'YYYY\') = :gestion', { gestion });
    } else if (mes) {
      query.andWhere('TO_CHAR(planilla.fecha_planilla, \'MM\') = :mes', { mes: mes.toString().padStart(2, '0') });
    } else if (gestion) {
      query.andWhere('TO_CHAR(planilla.fecha_planilla, \'YYYY\') = :gestion', { gestion });
    }

    const planillas = await query.getMany();

    // Mapear los resultados para incluir emp_nom como "empresa"
    const mappedPlanillas = planillas.map(planilla => ({
      id_planilla_aportes: planilla.id_planilla_aportes,
      com_nro: planilla.com_nro,
      cod_patronal: planilla.cod_patronal,
      empresa: planilla.empresa ? planilla.empresa.emp_nom : null,
      mes: planilla.mes,
      gestion: planilla.gestion,
      total_importe: planilla.total_importe,
      total_trabaj: planilla.total_trabaj,
      estado: planilla.estado,
      fecha_creacion: planilla.fecha_creacion,
      fecha_declarada: planilla.fecha_declarada,
      fecha_planilla: planilla.fecha_planilla,
      fecha_pago: planilla.fecha_pago,
      total_a_cancelar: planilla.total_a_cancelar,
      total_a_cancelar_parcial: planilla.total_a_cancelar_parcial,
      aporte_porcentaje: planilla.aporte_porcentaje,
      total_aportes_asuss: planilla.total_aportes_asuss,
      total_aportes_min_salud: planilla.total_aportes_min_salud,
      total_multas: planilla.total_multas,
      total_tasa_interes: planilla.total_tasa_interes,
    }));

    if (!planillas.length) {
      return { mensaje: 'No hay planillas presentadas registradas con los criterios especificados', planillas: [] };
    }

    return {
      mensaje: 'Historial obtenido con éxito',
      planillas: mappedPlanillas,
    };
  } catch (error) {
    throw new BadRequestException(`Error al obtener el historial de planillas: ${error.message}`);
  }
}
// 6 .- OBTENER HISTORIAL TOTAL PLANILLA DE APORTES -------------------------------------------------------------------------------------------------------
async obtenerTodo(pagina: number = 1, limite: number = 10, busqueda: string = '') {
  try {
    // Validar parámetros
    if (pagina < 1 || limite < 1) {
      throw new BadRequestException('La página y el límite deben ser mayores que 0');
    }

    const skip = (pagina - 1) * limite;

    const query = this.planillaRepo.createQueryBuilder('planilla')
      .leftJoinAndSelect('planilla.empresa', 'empresa')
      .orderBy('planilla.fecha_creacion', 'DESC')
      .skip(skip)
      .take(limite);

    // Búsqueda en múltiples campos
    if (busqueda) {
      query.where(
        new Brackets(qb => {
          qb.where('CAST(planilla.id_planilla_aportes AS TEXT) LIKE :busqueda')
            .orWhere('CAST(planilla.com_nro AS TEXT) LIKE :busqueda')
            .orWhere('planilla.cod_patronal LIKE :busqueda')
            .orWhere('empresa.emp_nom LIKE :busqueda')
            .orWhere('planilla.mes LIKE :busqueda')
            .orWhere('planilla.gestion LIKE :busqueda')
            .orWhere('CAST(planilla.total_importe AS TEXT) LIKE :busqueda')
            .orWhere('CAST(planilla.total_trabaj AS TEXT) LIKE :busqueda')
            .orWhere('CAST(planilla.estado AS TEXT) LIKE :busqueda')
            .orWhere('CAST(planilla.fecha_creacion AS TEXT) LIKE :busqueda');
        }),
        { busqueda: `%${busqueda}%` }
      );
    }

    const [planillas, total] = await query.getManyAndCount();

    // Mapear los resultados para incluir emp_nom como "empresa"
    const mappedPlanillas = planillas.map(planilla => ({
      id_planilla_aportes: planilla.id_planilla_aportes,
      com_nro: planilla.com_nro,
      cod_patronal: planilla.cod_patronal,
      empresa: planilla.empresa ? planilla.empresa.emp_nom : null,
      mes: planilla.mes,
      gestion: planilla.gestion,
      total_importe: planilla.total_importe,
      total_trabaj: planilla.total_trabaj,
      estado: planilla.estado,
      fecha_creacion: planilla.fecha_creacion,
      fecha_declarada: planilla.fecha_declarada,
      fecha_planilla: planilla.fecha_planilla,
      fecha_pago: planilla.fecha_pago,
      total_a_cancelar: planilla.total_a_cancelar,
      total_a_cancelar_parcial: planilla.total_a_cancelar_parcial,
      aporte_porcentaje: planilla.aporte_porcentaje,
      total_aportes_asuss: planilla.total_aportes_asuss,
      total_aportes_min_salud: planilla.total_aportes_min_salud,
      total_multas: planilla.total_multas,
      total_tasa_interes: planilla.total_tasa_interes,
    }));

    if (!planillas.length) {
      return { mensaje: 'No hay planillas registradas con los criterios especificados', planillas: [], total: 0, pagina, limite };
    }

    return {
      mensaje: 'Historial obtenido con éxito',
      planillas: mappedPlanillas,
      total,
      pagina,
      limite,
    };
  } catch (error) {
    throw new BadRequestException(`Error al obtener el historial de planillas: ${error.message}`);
  }
}
// 7 .- OBTENER PLANILLA DE APORTES POR ID (ASINCRONO SIN PAGINACION) -------------------------------------------------------------------------------------------------------
async obtenerPlanilla(id_planilla: number) {
  try {
    // Validar parámetro
    if (!id_planilla || id_planilla < 1) {
      throw new BadRequestException('El ID de la planilla debe ser un número positivo');
    }

    const planilla = await this.planillaRepo.findOne({
      where: { id_planilla_aportes: id_planilla },
      relations: ['empresa'],
    });

    if (!planilla) {
      throw new BadRequestException('La planilla no existe');
    }

    const mappedPlanilla = {
      id_planilla_aportes: planilla.id_planilla_aportes,
      id_empresa: planilla.id_empresa,
      empresa: planilla.empresa
        ? {
            nombre: planilla.empresa.emp_nom,
            tipo: planilla.empresa.tipo,
          }
        : null,  
      com_nro: planilla.com_nro,
      cod_patronal: planilla.cod_patronal,
      mes: planilla.mes,
      gestion: planilla.gestion,
      total_importe: planilla.total_importe,
      total_trabaj: planilla.total_trabaj,
      estado: planilla.estado,
      usuario_creacion: planilla.usuario_creacion,
      fecha_creacion: planilla.fecha_creacion,
      observaciones: planilla.observaciones,
      fecha_planilla: planilla.fecha_planilla,
      fecha_declarada: planilla.fecha_declarada,
      fecha_pago: planilla.fecha_pago,
      aporte_porcentaje: planilla.aporte_porcentaje,
      ufv_dia_formal: planilla.ufv_dia_formal,
      ufv_dia_presentacion: planilla.ufv_dia_presentacion,
      aporte_actualizado: planilla.aporte_actualizado,
      monto_actualizado: planilla.monto_actualizado,
      multa_no_presentacion: planilla.multa_no_presentacion,
      dias_retraso: planilla.dias_retraso,
      intereses: planilla.intereses,
      multa_sobre_intereses: planilla.multa_sobre_intereses,
      total_a_cancelar_parcial: planilla.total_a_cancelar_parcial,
      total_a_cancelar: planilla.total_a_cancelar,
      total_multas: planilla.total_multas,
      total_tasa_interes: planilla.total_tasa_interes,
      total_aportes_asuss: planilla.total_aportes_asuss,
      total_aportes_min_salud: planilla.total_aportes_min_salud,
      nombre_creacion: planilla.nombre_creacion,
      cotizacion_tasa: planilla.cotizacion_tasa,
      tipo_planilla: planilla.tipo_planilla,
      valido_cotizacion: planilla.valido_cotizacion,
      fecha_liquidacion: planilla.fecha_liquidacion,
    };

    return { mensaje: 'Planilla obtenida con éxito', planilla: mappedPlanilla };
  } catch (error) {
    throw new BadRequestException(`Error al obtener la planilla: ${error.message}`);
  }
}
// 7.1 .- (EXEDENTES )OBTENER PLANILLA PARA REGISTRAR EXEDENTES DE LA LIQUIDACION NO CONTIENE CONTROLADOR-------------------------------------------------------------------------------------------------------
async getPlanillaCompleta(id: number): Promise<PlanillasAporte> {
  const planilla = await this.planillaRepo.findOne({
    where: { id_planilla_aportes: id },
  });

  if (!planilla) {
    throw new BadRequestException('Planilla no encontrada');
  }

  return planilla;
}
async actualizarExcedente(id: number, excedente: number, motivo: string) {
  await this.planillaRepo.update(id, {
    excedente,
    motivo_excedente: motivo,
  });
}
// 8.- OBTENER DETALLES DE PLANILLA DE APORTES POR ID DE PLANILLA (TIENE PAGINACION Y BUSQUEDA)-------------------------------------------------------------------------------------------------------
async obtenerDetalles(id_planilla: number, pagina: number = 1, limite: number = 10, busqueda: string = '') {
  try {
    const skip = limite > 0 ? (pagina - 1) * limite : 0;

    // Crear query builder
    const query = this.detalleRepo.createQueryBuilder('detalle')
      .innerJoin('detalle.planilla_aporte', 'planilla')
      .where(
        '(detalle.id_planilla_aportes = :id_planilla OR planilla.id_planilla_origen = :id_planilla)',
        { id_planilla }
      );

    // Añadir condiciones de búsqueda si existe
    if (busqueda && busqueda.trim() !== '') {
      query.andWhere(new Brackets(qb => {
        qb.where('detalle.ci ILIKE :busqueda', { busqueda: `%${busqueda}%` })
          .orWhere('detalle.apellido_paterno ILIKE :busqueda', { busqueda: `%${busqueda}%` })
          .orWhere('detalle.apellido_materno ILIKE :busqueda', { busqueda: `%${busqueda}%` })
          .orWhere('detalle.nombres ILIKE :busqueda', { busqueda: `%${busqueda}%` })
          .orWhere('detalle.cargo ILIKE :busqueda', { busqueda: `%${busqueda}%` });
      }));
    }

    // Selección de campos y ordenamiento
    query
      .orderBy('detalle.nro', 'ASC')
      .select([
        'detalle.id_planilla_aportes_detalles',
        'detalle.id_planilla_aportes',
        'detalle.nro',
        'detalle.ci',
        'detalle.apellido_paterno',
        'detalle.apellido_materno',
        'detalle.nombres',
        'detalle.sexo',
        'detalle.cargo',
        'detalle.fecha_nac',
        'detalle.fecha_ingreso',
        'detalle.fecha_retiro',
        'detalle.dias_pagados',
        'detalle.salario',
        'detalle.regional',
        'detalle.haber_basico',
        'detalle.es_afiliado',
        'detalle.matricula',
        'detalle.tipo_afiliado',
        'detalle.tipo',
      ]);

    // Paginación
    if (limite > 0) {
      query.skip(skip).take(limite);
    }

    // Ejecutar consulta
    const [detalles, total] = await query.getManyAndCount();

    if (!detalles.length) {
      return {
        mensaje: 'No hay detalles registrados para esta planilla',
        detalles: [],
        total: 0,
      };
    }

    return {
      mensaje: 'Detalles obtenidos con éxito',
      id_planilla,
      trabajadores: detalles,
      total,
      pagina,
      limite,
    };
  } catch (error) {
    console.error('Error en obtenerDetalles:', error);
    throw new Error('Error al obtener los detalles de la planilla');
  }
}

// 9.- OBSERVAR DETALLES DE PLANILLA DE APORTES POR REGIONAL -------------------------------------------------------------------------------------------------------
async obtenerDetallesPorRegional(id_planilla: number, regional: string) {
  const detalles = await this.detalleRepo.find({
    where: { id_planilla_aportes: id_planilla, regional },
    order: { nro: 'ASC' },
    select: [
      'id_planilla_aportes_detalles',
      'id_planilla_aportes',
      'nro',
      'ci',
      'apellido_paterno',
      'apellido_materno',
      'nombres',
      'sexo',
      'cargo',
      'fecha_nac',
      'fecha_ingreso',
      'fecha_retiro',
      'dias_pagados',
      'salario',
      'regional'
    ]
  });

  if (!detalles.length) {
    return { mensaje: 'No hay detalles registrados para esta planilla y regional', detalles: [] };
  }

  return {
    mensaje: 'Detalles obtenidos con éxito',
    id_planilla,
    regional,
    trabajadores: detalles
  };
}
// 10.- OBTENER PLANILLAS PENDIENTES O PRESENTADAS ESTADO = 1  -------------------------------------------------------------------------------------------------------
async obtenerPlanillasPendientes() {
  const planillas = await this.planillaRepo.find({
    where: { estado: 1 },
    order: { fecha_creacion: 'DESC' }
  });

  return {
    mensaje: 'Planillas pendientes obtenidas con éxito',
    planillas
  };
}
// 11 .- ACTUALIZAR EL ESTADO DE UNA PLANILLA A PRESENTADO O PENDIENTE = 1 #con notificaciones# -------------------------------------------------------------------------------------------------------
async actualizarEstadoAPendiente(id_planilla: number, fecha_declarada?: string,usuario_procesador?: string, nom_usuario?: string) {
  const meses = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
  ];

  const planilla = await this.planillaRepo.findOne({
    where: { id_planilla_aportes: id_planilla },
    relations: ['empresa'], 
  });

  if (!planilla) {
    throw new BadRequestException('La planilla no existe');
  }

  if (planilla.estado !== 0) {
    throw new BadRequestException('La planilla debe estar en estado Borrador para ser presentada');
  }

  // Actualizar el estado a Pendiente (1)
  planilla.estado = 1;

  // Actualizar fecha_declarada
  planilla.fecha_declarada = fecha_declarada
    ? moment(fecha_declarada).tz('America/La_Paz').toDate()
    : moment().tz('America/La_Paz').toDate();

  // CAMBIO: Para empresas públicas (AP), hacer preliquidación automática
  if (planilla.empresa?.tipo === 'AP' && planilla.fecha_planilla) {
    const fechaPlanilla = new Date(planilla.fecha_planilla);
    
    // Calcular el primer día del mes siguiente como fecha de pago tentativa
    const primerDiaMesSiguiente = new Date(
      fechaPlanilla.getFullYear(),
      fechaPlanilla.getMonth() + 1,
      1
    );
    
    planilla.fecha_pago = primerDiaMesSiguiente;
    
    // NUEVO: Calcular y guardar la preliquidación automáticamente
    try {
      const datosLiquidacion = await this.calcularAportesPreliminar(
        id_planilla, 
        primerDiaMesSiguiente
      );
      
      // Guardar todos los datos de la liquidación
      await this.actualizarPlanillaConLiquidacion(
        id_planilla,
        primerDiaMesSiguiente,
        datosLiquidacion
      );
      
      // Agregar una nota indicando que es una liquidación preliminar
      planilla.observaciones = (planilla.observaciones || '') + 
        '\n[LIQUIDACIÓN PRELIMINAR - Empresa Pública] Fecha de pago tentativa. Actualizar cuando se confirme el pago real.';
      
      console.log(`Liquidación preliminar calculada para empresa pública ${planilla.empresa.emp_nom}`);
    } catch (error) {
      console.error('Error al calcular liquidación preliminar:', error);
      // No lanzar error, permitir que continúe el proceso
    }
  }

  // Guardar los cambios en la planilla
  await this.planillaRepo.save(planilla);

  // Obtener el nombre del mes
  const nombreMes = meses[Number(planilla.mes) - 1];

  // Generar notificación
  const notificacionDto: CreateNotificacioneDto = {
    id_usuario_receptor: 'ADMINISTRADOR_COTIZACIONES', 
    tipo_notificacion: 'PLANILLA_PRESENTADA',
    empresa: planilla.empresa?.emp_nom,
    mensaje: `Planilla Mensual Presentada correspondiente a MES: ${nombreMes}, AÑO: ${planilla.gestion}`,
    id_recurso: planilla.id_planilla_aportes,
    tipo_recurso: 'PLANILLA_APORTES',
    usuario_creacion: usuario_procesador || 'SISTEMA',
    nom_usuario: nom_usuario || 'Sistema Automático',
  };
  
  await this.notificacionesService.crearNotificacion(notificacionDto);

  return { 
    mensaje: 'Estado de la planilla actualizado a Presentado correctamente',
    liquidacion_preliminar: planilla.empresa?.tipo === 'AP' ? true : false
  };
}

// 12 .- ACTUALIZAR METODO PARA APROBAR U OBSERVAR LA PLANILLA (ESTADO 2 o 3)- #con notificaciones# -------------------------------------------------------------------------------------------------------
async actualizarEstadoPlanilla(id_planilla: number, estado: number, observaciones?: string, usuario_procesador?: string, nom_usuario?: string) {
  const meses = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
  ];

  console.log('🔧 Datos recibidos en el servicio:', {
    id_planilla,
    estado,
    observaciones,
    usuario_procesador,
    nom_usuario
  });

  const planilla = await this.planillaRepo.findOne({ 
    where: { id_planilla_aportes: id_planilla },
    relations: ['empresa'],
  });

  if (!planilla) {
    throw new BadRequestException('La planilla no existe');
  }

  // Validar estado válido
  if (![2, 3].includes(estado)) {
    throw new BadRequestException('El estado debe ser 2 (Aprobado) o 3 (Observado)');
  }

  // Actualizar la planilla
  planilla.estado = estado;
  if (estado === 3 && observaciones) {
    planilla.observaciones = observaciones;
  }

  await this.planillaRepo.save(planilla);

  const nombreMes = meses[Number(planilla.mes) - 1];
  const tipoNotificacion = estado === 2 ? 'PLANILLA_APROBADA' : 'PLANILLA_OBSERVADA';
  const mensajeBase = estado === 2 
    ? `Planilla Mensual Aprobada correspondiente a MES: ${nombreMes}, AÑO: ${planilla.gestion}`
    : `Planilla Mensual Observada correspondiente a MES: ${nombreMes}, AÑO: ${planilla.gestion}${observaciones ? ` - Observaciones: ${observaciones}` : ''}`;

  const notificacionDto: CreateNotificacioneDto = {
    id_usuario_receptor: 'COTIZACIONES_EMPRESA',
    tipo_notificacion: tipoNotificacion,
    empresa: planilla.empresa?.emp_nom,
    mensaje: mensajeBase,
    id_recurso: planilla.id_planilla_aportes,
    tipo_recurso: 'PLANILLA_APORTES',
    usuario_creacion: usuario_procesador || 'SISTEMA',
    nom_usuario: nom_usuario || 'Sistema Automático',
  };
  
  console.log('Creando notificación con datos:', notificacionDto);
  
  await this.notificacionesService.crearNotificacion(notificacionDto);

  return { mensaje: 'Estado de la planilla actualizado correctamente' };
}

// 13.-  ELIMINAR DETALLES DE UNA PLANILLA -  -------------------------------------------------------------------------------------------------------
async eliminarDetallesPlanilla(id_planilla: number) {
  const planilla = await this.planillaRepo.findOne({ where: { id_planilla_aportes: id_planilla } });

  if (!planilla) {
      throw new BadRequestException('La planilla no existe.');
  }
  await this.detalleRepo.delete({ id_planilla_aportes: id_planilla });

  return { mensaje: '✅ Detalles de la planilla eliminados con éxito' };
}
// 14 .- OBTENER PLANILLAS DE APORTES OBSERVADAS (ESTADO = 3) -------------------------------------------------------------------------------------------------------
async obtenerPlanillasObservadas(cod_patronal: string) {
  try {
    // Validar parámetro
    if (!cod_patronal || cod_patronal.trim() === '') {
      throw new BadRequestException('El código patronal no puede estar vacío');
    }

    // Normalizar cod_patronal
    const normalizedCodPatronal = cod_patronal.trim().toLowerCase();

    const planillas = await this.planillaRepo.find({
      where: { cod_patronal: normalizedCodPatronal, estado: 3 }, 
      order: { fecha_creacion: 'DESC' },
      relations: ['empresa'], 
    });

    // Mapear los resultados para incluir emp_nom como "empresa"
    const mappedPlanillas = planillas.map(planilla => ({
      id_planilla_aportes: planilla.id_planilla_aportes,
      com_nro: planilla.com_nro,
      cod_patronal: planilla.cod_patronal,
      empresa: planilla.empresa ? planilla.empresa.emp_nom : null,
      mes: planilla.mes,
      gestion: planilla.gestion,
      total_importe: planilla.total_importe,
      total_trabaj: planilla.total_trabaj,
      estado: planilla.estado,
      observaciones: planilla.observaciones,
      fecha_creacion: planilla.fecha_creacion,
      
    }));

    if (!planillas.length) {
      return { mensaje: 'No hay planillas observadas para este código patronal', planillas: [] };
    }

    return {
      mensaje: 'Planillas observadas obtenidas con éxito',
      planillas: mappedPlanillas,
    };
  } catch (error) {
    throw new BadRequestException(`Error al obtener las planillas observadas: ${error.message}`);
  }
}

// 15 .- MANDAR CORREGIDA PLANILLA DE APORTES OBSERVADA A ADMINSTRADOR CBES CUANDO (ESTADO = 3) #con notificaciones# --------------------------------------------------------------------------------------------------------
async corregirPlanilla(id_planilla: number, data: any) {
  const meses = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
  ];

  const planilla = await this.planillaRepo.findOne({ 
    where: { id_planilla_aportes: id_planilla },
    relations: ['empresa'],
  });

  if (!planilla) {
    throw new BadRequestException('La planilla no existe');
  }

  if (planilla.estado !== 3) {
    throw new BadRequestException('Solo se pueden corregir planillas observadas');
  }

  // Calcular el total de los salarios de los trabajadores corregidos
  const totalImporteCalculado = data.trabajadores.reduce((sum, row) => sum + parseFloat(row.salario || 0), 0);

  // Actualizar la planilla
  planilla.total_importe = totalImporteCalculado;
  planilla.estado = 1; // Cambia a estado "Presentado" (1) para nueva revisión
  planilla.observaciones = null;
  if (data.fecha_planilla) {
    planilla.fecha_planilla = new Date(data.fecha_planilla);
  }

  await this.planillaRepo.save(planilla);

  // Eliminar los registros antiguos
  await this.detalleRepo.delete({ id_planilla_aportes: id_planilla });

  // Guardar los nuevos registros corregidos
  const nuevosDetalles = data.trabajadores.map((row) => {
    const parseExcelDate = (dateValue: any): Date | null => {
      if (!dateValue || isNaN(Number(dateValue))) {
        return null;
      }
      return new Date(1900, 0, Number(dateValue) - 1);
    };

    const parseISODate = (dateString: string): Date | null => {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? null : date;
    };

    const fechaNac = row.fecha_nac
      ? parseISODate(row.fecha_nac) || parseExcelDate(row['Fecha de nacimiento'])
      : null;
    const fechaIngreso = row.fecha_ingreso
      ? parseISODate(row.fecha_ingreso) || parseExcelDate(row['Fecha de ingreso'])
      : null;
    const fechaRetiro = row.fecha_retiro
      ? parseISODate(row.fecha_retiro) || parseExcelDate(row['Fecha de retiro'])
      : null;

    return {
      id_planilla_aportes: id_planilla,
      nro: row.nro || row['Nro.'],
      ci: row.ci || row['Número documento de identidad'],
      apellido_paterno: row.apellido_paterno || row['Apellido Paterno'],
      apellido_materno: row.apellido_materno || row['Apellido Materno'],
      nombres: row.nombres || row['Nombres'],
      sexo: row.sexo || row['Sexo (M/F)'],
      cargo: row.cargo || row['Cargo'],
      fecha_nac: fechaNac,
      fecha_ingreso: fechaIngreso,
      fecha_retiro: fechaRetiro,
      dias_pagados: row.dias_pagados || row['Días pagados'] || 0,
      haber_basico: parseFloat(row.haber_basico || row['Haber Básico'] || '0'),
      bono_antiguedad: parseFloat(row.bono_antiguedad || row['Bono de antigüedad'] || '0'),
      monto_horas_extra: parseFloat(row.monto_horas_extra || row['Monto horas extra'] || '0'),
      monto_horas_extra_nocturnas: parseFloat(row.monto_horas_extra_nocturnas || row['Monto horas extra nocturnas'] || '0'),
      otros_bonos_pagos: parseFloat(row.otros_bonos_pagos || row['Otros bonos y pagos'] || '0'),
      salario: parseFloat(row.salario || '0'),
      regional: row.regional || row['regional'],
    };
  });

  await this.detalleRepo.save(nuevosDetalles);

  // 🔧 GENERAR NOTIFICACIÓN CON DATOS DEL USUARIO QUE CORRIGE
  const nombreMes = meses[Number(planilla.mes) - 1];
  const notificacionDto: CreateNotificacioneDto = {
    id_usuario_receptor: 'ADMINISTRADOR_COTIZACIONES',
    tipo_notificacion: 'PLANILLA_CORREGIDA',
    empresa: planilla.empresa?.emp_nom,
    mensaje: `Planilla Mensual Corregida correspondiente a MES: ${nombreMes}, AÑO: ${planilla.gestion}`,
    id_recurso: planilla.id_planilla_aportes,
    tipo_recurso: 'PLANILLA_APORTES',
    usuario_creacion: data.usuario_procesador || planilla.usuario_creacion || 'SISTEMA',
    nom_usuario: data.nom_usuario || planilla.nombre_creacion || 'Usuario Sistema',
  };
  
  await this.notificacionesService.crearNotificacion(notificacionDto);

  return { mensaje: 'Planilla corregida y reenviada para validación', total_importe: totalImporteCalculado };
}
// 16.-  OBTENER DETALLES DE PLANILLA POR MES Y GESTION -------------------------------------------------------------------------------------------------------
async obtenerDetallesDeMes(cod_patronal: string, mes: string, gestion: string) {
  const fechaPlanilla = new Date(`${gestion}-${mes.padStart(2, '0')}-01`);
  
  // 1. Buscar la planilla mensual
  const planillaMensual = await this.planillaRepo.findOne({
    where: { 
      cod_patronal, 
      fecha_planilla: fechaPlanilla,
      tipo_planilla: 'Mensual'
    },
  });

  if (!planillaMensual) {
    throw new BadRequestException('No existe planilla mensual para el mes y gestión solicitados.');
  }

  // 2. Buscar todas las planillas adicionales relacionadas
  const planillasAdicionales = await this.planillaRepo.find({
    where: { 
      id_planilla_origen: planillaMensual.id_planilla_aportes 
    },
  });

  // 3. Obtener IDs de todas las planillas (mensual + adicionales)
  const idsToCheck = [
    planillaMensual.id_planilla_aportes,
    ...planillasAdicionales.map(p => p.id_planilla_aportes)
  ];

  console.log(`📋 Obteniendo detalles para ${cod_patronal} - ${mes}/${gestion}:`);
  console.log(`   - Planilla mensual: ${planillaMensual.id_planilla_aportes}`);
  console.log(`   - Planillas adicionales: ${planillasAdicionales.length} encontradas`);
  console.log(`   - IDs a consultar: ${idsToCheck.join(', ')}`);

  // 4. Obtener todos los detalles consolidados
  const detalles = await this.detalleRepo.find({
    where: { 
      id_planilla_aportes: In(idsToCheck) 
    },
    order: { nro: 'ASC' },
  });

  console.log(`   - Total detalles encontrados: ${detalles.length}`);

  return detalles;
}
// 17.3.- Método para comparar planillas de dos meses y detectar altas y bajas 3 version-------------------------------------------------------------------------------------------------------
async compararPlanillas(cod_patronal: string, mesAnterior: string, gestion: string, mesActual: string) {
  // Convertir los meses a números
  const mesAnteriorNum = parseInt(mesAnterior, 10);
  const mesActualNum = parseInt(mesActual, 10);

  // Validar que los meses sean válidos (entre 1 y 12)
  if (mesAnteriorNum < 1 || mesAnteriorNum > 12 || mesActualNum < 1 || mesActualNum > 12) {
    throw new BadRequestException('El mes debe ser un número entre 1 y 12.');
  }

  // Si el mes anterior es diciembre, restar un año a la gestión
  const gestionMesAnterior = mesAnteriorNum === 12 ? (parseInt(gestion) - 1).toString() : gestion;

  console.log(`🔍 Comparando planillas (INCLUYENDO ADICIONALES) para:
    - Cod Patronal: ${cod_patronal}
    - Gestión Mes Anterior: ${gestionMesAnterior}
    - Mes Anterior: ${mesAnterior} (${mesAnteriorNum})
    - Gestión Mes Actual: ${gestion}
    - Mes Actual: ${mesActual} (${mesActualNum})`);

  // Convertir mes y gestión a fecha_planilla (primer día del mes)
  const fechaPlanillaMesAnterior = new Date(`${gestionMesAnterior}-${mesAnteriorNum.toString().padStart(2, '0')}-01`);
  const fechaPlanillaMesActual = new Date(`${gestion}-${mesActualNum.toString().padStart(2, '0')}-01`);

  // Validar que las fechas sean válidas
  if (isNaN(fechaPlanillaMesAnterior.getTime())) {
    throw new BadRequestException(`Fecha de planilla no válida para el mes anterior: ${gestionMesAnterior}-${mesAnteriorNum}`);
  }
  if (isNaN(fechaPlanillaMesActual.getTime())) {
    throw new BadRequestException(`Fecha de planilla no válida para el mes actual: ${gestion}-${mesActualNum}`);
  }

  // CAMBIO PRINCIPAL: Ahora obtiene TODOS los detalles (mensual + adicionales)
  const detallesMesAnterior = await this.obtenerDetallesDeMes(cod_patronal, mesAnteriorNum.toString(), gestionMesAnterior);
  const detallesMesActual = await this.obtenerDetallesDeMes(cod_patronal, mesActualNum.toString(), gestion);

  console.log(`📊 Datos consolidados obtenidos:
    - Mes anterior: ${detallesMesAnterior.length} trabajadores (mensual + adicionales)
    - Mes actual: ${detallesMesActual.length} trabajadores (mensual + adicionales)`);

  // Validar si hay datos en ambos meses
  if (!detallesMesAnterior || detallesMesAnterior.length === 0) {
    throw new Error(`No se encontraron datos para el mes anterior (${mesAnterior}) en la gestión ${gestionMesAnterior}.`);
  }

  if (!detallesMesActual || detallesMesActual.length === 0) {
    throw new Error(`No se encontraron datos para el mes actual (${mesActual}) en la gestión ${gestion}.`);
  }

  const altas = [];
  const bajasNoEncontradas = [];
  const bajasPorRetiro = [];

  // Crear un mapa de los trabajadores del mes anterior basado en su CI
  const trabajadoresMesAnterior = new Map(
    detallesMesAnterior.map((trabajador) => [trabajador.ci, trabajador]),
  );

  // Crear un mapa de los trabajadores del mes actual basado en su CI
  const trabajadoresMesActual = new Map(
    detallesMesActual.map((trabajador) => [trabajador.ci, trabajador]),
  );

  // Definir el rango del mes actual para las fechas de ingreso y retiro
  const mesActualInicio = new Date(`${gestion}-${mesActualNum.toString().padStart(2, '0')}-01`);
  const mesActualFin = new Date(mesActualInicio);
  mesActualFin.setMonth(mesActualFin.getMonth() + 1);

  // Definir el rango del mes anterior para las fechas de retiro
  const mesAnteriorInicio = new Date(`${gestionMesAnterior}-${mesAnteriorNum.toString().padStart(2, '0')}-01`);
  const mesAnteriorFin = new Date(mesAnteriorInicio);
  mesAnteriorFin.setMonth(mesAnteriorFin.getMonth() + 1);

// Detectar altas basadas en ausencia en el mes anterior o reingreso
detallesMesActual.forEach((trabajadorActual) => {
  console.log(`👤 Analizando trabajador ${trabajadorActual.ci}`);

  // Verificar si el trabajador no estaba en el mes anterior
  const trabajadorAnterior = trabajadoresMesAnterior.get(trabajadorActual.ci);
  if (!trabajadorAnterior) {
    console.log(`   ✅ ALTA detectada (nuevo trabajador)`);
    altas.push(trabajadorActual);
  } else if (trabajadorAnterior.fecha_retiro) {
    // Si estaba en el mes anterior pero tenía fecha de retiro, verificar reingreso
    const fechaRetiroAnterior = new Date(trabajadorAnterior.fecha_retiro);
    console.log(`   ↳ Tenía fecha de retiro anterior: ${fechaRetiroAnterior}`);

    // Considerar alta si la fecha de retiro es anterior o igual al fin del mes anterior
    if (fechaRetiroAnterior <= mesAnteriorFin) {
      console.log(`   ✅ ALTA detectada (reingreso)`);
      altas.push(trabajadorActual);
    }
  }
});

// Detectar bajas por retiro
detallesMesActual.forEach((trabajadorActual) => {
  if (trabajadorActual.fecha_retiro) {
    const fechaRetiroActual = new Date(trabajadorActual.fecha_retiro);
    console.log(`👤 Analizando retiro - trabajador ${trabajadorActual.ci}: Fecha de retiro: ${fechaRetiroActual}`);
    if (fechaRetiroActual >= mesActualInicio && fechaRetiroActual < mesActualFin) {
      console.log(`   ❌ BAJA por retiro detectada`);
      bajasPorRetiro.push(trabajadorActual);
    }
  }
});

// Detectar bajas por no encontrado
detallesMesAnterior.forEach((trabajadorAnterior) => {
  if (!trabajadoresMesActual.has(trabajadorAnterior.ci)) {
    console.log(`👤 BAJA por no encontrado - trabajador ${trabajadorAnterior.ci}`);
    bajasNoEncontradas.push(trabajadorAnterior);
  }
});

  console.log(`
📈 RESUMEN DE COMPARACIÓN (INCLUYENDO ADICIONALES):
   ✅ Altas detectadas: ${altas.length}
   ❌ Bajas por trabajador no encontrado: ${bajasNoEncontradas.length}
   ❌ Bajas por fecha de retiro: ${bajasPorRetiro.length}
  `);

  return {
    altas,
    bajas: {
      noEncontradas: bajasNoEncontradas,
      porRetiro: bajasPorRetiro,
    },
    resumen: {
      totalTrabajadoresMesAnterior: detallesMesAnterior.length,
      totalTrabajadoresMesActual: detallesMesActual.length,
      totalAltas: altas.length,
      totalBajas: bajasNoEncontradas.length + bajasPorRetiro.length
    },
    mensaje: 'Comparación de planillas completada incluyendo planillas adicionales.',
  };
}
// ?
async obtenerEstadisticasPlanillaMes(cod_patronal: string, mes: string, gestion: string) {
  const fechaPlanilla = new Date(`${gestion}-${mes.padStart(2, '0')}-01`);
  
  // Buscar planilla mensual
  const planillaMensual = await this.planillaRepo.findOne({
    where: { 
      cod_patronal, 
      fecha_planilla: fechaPlanilla,
      tipo_planilla: 'Mensual'
    },
  });

  if (!planillaMensual) {
    return {
      existePlanilla: false,
      mensaje: 'No existe planilla mensual para el período solicitado'
    };
  }

  // Buscar planillas adicionales
  const planillasAdicionales = await this.planillaRepo.find({
    where: { 
      id_planilla_origen: planillaMensual.id_planilla_aportes 
    },
  });

  // Obtener detalles consolidados
  const idsToCheck = [
    planillaMensual.id_planilla_aportes,
    ...planillasAdicionales.map(p => p.id_planilla_aportes)
  ];

  const totalDetalles = await this.detalleRepo.count({
    where: { 
      id_planilla_aportes: In(idsToCheck) 
    }
  });

  return {
    existePlanilla: true,
    planillaMensual: {
      id: planillaMensual.id_planilla_aportes,
      totalImporte: planillaMensual.total_importe,
      totalTrabajadores: planillaMensual.total_trabaj,
      estado: planillaMensual.estado
    },
    planillasAdicionales: planillasAdicionales.map(p => ({
      id: p.id_planilla_aportes,
      totalImporte: p.total_importe,
      totalTrabajadores: p.total_trabaj,
      estado: p.estado
    })),
    consolidado: {
      totalPlanillas: 1 + planillasAdicionales.length,
      totalTrabajadoresConsolidado: totalDetalles,
      totalImporteConsolidado: planillaMensual.total_importe // Ya está actualizado con las adicionales
    }
  };
}


//* 18.-  Método para generar el reporte de bajas con Carbone -------------------------------------------------------------------------------------------------------
async generarReporteBajas(id_planilla: number,cod_patronal: string): Promise<StreamableFile> {
  try {
    // Obtener la información de la planilla
    const resultadoPlanilla = await this.obtenerPlanilla(id_planilla);
    const planilla = resultadoPlanilla.planilla;

    // Extraer fecha_planilla y calcular mesActual, mesAnterior y gestion
    const fechaPlanilla = new Date(planilla.fecha_planilla); // Asumimos que planilla ahora tiene fecha_planilla
    const gestion = fechaPlanilla.getFullYear().toString(); // Ejemplo: "2024"
    const mesActual = String(fechaPlanilla.getMonth() + 1).padStart(2, '0'); // 1-based: "02" para febrero

    // Calcular mes anterior
    const fechaAnterior = new Date(fechaPlanilla);
    fechaAnterior.setMonth(fechaAnterior.getMonth() - 1);
    const mesAnterior = String(fechaAnterior.getMonth() + 1).padStart(2, '0'); // 1-based: "01" para enero
    const gestionAnterior = fechaAnterior.getFullYear().toString(); // Podría ser diferente si cruza el año

    // Obtener las bajas para los meses comparados
    const { bajas } = await this.compararPlanillas(
      cod_patronal,
      mesAnterior,
      gestionAnterior,
      mesActual
    );

    // Verificar si hay bajas
    if (bajas.noEncontradas.length === 0 && bajas.porRetiro.length === 0) {
      throw new Error('No se encontraron bajas para generar el reporte.');
    }

    // Agrupar las bajas por regional
    const bajasPorRegional = [...bajas.noEncontradas, ...bajas.porRetiro].reduce((acc, baja) => {
      const regional = baja.regional || 'Sin regional';
      if (!acc[regional]) {
        acc[regional] = {
          regional,
          bajas: [],
        };
      }
      acc[regional].bajas.push({
        nro: baja.nro,
        ci: baja.ci,
        nombreCompleto: `${baja.apellido_paterno} ${baja.apellido_materno} ${baja.nombres}`,
        cargo: baja.cargo,
        salario: baja.salario,
        fechaRetiro: baja.fecha_retiro ? new Date(baja.fecha_retiro).toLocaleDateString() : 'No especificada',
      });
      return acc;
    }, {});

    // Datos para el reporte
    const data = {
      planilla: {
        com_nro: planilla.com_nro,
        cod_patronal: planilla.cod_patronal,
        /* empresa: planilla.empresa, */
        mes: mesActual, // Usamos el mes calculado
        gestion: gestion, // Usamos la gestión calculada
        total_trabaj: planilla.total_trabaj,
        total_importe: planilla.total_importe,
        estado: planilla.estado,
        fecha_creacion: planilla.fecha_creacion,
        usuario_creacion: planilla.usuario_creacion,
      },
      reporte: Object.values(bajasPorRegional),
    };

    console.log('Datos para el reporte:', JSON.stringify(data, null, 2));

    // Ruta de la plantilla de reporte
    const templatePath = path.resolve(
      'src/modules/planillas_aportes/templates/bajas.docx',
    );

    // Generar el reporte con Carbone
    return new Promise<StreamableFile>((resolve, reject) => {
      carbone.render(
        templatePath,
        data,
        { convertTo: 'pdf' },
        (err, result) => {
          if (err) {
            console.error('Error en Carbone:', err);
            return reject(new Error(`Error al generar el reporte con Carbone: ${err}`));
          }

          console.log('Reporte generado correctamente');

          if (typeof result === 'string') {
            result = Buffer.from(result, 'utf-8');
          }

          resolve(new StreamableFile(result, {
            type: 'application/pdf',
            disposition: `attachment; filename=reporte_bajas_${cod_patronal}_${mesAnterior}_${mesActual}_${gestion}.pdf`,
          }));
        }
      );
    });
  } catch (error) {
    throw new Error('Error en generarReporteBajas: ' + error.message);
  }
}

// 19.- Método para generar REPORTE POR REGIONAL RESUMEN -------------------------------------------------------------------------------------------------------
/* async generarReportePlanillaPorRegional(id_planilla: number): Promise<StreamableFile> {
  try {
    // Obtener la información de la planilla y sus detalles
    const resultadoPlanilla = await this.obtenerPlanilla(id_planilla);
    const detallesPlanilla = await this.obtenerDetalles(id_planilla);

    if (!detallesPlanilla.trabajadores.length) {
      throw new Error('No se encontraron trabajadores para generar el reporte.');
    }

    const planilla = resultadoPlanilla.planilla;


    let totalCantidad = 0;
    let totalGanado = 0;

    // Agrupar los datos por regional
    const regionalesMap = new Map();

    detallesPlanilla.trabajadores.forEach(trabajador => {
      const { regional, salario } = trabajador;
      const salarioNum = parseFloat(salario.toString()); // Asegurar conversión a número

      if (!regionalesMap.has(regional)) {
        regionalesMap.set(regional, {
          regional,
          cantidad: 0,
          total_ganado: 0,
          porcentaje_10: 0
        });
      }

      const regionalData = regionalesMap.get(regional);
      regionalData.cantidad += 1;
      regionalData.total_ganado += salarioNum;
      regionalData.porcentaje_10 = parseFloat((regionalData.total_ganado * 0.10).toFixed(2)); // Redondeamos a 2 decimales

      totalCantidad += 1;
      totalGanado += salarioNum;
    });

    // Convertir el mapa a un array
    const resumenArray = Array.from(regionalesMap.values());

    // Crear la sección de totales separada
    const totales = {
      cantidad_total: totalCantidad,
      total_ganado: parseFloat(totalGanado.toFixed(2)),
      porcentaje_10: parseFloat((totalGanado * 0.10).toFixed(2))
    };

    // **Formato Correcto: Separar miles con coma y decimales con punto**
    const formatNumber = (num: number) => new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);

    // Aplicamos formato a todos los valores numéricos
    const formattedResumen = resumenArray.map(region => ({
      regional: region.regional,
      cantidad: formatNumber(region.cantidad),
      total_ganado: formatNumber(region.total_ganado),  
      porcentaje_10: formatNumber(region.porcentaje_10) 
    }));

    const formattedTotales = {
      cantidad_total: formatNumber(totales.cantidad_total),  
      total_ganado: formatNumber(totales.total_ganado),  
      porcentaje_10: formatNumber(totales.porcentaje_10)  
    };

    const data = {
      mensaje: 'Detalles obtenidos con éxito',
      planilla: planilla,
      resumen: formattedResumen,
      totales: formattedTotales
    };

    console.log('Datos para el reporte:', JSON.stringify(data, null, 2));

    const templatePath = path.resolve(
      'src/modules/planillas_aportes/templates/resumen.docx',
    );

    return new Promise<StreamableFile>((resolve, reject) => {
      carbone.render(
        templatePath,
        data, 
        { convertTo: 'pdf' },
        (err, result) => {
          if (err) {
            console.error('Error en Carbone:', err);
            return reject(new Error(`Error al generar el reporte con Carbone: ${err}`));
          }

          console.log('Reporte generado correctamente');

          if (typeof result === 'string') {
            result = Buffer.from(result, 'utf-8'); 
          }

          resolve(new StreamableFile(result, {
            type: 'application/pdf',
            disposition: `attachment; filename=reporte_planilla_${planilla.cod_patronal}_${planilla.mes}_${planilla.gestion}.pdf`,
          }));
        }
      );
    });
  } catch (error) {
    throw new Error('Error en generarReportePlanillaPorRegional: ' + error.message);
  }
} */
 
// 20 .- Metodo para obtener los datos de la planilla por regional (se usa en la parte de resumen de planilla para mostrar al empleador y administrador) 
async obtenerDatosPlanillaPorRegional(id_planilla: number): Promise<any> {
  try {
    console.log('🔍 Obteniendo planilla y detalles para id_planilla:', id_planilla);

    const resultadoPlanilla = await this.obtenerPlanilla(id_planilla);
    console.log('✅ Planilla obtenida:', resultadoPlanilla.planilla);

    const detallesPlanilla = await this.obtenerDetalles(id_planilla, 1, 0);
    console.log('👥 Trabajadores obtenidos:', detallesPlanilla.trabajadores.length);

    if (!detallesPlanilla.trabajadores.length) {
      throw new Error('No se encontraron trabajadores para los datos de la planilla.');
    }

    const planilla = resultadoPlanilla.planilla;

    // Validar tipo de empresa y tasa
    const tipoEmpresa = planilla?.empresa?.tipo?.toUpperCase();
    console.log('🏢 Tipo de empresa:', tipoEmpresa);

    if (!['PA', 'AP', 'AV', 'VA'].includes(tipoEmpresa)) {
      throw new Error(`Tipo de empresa no válido: ${tipoEmpresa}`);
    }

    const tasaCotizacion = tipoEmpresa === 'PA' ? 0.03 : 0.10;
    console.log('📊 Tasa de cotización usada:', tasaCotizacion);

    // Variables para resumen
    let totalCantidad = 0;
    let totalGanado = 0;
    const regionalesMap = new Map();

    detallesPlanilla.trabajadores.forEach((trabajador) => {
      const { regional, salario } = trabajador;
      const salarioNum = parseFloat(salario.toString());

      if (!regionalesMap.has(regional)) {
        regionalesMap.set(regional, {
          regional,
          cantidad: 0,
          total_ganado: 0,
          cotizacion: 0
        });
      }

      const regionData = regionalesMap.get(regional);
      regionData.cantidad += 1;
      regionData.total_ganado += salarioNum;
      regionData.cotizacion = parseFloat((regionData.total_ganado * tasaCotizacion).toFixed(2));

      totalCantidad += 1;
      totalGanado += salarioNum;
    });

    const resumenArray = Array.from(regionalesMap.values());

    console.log('📋 Resumen por regional:', resumenArray);
    console.log('📦 Totales generales antes de formatear:', {
      cantidad_total: totalCantidad,
      total_ganado: totalGanado,
      cotizacion: totalGanado * tasaCotizacion,
    });

    const formatNumber = (num: number) => new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);

    const formattedResumen = resumenArray.map(region => ({
      regional: region.regional,
      cantidad: formatNumber(region.cantidad),
      total_ganado: formatNumber(region.total_ganado),
      cotizacion: formatNumber(region.cotizacion)
    }));

    const formattedTotales = {
      cantidad_total: formatNumber(totalCantidad),
      total_ganado: formatNumber(totalGanado),
      cotizacion: formatNumber(totalGanado * tasaCotizacion)
    };

    console.log('✅ Resumen formateado:', formattedResumen);
    console.log('✅ Totales formateados:', formattedTotales);

    return {
      mensaje: 'Detalles obtenidos con éxito',
      planilla,
      resumen: formattedResumen,
      totales: formattedTotales
    };

  } catch (error) {
    console.error('❌ Error en obtenerDatosPlanillaPorRegional:', error.message);
    throw new Error('Error en obtenerDatosPlanillaPorRegional: ' + error.message);
  }
}

// 21 ACTUALIZAR FECHA PAGO EN PLANILLA APORTE --------------------------------------------------------------------------------------------------------------------------------------------------------------
async actualizarFechaPago(idPlanilla: number, fechaPago: Date): Promise<void> {
  const planilla = await this.planillaRepo.findOne({
    where: { id_planilla_aportes: idPlanilla }
  });

  if (!planilla) {
    throw new BadRequestException('Planilla no encontrada');
  }

  planilla.fecha_pago = fechaPago;
  await this.planillaRepo.save(planilla);
}
// 22.-  Función para consultar la API del Banco Central y obtener el UFV de una fecha específica -------------------------------------------------------------------------------------------------------
async getUfvForDate(fecha: Date): Promise<number> {
  // Normalizar la fecha para evitar problemas de zona horaria
  const year = fecha.getUTCFullYear();
  const month = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const day = String(fecha.getUTCDate()).padStart(2, '0');
  const formattedDate = `${year}/${month}/${day}`;

  console.log(`Consultando UFV para la fecha: ${formattedDate}`);

  try {
    const response = await firstValueFrom(
      this.httpService.get(
        `https://www.bcb.gob.bo/librerias/charts/ufv.php?cFecIni=${formattedDate}&cFecFin=${formattedDate}`,
      ),
    );

    const data = response.data;
    if (!Array.isArray(data) || data.length === 0) {
      throw new BadRequestException(`No se encontró UFV para la fecha ${formattedDate}`);
    }

    const ufv = parseFloat(data[0].val_ufv);
    if (isNaN(ufv)) {
      throw new BadRequestException(`El valor de UFV para la fecha ${formattedDate} no es válido`);
    }

    return ufv;
  } catch (error) {
    throw new BadRequestException(`Error al consultar el UFV para la fecha ${formattedDate}: ${error.message}`);
  }
}

// 23 .- Función para calcular los aportes  -------------------------------------------------------------------------------------------------------
async calcularAportes(idPlanilla: number): Promise<any> {
  try {
    if (!idPlanilla || idPlanilla < 1) {
      throw new BadRequestException('El ID de la planilla debe ser un número positivo');
    }

    const planilla = await this.planillaRepo.findOne({
      where: { id_planilla_aportes: idPlanilla },
      relations: ['empresa'],
    });

    if (!planilla) {
      throw new BadRequestException('Planilla no encontrada');
    }

    if (!planilla.fecha_declarada || !planilla.fecha_pago || !planilla.fecha_planilla) {
      throw new BadRequestException('Faltan fechas requeridas para calcular los aportes');
    }

    const adjustToBoliviaTime = (date: Date): Date => {
      return moment(date).tz('America/La_Paz').toDate();
    };

    const fechaPlanillaBolivia = new Date(planilla.fecha_planilla);
    const fechaDeclaradaBolivia = adjustToBoliviaTime(new Date(planilla.fecha_declarada));
    const fechaPagoBolivia = adjustToBoliviaTime(new Date(planilla.fecha_pago));

    const getFechaLimite = (fechaPlanilla: Date): Date => {
      const baseDate = new Date(fechaPlanilla);
      baseDate.setUTCHours(0, 0, 0, 0); 
      baseDate.setUTCMonth(baseDate.getUTCMonth() + 2, 0); 
      return adjustToBoliviaTime(baseDate);
    };

    const fechaLimite = getFechaLimite(fechaPlanillaBolivia);

    const tipoEmpresa = planilla.empresa?.tipo;
    if (!tipoEmpresa) {
      throw new BadRequestException('No se pudo determinar el tipo de empresa');
    }

    const tipo = tipoEmpresa.toUpperCase();
    let aportePorcentaje: number;
    let tasaPorcentaje: number;

    const totalImporte = parseFloat(planilla.total_importe as any) || 0;

    if (tipo === 'PA') {
      aportePorcentaje = totalImporte * 0.03;
      tasaPorcentaje = 0.03;
    } else if (tipo === 'AP' || tipo === 'AV' || tipo === 'VA') {
      aportePorcentaje = totalImporte * 0.1;
      tasaPorcentaje = 0.1;
    } else {
      throw new BadRequestException(`Tipo de empresa no válido: ${tipoEmpresa}`);
    }

    const fechaDeclaradaForUfv = new Date(fechaDeclaradaBolivia);
    fechaDeclaradaForUfv.setHours(0, 0, 0, 0);
    const ufvDiaFormal = await this.getUfvForDate(fechaDeclaradaForUfv);

    const fechaPagoForUfv = new Date(fechaPagoBolivia);
    fechaPagoForUfv.setDate(fechaPagoForUfv.getDate() - 1);
    fechaPagoForUfv.setHours(0, 0, 0, 0);
    const ufvDiaPresentacion = await this.getUfvForDate(fechaPagoForUfv);

    const calculoAporteActualizado = (aportePorcentaje / ufvDiaFormal) * ufvDiaPresentacion;
    const aporteActualizado = calculoAporteActualizado < aportePorcentaje ? aportePorcentaje : calculoAporteActualizado;

    const montoActualizado = Math.max(0, aporteActualizado - aportePorcentaje);

    const fechaDeclaradaNormalized = new Date(fechaDeclaradaBolivia);
    fechaDeclaradaNormalized.setHours(0, 0, 0, 0);
    const fechaLimiteNormalized = new Date(fechaLimite);
    fechaLimiteNormalized.setHours(0, 0, 0, 0);
    const multaNoPresentacion = fechaDeclaradaNormalized > fechaLimiteNormalized ? aportePorcentaje * 0.01 : 0;

    const fechaPagoNormalized = new Date(fechaPagoBolivia);
    fechaPagoNormalized.setHours(0, 0, 0, 0);
    const fechaInicioRetraso = new Date(fechaLimite);
    fechaInicioRetraso.setHours(0, 0, 0, 0);
    let diasRetraso = 0;
    if (fechaPagoNormalized > fechaInicioRetraso) {
      const diferenciaEnMilisegundos = fechaPagoNormalized.getTime() - fechaInicioRetraso.getTime();
      diasRetraso = Math.ceil(diferenciaEnMilisegundos / (1000 * 60 * 60 * 24));
    }

    const intereses = (aporteActualizado * 0.0999 / 360) * diasRetraso;
    const multaSobreIntereses = intereses * 0.1;

    const totalACancelarParcial =
      aportePorcentaje + montoActualizado + multaNoPresentacion + intereses + multaSobreIntereses;

    const totalMultas = multaNoPresentacion + multaSobreIntereses;
    const totalTasaInteres = intereses;

    let formds08 = tipo === 'AV' ? 5 : 0;
    let totalACancelar = totalACancelarParcial + formds08;

    // CAMBIO: Aplicar automáticamente el descuento del 5% para empresas públicas
    let totalDeducciones = 0;
    let descuentoMinSalud = 0;
    
    if (tipo === 'AP') {
      // Solo empresas públicas tienen el descuento del Ministerio de Salud
      descuentoMinSalud = aportePorcentaje * 0.05;
      totalDeducciones += descuentoMinSalud;
    }

    const otrosDescuentos = parseFloat(planilla.otros_descuentos as any) || 0;
    totalDeducciones += otrosDescuentos;

    totalACancelar = totalACancelar - totalDeducciones;

    // ✅ Asignar a planilla
    planilla.aporte_porcentaje = aportePorcentaje;
    planilla.ufv_dia_formal = ufvDiaFormal;
    planilla.ufv_dia_presentacion = ufvDiaPresentacion;
    planilla.aporte_actualizado = aporteActualizado;
    planilla.monto_actualizado = montoActualizado;
    planilla.multa_no_presentacion = multaNoPresentacion;
    planilla.dias_retraso = diasRetraso;
    planilla.intereses = intereses;
    planilla.multa_sobre_intereses = multaSobreIntereses;
    planilla.total_a_cancelar_parcial = totalACancelarParcial;
    planilla.total_multas = totalMultas;
    planilla.total_tasa_interes = totalTasaInteres;
    planilla.total_a_cancelar = totalACancelar;
    planilla.total_aportes_asuss = aportePorcentaje * 0.005;
    planilla.total_aportes_min_salud = descuentoMinSalud;
    planilla.total_deducciones = totalDeducciones;
    planilla.aplica_descuento_min_salud = tipo === 'AP'; // Actualizar este campo

    // 🔄 Guardar cambios
    const resultado = await this.planillaRepo.save(planilla);
    console.log('Planilla guardada:', resultado);

    return {
      total_importe: totalImporte,
      aporte_porcentaje: aportePorcentaje,
      ufv_dia_formal: ufvDiaFormal,
      ufv_dia_presentacion: ufvDiaPresentacion,
      fecha_declarada: planilla.fecha_declarada,
      fecha_pago: planilla.fecha_pago,
      aporte_actualizado: aporteActualizado,
      monto_actualizado: montoActualizado,
      multa_no_presentacion: multaNoPresentacion,
      dias_retraso: diasRetraso,
      intereses,
      multa_sobre_intereses: multaSobreIntereses,
      total_a_cancelar_parcial: totalACancelarParcial,
      total_multas: totalMultas,
      total_tasa_interes: totalTasaInteres,
      formds08,
      total_deducciones: totalDeducciones,
      descuento_min_salud: descuentoMinSalud,
      otros_descuentos: otrosDescuentos,
      total_a_cancelar: totalACancelar,
      tasa_porcentaje: tasaPorcentaje,
      tipo_empresa: tipo,
      aplica_descuento_min_salud: tipo === 'AP',
      ley_descuento_min_salud: tipo === 'AP' ? 'LEY 2042' : null,
    };
  } catch (error) {
    throw new BadRequestException(`Error al calcular los aportes: ${error.message}`);
  }
}

// 24 .- calcular aportes con fecha pago -------------------------------------------------------------------------------------------------------
async calcularAportesPreliminar(idPlanilla: number, fechaPagoPropuesta: Date): Promise<any> {
  try {
    if (!idPlanilla || idPlanilla < 1) {
      throw new BadRequestException('El ID de la planilla debe ser un número positivo');
    }

    if (!fechaPagoPropuesta || isNaN(fechaPagoPropuesta.getTime())) {
      throw new BadRequestException('La fecha de pago propuesta debe ser una fecha válida');
    }

    const planilla = await this.planillaRepo.findOne({
      where: { id_planilla_aportes: idPlanilla },
      relations: ['empresa'],
    });

    if (!planilla) {
      throw new BadRequestException('Planilla no encontrada');
    }

    if (!planilla.fecha_declarada || !planilla.fecha_planilla) {
      throw new BadRequestException('Faltan fechas requeridas para calcular los aportes');
    }

    const adjustToBoliviaTime = (date: Date): Date => {
      return moment(date).tz('America/La_Paz').toDate();
    };

    const fechaPlanillaBolivia = new Date(planilla.fecha_planilla);
    const fechaDeclaradaBolivia = adjustToBoliviaTime(new Date(planilla.fecha_declarada));
    const fechaPagoBolivia = adjustToBoliviaTime(new Date(fechaPagoPropuesta));

    // ✅ FECHA DE PRESENTACIÓN OFICIAL: Primer día del tercer mes desde fecha_planilla
    const getFechaPresentacionOficial = (fechaPlanilla: Date): Date => {
      return moment(fechaPlanilla)
        .tz('America/La_Paz')
        .add(3, 'months') // Recorre 2 meses
        .startOf('month') // Primer día de ese mes
        .toDate();
    };

    const fechaPresentacionOficial = getFechaPresentacionOficial(fechaPlanillaBolivia);

    const tipoEmpresa = planilla.empresa?.tipo;
    if (!tipoEmpresa) {
      throw new BadRequestException('No se pudo determinar el tipo de empresa');
    }

    const tipo = tipoEmpresa.toUpperCase();
    let aportePorcentaje: number;
    let tasaPorcentaje: number;

    const totalImporte = Number(planilla.total_importe) || 0;

    if (tipo === 'PA') {
      aportePorcentaje = totalImporte * 0.03;
      tasaPorcentaje = 0.03;
    } else if (['AP', 'AV', 'VA'].includes(tipo)) {
      aportePorcentaje = totalImporte * 0.1;
      tasaPorcentaje = 0.1;
    } else {
      throw new BadRequestException(`Tipo de empresa no válido: ${tipoEmpresa}`);
    }

    // ✅ UFV día formal (fecha presentación oficial)
    const fechaFormal = new Date(fechaPresentacionOficial);
    fechaFormal.setHours(0, 0, 0, 0);
    const ufvDiaFormal = await this.getUfvForDate(fechaFormal);

    // ✅ UFV día presentación (fechaPago - 1)
    const fechaPagoUfv = new Date(fechaPagoBolivia);
    fechaPagoUfv.setDate(fechaPagoUfv.getDate() - 1);
    fechaPagoUfv.setHours(0, 0, 0, 0);
    const ufvDiaPresentacion = await this.getUfvForDate(fechaPagoUfv);

    // ✅ Aporte actualizado
    const calculoAporteActualizado = (aportePorcentaje / ufvDiaFormal) * ufvDiaPresentacion;
    const aporteActualizado = Math.max(aportePorcentaje, calculoAporteActualizado);

    // ✅ Monto actualizado
    const montoActualizado = Math.max(0, aporteActualizado - aportePorcentaje);

    // ✅ Multa por no presentación (fijo 1%)
    let multaNoPresentacion = aportePorcentaje * 0.01;
    console.log('Multa por no presentación inicial:', multaNoPresentacion);
    console.log('Fecha declarada (Bolivia):', fechaDeclaradaBolivia);
    console.log('Fecha planilla (Bolivia):', fechaPlanillaBolivia);

    // Calcular el último día del mes siguiente a la fecha de planilla
    const fechaPlanilla = new Date(fechaPlanillaBolivia);
    const ultimoDiaMesSiguiente = new Date(fechaPlanilla.getFullYear(), fechaPlanilla.getMonth() + 2, 0);
    console.log('Último día del mes siguiente:', ultimoDiaMesSiguiente);

    // Si la fecha declarada está dentro del plazo (hasta el último día del mes siguiente), no hay multa
    if (new Date(fechaDeclaradaBolivia) <= ultimoDiaMesSiguiente) {
      multaNoPresentacion = 0;
      console.log('No se aplica multa por no presentación, fecha declarada dentro del plazo oficial');
    }

    // ✅ Días de retraso
    const normalize = (d: Date) => {
      const copy = new Date(d);
      copy.setHours(0, 0, 0, 0);
      return copy;
    };

    const diasRetraso = Math.max(
      0,
      Math.floor((normalize(fechaPagoBolivia).getTime() - normalize(fechaPresentacionOficial).getTime()) / (1000 * 60 * 60 * 24))
    );

    // ✅ Intereses y multa sobre intereses
    const intereses = (aporteActualizado * 0.0999 / 360) * diasRetraso;
    const multaSobreIntereses = intereses * 0.1;

    // ✅ Total a cancelar parcial
    const totalACancelarParcial =
      aportePorcentaje + montoActualizado + multaNoPresentacion + intereses + multaSobreIntereses;

    // ✅ DEDUCCIONES - SIMPLIFICADO
    let totalDeducciones = 0;
    let descuentoMinSalud = 0;

    // CAMBIO: Aplicar automáticamente el descuento del 5% para empresas públicas
    if (tipo === 'AP') {
      // Solo empresas públicas tienen el descuento del Ministerio de Salud
      descuentoMinSalud = aportePorcentaje * 0.05;
      totalDeducciones += descuentoMinSalud;
      console.log('Aplicando descuento Ministerio de Salud (5%) para empresa pública:', descuentoMinSalud);
    }

    // Agregar otros descuentos manuales si existen
    const otrosDescuentos = Number(planilla.otros_descuentos || 0);
    totalDeducciones += otrosDescuentos;

    // ✅ Total final a cancelar
    const totalACancelar = totalACancelarParcial - totalDeducciones;

    const recargos_ley = montoActualizado + multaNoPresentacion + multaSobreIntereses + intereses;

    return {
      total_importe: totalImporte,
      aporte_porcentaje: aportePorcentaje,
      cotizacion_tasa: tasaPorcentaje,
      ufv_dia_formal: ufvDiaFormal,
      ufv_dia_presentacion: ufvDiaPresentacion,
      aporte_actualizado: aporteActualizado,
      monto_actualizado: montoActualizado,
      multa_no_presentacion: multaNoPresentacion,
      fechaFormal,
      fechaPagoUfv,
      fecha_declarada: planilla.fecha_declarada,
      fecha_pago: fechaPagoPropuesta,
      fecha_presentacion_oficial: fechaPresentacionOficial,
      dias_retraso: diasRetraso,
      intereses,
      multa_sobre_intereses: multaSobreIntereses,
      total_a_cancelar_parcial: totalACancelarParcial,
      total_multas: recargos_ley,
      total_tasa_interes: intereses,
      total_deducciones: totalDeducciones,
      descuento_min_salud: descuentoMinSalud,
      otros_descuentos: otrosDescuentos,
      total_a_cancelar: totalACancelar,
      tipo_empresa: tipo,
      // Agregar información sobre la deducción aplicada
      aplica_descuento_min_salud: tipo === 'AP',
      ley_descuento_min_salud: tipo === 'AP' ? 'LEY 2042' : null,
    };
  } catch (error) {
    throw new BadRequestException(`Error al calcular los aportes preliminares: ${error.message}`);
  }
}

async actualizarPlanillaConLiquidacion(idPlanilla: number, fechaPago: Date, datosLiquidacion: any): Promise<void> {
  try {
    const planilla = await this.planillaRepo.findOne({
      where: { id_planilla_aportes: idPlanilla }
    });

    if (!planilla) {
      throw new BadRequestException('Planilla no encontrada');
    }

    // Actualizar todos los campos calculados
    planilla.fecha_pago = fechaPago;
    planilla.fecha_liquidacion = new Date(); // Fecha actual como fecha de liquidación
    planilla.aporte_porcentaje = datosLiquidacion.aporte_porcentaje;
    planilla.ufv_dia_formal = datosLiquidacion.ufv_dia_formal;
    planilla.ufv_dia_presentacion = datosLiquidacion.ufv_dia_presentacion;
    planilla.aporte_actualizado = datosLiquidacion.aporte_actualizado;
    planilla.monto_actualizado = datosLiquidacion.monto_actualizado;
    planilla.multa_no_presentacion = datosLiquidacion.multa_no_presentacion;
    planilla.dias_retraso = datosLiquidacion.dias_retraso;
    planilla.intereses = datosLiquidacion.intereses;
    planilla.multa_sobre_intereses = datosLiquidacion.multa_sobre_intereses;
    planilla.total_a_cancelar_parcial = datosLiquidacion.total_a_cancelar_parcial;
    planilla.total_multas = datosLiquidacion.total_multas;
    planilla.total_tasa_interes = datosLiquidacion.total_tasa_interes;
    planilla.total_a_cancelar = datosLiquidacion.total_a_cancelar;
    planilla.fecha_presentacion_oficial = datosLiquidacion.fecha_presentacion_oficial;
    planilla.fecha_deposito_presentacion = datosLiquidacion.fechaPagoUfv;
    
    // Actualizar campos de aportes ASUSS y Min Salud
    planilla.total_aportes_asuss = datosLiquidacion.aporte_porcentaje * 0.005;
    planilla.total_aportes_min_salud = datosLiquidacion.descuento_min_salud || 0;

    await this.planillaRepo.save(planilla);
    
    console.log(`Planilla ${idPlanilla} actualizada con datos de liquidación`);
  } catch (error) {
    throw new BadRequestException(`Error al actualizar planilla con liquidación: ${error.message}`);
  }
}
async obtenerLiquidacion(idPlanilla: number): Promise<any> {
  try {
    const planilla = await this.planillaRepo.findOne({
      where: { id_planilla_aportes: idPlanilla },
      relations: ['empresa'],
    });

    if (!planilla) {
      throw new BadRequestException('Planilla no encontrada');
    }

    // Verificar si la planilla ya tiene liquidación calculada
    if (planilla.fecha_liquidacion && planilla.total_a_cancelar !== null) {
      console.log(`Planilla ${idPlanilla} ya tiene liquidación calculada`);
      
      // Retornar los datos ya guardados
      return {
        total_importe: planilla.total_importe,
        aporte_porcentaje: planilla.aporte_porcentaje,
        cotizacion_tasa: planilla.cotizacion_tasa,
        ufv_dia_formal: planilla.ufv_dia_formal,
        ufv_dia_presentacion: planilla.ufv_dia_presentacion,
        fecha_declarada: planilla.fecha_declarada,
        fecha_pago: planilla.fecha_pago,
        fecha_liquidacion: planilla.fecha_liquidacion,
        aporte_actualizado: planilla.aporte_actualizado,
        monto_actualizado: planilla.monto_actualizado,
        multa_no_presentacion: planilla.multa_no_presentacion,
        dias_retraso: planilla.dias_retraso,
        intereses: planilla.intereses,
        multa_sobre_intereses: planilla.multa_sobre_intereses,
        total_a_cancelar_parcial: planilla.total_a_cancelar_parcial,
        total_multas: planilla.total_multas,
        total_tasa_interes: planilla.total_tasa_interes,
        total_deducciones: planilla.total_deducciones,
        descuento_min_salud: planilla.total_aportes_min_salud,
        otros_descuentos: planilla.otros_descuentos,
        total_a_cancelar: planilla.total_a_cancelar,
        tipo_empresa: planilla.empresa?.tipo,
        total_aportes_asuss: planilla.total_aportes_asuss,
        total_aportes_min_salud: planilla.total_aportes_min_salud,
        excedente: planilla.excedente,
        motivo_excedente: planilla.motivo_excedente,
        fechaFormal: planilla.fecha_presentacion_oficial,
        fechaPagoUfv: planilla.fecha_deposito_presentacion,
        valido_cotizacion: planilla.valido_cotizacion,
        fecha_validacion: planilla.fecha_liquidacion,
      };
    }

    // Si no tiene liquidación y tiene fecha_pago, calcularla
    if (planilla.fecha_pago) {
      console.log(`Calculando liquidación para planilla ${idPlanilla}`);
      return await this.calcularAportes(idPlanilla);
    }

    // Si no tiene ni liquidación ni fecha_pago
    throw new BadRequestException('La planilla no tiene fecha de pago ni liquidación calculada (EMPRESA NO REGISTRO EL PAGO)');
  } catch (error) {
    throw new BadRequestException(`Error al obtener liquidación: ${error.message}`);
  }
}
async recalcularLiquidacion(idPlanilla: number, forzar: boolean = false): Promise<any> {
  try {
    const planilla = await this.planillaRepo.findOne({
      where: { id_planilla_aportes: idPlanilla }
    });

    if (!planilla) {
      throw new BadRequestException('Planilla no encontrada');
    }

    if (!planilla.fecha_pago) {
      throw new BadRequestException('La planilla no tiene fecha de pago');
    }

    // Si no se fuerza y ya tiene liquidación, preguntar confirmación
    if (!forzar && planilla.fecha_liquidacion) {
      return {
        mensaje: 'La planilla ya tiene una liquidación calculada',
        fecha_liquidacion: planilla.fecha_liquidacion,
        requiere_confirmacion: true
      };
    }

    // Recalcular
    return await this.calcularAportes(idPlanilla);
  } catch (error) {
    throw new BadRequestException(`Error al recalcular liquidación: ${error.message}`);
  }
}




//* 25 .- REPORTE FORMULARIO DS-08 (NOMBRE EN FRONT : FORMULARIO DS-08)
async generarReporteAportes(idPlanilla: number): Promise<StreamableFile> {
  try {
    // Validar parámetro
    if (!idPlanilla || idPlanilla < 1) {
      throw new BadRequestException('El ID de la planilla debe ser un número positivo');
    }

    // Obtener los datos de la planilla con la relación empresa
    const planilla = await this.planillaRepo.findOne({
      where: { id_planilla_aportes: idPlanilla },
      /* relations: ['empresa', 'detalles'],  */
      relations: ['empresa'],
    });

    if (!planilla) {
      throw new BadRequestException('Planilla no encontrada');
    }

    // Configurar moment para español
    moment.locale('es');

    // Formatear los valores numéricos
    const formatNumber = (num: number | null | undefined): string => {
      if (num === null || num === undefined) return '0.00';
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(num);
    };

    // Formatear fechas
    const formatDate = (date: Date | null | undefined): string => {
      if (!date) return 'N/A';
      return moment(date).format('DD/MM/YYYY');
    };

    // Preparar los datos para el reporte
    const data = {
      planilla: {
        id_planilla_aportes: planilla.id_planilla_aportes,
        mes: planilla.fecha_planilla
          ? moment(planilla.fecha_planilla).format('MMMM').toUpperCase()
          : 'N/A', 
        anio: planilla.fecha_planilla
          ? moment(planilla.fecha_planilla).format('YYYY')
          : 'N/A', 
        fecha_declarada: formatDate(planilla.fecha_declarada),
        fecha_pago: formatDate(planilla.fecha_pago),
        total_importe: formatNumber(planilla.total_importe),
        aporte_porc: formatNumber(planilla.aporte_porcentaje),
        ufv_dia_formal: formatNumber(planilla.ufv_dia_formal),
        ufv_dia_presentacion: formatNumber(planilla.ufv_dia_presentacion),
        aporte_actualizado: formatNumber(planilla.aporte_actualizado),
        monto_actualizado: formatNumber(planilla.monto_actualizado),
        multa_no_presentacion: formatNumber(planilla.multa_no_presentacion),
        dias_retraso: planilla.dias_retraso || 0,
        intereses: formatNumber(planilla.intereses),
        multa_sobre_intereses: formatNumber(planilla.multa_sobre_intereses),
        total_a_cancelar_parcial: formatNumber(planilla.total_a_cancelar_parcial),
        total_multas: formatNumber(planilla.total_multas),
        total_tasa_interes: formatNumber(planilla.total_tasa_interes),
        total_aportes_asuss: formatNumber(planilla.total_aportes_asuss),
        total_aportes_min_salud: formatNumber(planilla.total_aportes_min_salud),
        total_a_cancelar: formatNumber(planilla.total_a_cancelar),
        empresa: planilla.empresa ? planilla.empresa.emp_nom : 'N/A',
        patronal: planilla.cod_patronal || 'N/A',
        total_trabaj: planilla.total_trabaj || 0,
        com_nro: planilla.com_nro || 0,
        emp_nit: planilla.empresa ? planilla.empresa.emp_nit : 'N/A',
        emp_legal: planilla.empresa ? planilla.empresa.emp_legal : 'N/A',
        valido_cotizacion: planilla.valido_cotizacion || 'N/A',
        fecha_liquidacion: formatDate(planilla.fecha_liquidacion),
        /* detalles: planilla.detalles || [], */
      },
    };

    const templatePath = path.resolve('reports/resumen_mensual.docx');

    // Verificar si la plantilla existe
    if (!fs.existsSync(templatePath)) {
      throw new BadRequestException(`La plantilla en ${templatePath} no existe`);
    }

    console.log('Reporte de aportes generado correctamente', data);
    return new Promise<StreamableFile>((resolve, reject) => {
      carbone.render(
        templatePath,
        data,
        { convertTo: 'pdf' },
        (err, result) => {
          if (err) {
            return reject(new BadRequestException(`Error al generar el reporte con Carbone: ${err.message}`));
          }

          if (typeof result === 'string') {
            result = Buffer.from(result, 'utf-8');
          }

          resolve(
            new StreamableFile(result, {
              type: 'application/pdf',
              disposition: `attachment; filename=reporte_aportes_${planilla.id_planilla_aportes}.pdf`,
            }),
          );
        },
      );
    });
    
  } catch (error) {
    throw new BadRequestException(`Error al generar el reporte de aportes: ${error.message}`);
  }
}

 //* 26 .- REPORTE DE DECLARACION DE APORTE Y MUESTRA REGIONALES (NOMBRE EN FRONT : DECLARACION PDF)
async generarReportePlanillaPorRegional(idPlanilla: number): Promise<StreamableFile> {
  try {

    const datosPlanilla = await this.obtenerDatosPlanillaPorRegional(idPlanilla);

    if (!datosPlanilla || !datosPlanilla.planilla) {
      throw new Error('Planilla no encontrada o sin datos');
    }

    /* const porcentaje = datosPlanilla.planilla.total_importe * 0.10; */
    const totalimporte = parseFloat(datosPlanilla.planilla.total_importe).toFixed(2);
    let tasa = 0;

    if (datosPlanilla.planilla.empresa.tipo == 'PA') {
    tasa = 3;  
    } else {
    tasa = 10;
    }

    moment.locale('es');
    /* const metadato = moment(); */
    const metadato = moment().tz('America/La_Paz');

    const data = {
      planilla: {
        id_planilla_aportes: datosPlanilla.planilla.id_planilla_aportes,
        mes: moment(datosPlanilla.planilla.fecha_planilla).format('MMMM').toUpperCase(),
        anio: moment(datosPlanilla.planilla.fecha_planilla).format('YYYY'),
        fecha_declarada: moment(datosPlanilla.planilla.fecha_declarada).format('DD/MM/YYYY'),
        fecha_pago: moment(datosPlanilla.planilla.fecha_pago).format('DD/MM/YYYY'),
        tipo_empresa: datosPlanilla.planilla.tipo_empresa,
        total_importe: totalimporte,
        aporte_porcentaje: datosPlanilla.planilla.aporte_porcentaje,
        empresa: datosPlanilla.planilla.empresa.nombre,
        total_trabaj: datosPlanilla.planilla.total_trabaj,
        com_nro: datosPlanilla.planilla.com_nro,
        aporte_porce: datosPlanilla.planilla.aporte_porcentaje,
        patronal: datosPlanilla.planilla.cod_patronal,
        porcentaje: datosPlanilla.totales.cotizacion,
        tasa: tasa,
        presentado_por: datosPlanilla.planilla.nombre_creacion,
        
      },
      resumen: datosPlanilla.resumen.map(region => ({
        regional: region.regional,
        cantidad: region.cantidad,
        total_ganado: region.total_ganado,
        cotizacion: region.cotizacion,
      })),
      totales: {
        cantidad_total: datosPlanilla.totales.cantidad_total,
        total_ganado: datosPlanilla.totales.total_ganado,
        cotizacion: datosPlanilla.totales.cotizacion,
      },
      metadatos: {
        generado_por: datosPlanilla.planilla.usuario_creacion, 
        fecha_reporte: metadato.format('DD/MM/YYYY'),
        hora_reporte: metadato.format('HH:mm:ss'),
        nota: 'Reporte generado automáticamente por el sistema - CBES',
  },
    };

    console.log('Datos para el reporte por regional:', JSON.stringify(data, null, 2));

    const templatePath = path.resolve('reports/resumen.docx');

    // Verificar si la plantilla existe
    if (!fs.existsSync(templatePath)) {
      throw new Error(`La plantilla en ${templatePath} no existe`);
    }

    return new Promise<StreamableFile>((resolve, reject) => {
      carbone.render(
        templatePath,
        data,
        { convertTo: 'pdf' },
        (err, result) => {
          if (err) {
            console.error('Error en Carbone:', err);
            return reject(new Error(`Error al generar el reporte con Carbone: ${err}`));
          }

          console.log('Reporte por regional generado correctamente');

          if (typeof result === 'string') {
            result = Buffer.from(result, 'utf-8');
          }

          resolve(
            new StreamableFile(result, {
              type: 'application/pdf',
              disposition: `attachment; filename=reporte_planilla_regional_${idPlanilla}.pdf`,
            }),
          );
        },
      );
    });
  } catch (error) {
    throw new Error('Error en generarReportePlanillaPorRegional: ' + error.message);
  }
}

//! 27 .- REPORTE DE APORTES RECIBIDOS POR MES (NOMBRE EN FRONT : VER APORTES POR MES Y AÑO)(OJO REVISAR)
async generarReporteHistorial(mes?: number, gestion?: number): Promise<StreamableFile> {
  try {
    // Validar parámetros
    if (mes && (isNaN(mes) || mes < 1 || mes > 12)) {
      throw new BadRequestException('El mes debe ser un número entre 1 y 12');
    }
    if (gestion && (isNaN(gestion) || gestion < 1900 || gestion > 2100)) {
      throw new BadRequestException('El año debe ser un número válido (1900-2100)');
    }

    // Obtener el historial de planillas usando el método existente
    const historial = await this.obtenerTodoHistorial(mes, gestion);
    const planillas = historial.planillas;

    if (!planillas || planillas.length === 0) {
      throw new BadRequestException('No hay planillas presentadas para generar el reporte');
    }

    // Configurar moment para español
    moment.locale('es');

    // Formatear los valores numéricos
    const formatNumber = (num: number | null | undefined): string => {
      if (num === null || num === undefined) return '0.00';
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(num);
    };

    // Formatear fechas
    const formatDate = (date: Date | null | undefined): string => {
      if (!date) return 'N/A';
      return moment(date).format('DD/MM/YYYY');
    };

    // Preparar los datos para el reporte
    const data = {
      mes: mes ? moment().month(mes - 1).format('MMMM').toUpperCase() : 'Todos',
      gestion: gestion || 'Todos',
      planillas: planillas.map((planilla) => ({
        id_planilla_aportes: planilla.id_planilla_aportes,
        com_nro: planilla.com_nro || 0,
        cod_patronal: planilla.cod_patronal || 'N/A',
        empresa: planilla.empresa || 'N/A',
        total_importe: formatNumber(planilla.total_importe),
        total_trabaj: planilla.total_trabaj || 0,
        fecha_declarada: formatDate(planilla.fecha_declarada),
        fecha_pago: planilla.fecha_pago ? formatDate(planilla.fecha_pago) : 'No pagado',
        total_a_cancelar: formatNumber(planilla.total_a_cancelar),
        total_multas: formatNumber(planilla.total_multas),
        total_tasa_interes: formatNumber(planilla.total_tasa_interes),
        mes: planilla.fecha_planilla
          ? moment(planilla.fecha_planilla).format('MMMM').toUpperCase()
          : 'N/A',
        anio: planilla.fecha_planilla
          ? moment(planilla.fecha_planilla).format('YYYY')
          : 'N/A',
        aporte_porce: formatNumber(planilla.aporte_porcentaje),
        total_asuss: formatNumber(planilla.total_aportes_asuss),
        total_min_salud: formatNumber(planilla.total_aportes_min_salud),
        // Nota: Si el reporte necesita los detalles, descomenta la línea siguiente
        // y asegúrate de que obtenerTodoHistorial incluya la relación 'detalles'
        // detalles: planilla.detalles || [],
      })),
    };


    const templatePath = path.resolve(process.cwd(), 'reports/aportes-mensuales.docx');

    

    // Verificar si la plantilla existe
    if (!fs.existsSync(templatePath)) {
      throw new BadRequestException(`La plantilla en ${templatePath} no existe`);
    }

    return new Promise<StreamableFile>((resolve, reject) => {
      carbone.render(
        templatePath,
        data,
        { convertTo: 'pdf' },
        (err, result) => {
          if (err) {
            return reject(new BadRequestException(`Error al generar el reporte con Carbone: ${err.message}`));
          }

          if (typeof result === 'string') {
            result = Buffer.from(result, 'utf-8');
          }

          resolve(
            new StreamableFile(result, {
              type: 'application/pdf',
              disposition: `attachment; filename=historial_planillas_${mes || 'todos'}_${gestion || 'todos'}_${new Date().toISOString().split('T')[0]}.pdf`,
            }),
          );
        },
      );
    });
  } catch (error) {
    throw new BadRequestException(`Error al generar el reporte de historial: ${error.message}`);
  }
}

// 28 .- CRUCE CON AFILIACIONES
async verificarAfiliacionDetalles(idPlanilla: number): Promise<{ mensaje: string; detallesActualizados: number }> {
  try {
    // Validar parámetro
    if (!idPlanilla || idPlanilla < 1) {
      throw new BadRequestException('El ID de la planilla debe ser un número positivo');
    }

    // Obtener todos los detalles de la planilla
    const detalles = await this.detalleRepo.find({
      where: { id_planilla_aportes: idPlanilla },
    });

    if (!detalles || detalles.length === 0) {
      throw new BadRequestException('No se encontraron detalles para la planilla especificada');
    }

    let detallesActualizados = 0;

    // Asegurarse de que el token esté disponible
    if (!this.externalApiService.getApiToken()) {
      await this.externalApiService.loginToExternalApi();
    }

    // Iterar sobre cada detalle
for (const detalle of detalles) {
  try {
    // Extraer el número base del CI (antes del guion) para enviarlo a la API
    const ciBase = detalle.ci.split('-')[0].trim(); // Esto asegura que mandas solo el número

    // Llamar al servicio con solo el número
    const response = await this.externalApiService.getAseguradoByCi(ciBase);

    if (response.status && response.data) {
      const data = response.data;

      const ciApi = (data.ASE_CI || '').trim();
      const complementoApi = (data.ASE_CI_COM || '').trim().toUpperCase();
      const ciApiCompleto = complementoApi ? `${ciApi}-${complementoApi}` : ciApi;

      const ciDetalle = detalle.ci.trim().toUpperCase();

      console.log(`CI de detalle: ${ciDetalle}`);
      console.log(`CI de API: ${ciApiCompleto}`);

      const coinciden = ciApiCompleto === ciDetalle;

      if (coinciden) {
        detalle.es_afiliado = data.ASE_ESTADO === 'VIGENTE';
        if (detalle.es_afiliado) {
          detalle.matricula = data.ASE_MAT || null;
          detalle.tipo_afiliado = data.ASE_COND_EST || null;
          console.log(`✔️ Coincide. CI ${ciDetalle} está afiliado. Matrícula: ${detalle.matricula}`);
        } else {
          detalle.matricula = null;
          detalle.tipo_afiliado = null;
          console.log(`✔️ Coincide. CI ${ciDetalle} no está afiliado.`);
        }
      } else {
        // No coincide, marcar como no afiliado
        detalle.es_afiliado = false;
        detalle.matricula = null;
        detalle.tipo_afiliado = null;
        console.log(`❌ No coincide. CI Detalle: ${ciDetalle} | CI API: ${ciApiCompleto}`);
      }

    } else {
      detalle.es_afiliado = false;
      detalle.matricula = null;
      detalle.tipo_afiliado = null;
      console.log(`⚠️ No se encontró CI ${detalle.ci} en la API`);
    }

    await this.detalleRepo.save(detalle);
    detallesActualizados++;

  } catch (error) {
    console.error(`❌ Error al consultar CI ${detalle.ci}: ${error.message}`);
    detalle.es_afiliado = false;
    detalle.matricula = null;
    detalle.tipo_afiliado = null;
    await this.detalleRepo.save(detalle);
    detallesActualizados++;
  }
}



    return {
      mensaje: `Verificación completada. Se actualizaron ${detallesActualizados} detalles.`,
      detallesActualizados,
    };
  } catch (error) {
    throw new BadRequestException(`Error al verificar afiliación: ${error.message}`);
  }
}

// 29 .- VALIDAR LIQUIDACIONES

async validarLiquidacion(idPlanilla: number, payload: { fecha_pago?: string; valido_cotizacion?: string }): Promise<any> {
  const planilla = await this.planillaRepo.findOne({ 
    where: { id_planilla_aportes: idPlanilla },
    relations: ['empresa'] // Por si necesitas datos de la empresa
  });

  if (!planilla) {
    throw new NotFoundException('La planilla no existe.');
  }

  // Actualizar fecha_pago solo si se proporciona
  if (payload.fecha_pago) {
    const parsedFechaPago = new Date(payload.fecha_pago);
    if (isNaN(parsedFechaPago.getTime())) {
      throw new BadRequestException('La fecha de pago proporcionada no es válida.');
    }
    planilla.fecha_pago = parsedFechaPago;
  }

  // Siempre actualizar fecha_liquidacion
  planilla.fecha_liquidacion = new Date();

  // NUEVO: Actualizar el nombre del validador si se proporciona
  if (payload.valido_cotizacion) {
    planilla.valido_cotizacion = payload.valido_cotizacion;
  }

  // Guardar los cambios
  const planillaActualizada = await this.planillaRepo.save(planilla);

  return {
    mensaje: 'Liquidación validada correctamente.',
    planilla: planillaActualizada,
    validado_por: payload.valido_cotizacion || 'No especificado',
    fecha_validacion: planilla.fecha_liquidacion
  };
}

//* 30 .- REPORTE AFILIACIONES VIGENTES NO VIGENTES (NOMBRE EN FRONT : REPORTE AFILIACIONES)
async generarReporteAfiliacion(idPlanilla: number): Promise<StreamableFile> {
  try {
    // Fetch planilla data
    const planilla = await this.planillaRepo.findOne({
      where: { id_planilla_aportes: idPlanilla },
      relations: ['empresa'],
    });

    if (!planilla) {
      throw new BadRequestException('Planilla no encontrada');
    }

    // Fetch planilla details
    const detalles = await this.detalleRepo.find({
      where: { id_planilla_aportes: idPlanilla },
    });

    if (!detalles || detalles.length === 0) {
      throw new BadRequestException('No se encontraron detalles para la planilla');
    }

    // Group details by affiliation status
    const afiliadosVigentes = detalles
      .filter((detalle) => detalle.es_afiliado === true)
      .map((detalle) => ({
        ci: detalle.ci,
        apellido_paterno: detalle.apellido_paterno,
        apellido_materno: detalle.apellido_materno,
        nombres: detalle.nombres,
        cargo: detalle.cargo,
        regional: detalle.regional,
        salario: detalle.salario,
      }));

    const afiliadosNoVigentes = detalles
      .filter((detalle) => detalle.es_afiliado === false)
      .map((detalle) => ({
        ci: detalle.ci,
        apellido_paterno: detalle.apellido_paterno,
        apellido_materno: detalle.apellido_materno,
        nombres: detalle.nombres,
        cargo: detalle.cargo,
        regional: detalle.regional,
        salario: detalle.salario,
      }));

    // Prepare data for Carbone
    moment.locale('es');
    const data = {
      planilla: {
        id_planilla_aportes: planilla.id_planilla_aportes,
        mes: moment(planilla.fecha_planilla).format('MMMM').toUpperCase(),
        anio: planilla.gestion,
        fecha_planilla: moment(planilla.fecha_planilla).format('DD/MM/YYYY'),
        total_trabaj: planilla.total_trabaj,
        total_importe: planilla.total_importe,
      },
      afiliadosVigentes,
      afiliadosNoVigentes,
      totales: {
        vigentes: afiliadosVigentes.length,
        noVigentes: afiliadosNoVigentes.length,
        total: detalles.length,
      },
    };

    console.log('Datos para el reporte de afiliación:', JSON.stringify(data, null, 2));

    const templatePath = path.resolve('reports/reporte_afiliacion.docx');

    // Verify template exists
    if (!fs.existsSync(templatePath)) {
      throw new BadRequestException(`La plantilla en ${templatePath} no existe`);
    }

    return new Promise<StreamableFile>((resolve, reject) => {
      carbone.render(
        templatePath,
        data,
        { convertTo: 'pdf' },
        (err, result) => {
          if (err) {
            console.error('Error en Carbone:', err);
            return reject(new BadRequestException(`Error al generar el reporte: ${err}`));
          }

          console.log('Reporte de afiliación generado correctamente');

          if (typeof result === 'string') {
            result = Buffer.from(result, 'utf-8');
          }

          resolve(
            new StreamableFile(result, {
              type: 'application/pdf',
              disposition: `attachment; filename=reporte_afiliacion_${idPlanilla}.pdf`,
            }),
          );
        },
      );
    });
  } catch (error) {
    throw new BadRequestException(`Error al generar el reporte de afiliación: ${error.message}`);
  }



}

//* 31.- REPORTE DE DETALLES DE PLANILLA EN EXCEL (NOMBRE EN FRONT : PLANILLA EXCEL)
async generarReporteDetallesExcel(idPlanilla: number): Promise<StreamableFile> {
  try {
    // Obtener datos de la planilla
    const planilla = await this.planillaRepo.findOne({
      where: { id_planilla_aportes: idPlanilla },
      relations: ['empresa'],
    });

    if (!planilla) {
      throw new BadRequestException('Planilla no encontrada');
    }

    // Obtener todos los detalles de la planilla
    const detalles = await this.detalleRepo.find({
      where: { id_planilla_aportes: idPlanilla },
      order: { nro: 'ASC' },
    });

    if (!detalles || detalles.length === 0) {
      throw new BadRequestException('No se encontraron detalles para la planilla');
    }

 // Formatear los datos para Carbone
      moment.locale('es');
      const detallesFormateados = detalles.map((detalle) => ({
        nro: detalle.nro,
        ci: detalle.ci,
        apellido_paterno: detalle.apellido_paterno || '',
        apellido_materno: detalle.apellido_materno || '',
        nombres: detalle.nombres || '',
        sexo: detalle.sexo || '',
        cargo: detalle.cargo || '',
        fecha_nac: detalle.fecha_nac ? moment(detalle.fecha_nac).format('DD/MM/YYYY') : '',
        fecha_ingreso: detalle.fecha_ingreso ? moment(detalle.fecha_ingreso).format('DD/MM/YYYY') : '',
        fecha_retiro: detalle.fecha_retiro ? moment(detalle.fecha_retiro).format('DD/MM/YYYY') : '',
        dias_pagados: detalle.dias_pagados || 0,
        salario: detalle.salario || 0,
        regional: detalle.regional || '',
        haber_basico: detalle.haber_basico || 0,
        es_afiliado: detalle.es_afiliado ? 'Sí' : 'No',
      }));

      // Preparar datos para Carbone, incluyendo los nuevos campos
      const data = {
        planilla: {
          id_planilla_aportes: planilla.id_planilla_aportes,
          mes: moment(planilla.fecha_planilla).format('MMMM').toUpperCase(),
          anio: planilla.gestion,
          fecha_planilla: moment(planilla.fecha_planilla).format('DD/MM/YYYY'),
          total_trabaj: planilla.total_trabaj,
          total_importe: planilla.total_importe,
          total_a_cancelar: planilla.total_a_cancelar,
          com_nro: planilla.com_nro, 
          tipo_planilla: planilla.tipo_planilla, 
          fecha_declarada: planilla.fecha_declarada ? moment(planilla.fecha_declarada).format('DD/MM/YYYY') : '', 
          emp_nom: planilla.empresa?.emp_nom || '', 
          cod_patronal: planilla.empresa?.cod_patronal || '', 
        },
        detalles: detallesFormateados,
        totales: {
          total: detalles.length,
        },
      };

    console.log('Datos para el reporte de detalles:', JSON.stringify(data, null, 2));

    const templatePath = path.resolve('reports/reporte_planilla_detalles.xlsx');

    // Verificar que la plantilla existe
    if (!fs.existsSync(templatePath)) {
      throw new BadRequestException(`La plantilla en ${templatePath} no existe`);
    }

    return new Promise<StreamableFile>((resolve, reject) => {
      carbone.render(
        templatePath,
        data,
        { convertTo: 'xlsx' },
        (err, result) => {
          if (err) {
            console.error('Error en Carbone:', err);
            return reject(new BadRequestException(`Error al generar el reporte: ${err}`));
          }

          console.log('Reporte de detalles generado correctamente');

          if (typeof result === 'string') {
            result = Buffer.from(result, 'utf-8');
          }

          resolve(
            new StreamableFile(result, {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              disposition: `attachment; filename=reporte_detalles_planilla_${idPlanilla}_${moment().format('YYYYMMDD')}.xlsx`,
            }),
          );
        },
      );
    });
  } catch (error) {
    throw new BadRequestException(`Error al generar el reporte de detalles: ${error.message}`);
  }
}

// 32.- VERIFICAR SI LOS CI ESTÁN EN EL SISTEMA DE AFILIACIONES (SOLO VERIFICACIÓN SIMPLE - OPTIMIZADO)
async verificarCiEnAfiliaciones(idPlanilla: number): Promise<{ mensaje: string; resumen: any; resultados: any[] }> {
  try {
    // Validar parámetro
    if (!idPlanilla || idPlanilla < 1) {
      throw new BadRequestException('El ID de la planilla debe ser un número positivo');
    }

    // Obtener todos los detalles de la planilla
    const detalles = await this.detalleRepo.find({
      where: { id_planilla_aportes: idPlanilla },
      select: ['ci', 'nombres', 'apellido_paterno', 'apellido_materno'], // Solo los campos necesarios
    });

    if (!detalles || detalles.length === 0) {
      throw new BadRequestException('No se encontraron detalles para la planilla especificada');
    }

    // Asegurarse de que el token esté disponible
    if (!this.externalApiService.getApiToken()) {
      await this.externalApiService.loginToExternalApi();
    }

    let consultasExitosas = 0;
    let consultasConError = 0;
    let encontrados = 0;
    let noEncontrados = 0;
    const resultadosNoEncontrados: any[] = []; // Solo guardar los no encontrados

    console.log(`🔍 Iniciando verificación simple de ${detalles.length} CIs en el sistema de afiliaciones`);

    // ✅ OPTIMIZACIÓN: Procesar en lotes SIN pLimit (para evitar problemas de importación)
    const batchSize = 50; // Procesar de a 50
    const maxConcurrent = 5; // Máximo 5 consultas simultáneas

    // Procesar en lotes
    for (let i = 0; i < detalles.length; i += batchSize) {
      const batch = detalles.slice(i, i + batchSize);
      
      console.log(`📦 Procesando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(detalles.length / batchSize)} (${batch.length} registros)`);

      // Procesar lote con Promise.allSettled para manejar errores
      const promises = batch.map(async (detalle) => {
        try {
          // Extraer el número base del CI (antes del guion)
          const ciBase = detalle.ci.split('-')[0].trim();

          // Llamar al servicio externo
          const response = await this.externalApiService.getAseguradoByCi(ciBase);

          // ✅ LÓGICA CORREGIDA: Todas las consultas que no fallan son exitosas
          consultasExitosas++; // ✅ Mover aquí para contar todas las respuestas del API
          
          if (response.status && response.data) {
            // ✅ ENCONTRADO: Tiene datos en datosAsegurado (VIGENTE, etc.)
            encontrados++;
            return { 
              success: true, 
              ci: detalle.ci, 
              encontrado: true,
              detalle,
              estado_afiliacion: response.data.ASE_ESTADO || 'DESCONOCIDO',
              mensaje_api: response.msg || 'Datos encontrados'
            };
          } else if (response.status === false && response.data === null && 
                     response.msg && response.msg.toLowerCase().includes('estado de baja')) {
            // ✅ ENCONTRADO: Estado BAJA - SÍ existe en el sistema
            encontrados++;
            return { 
              success: true, 
              ci: detalle.ci, 
              encontrado: true,
              detalle,
              estado_afiliacion: 'BAJA',
              mensaje_api: response.msg || 'Asegurado con estado BAJA'
            };
          } else if (response.status && response.data === null && 
                     response.msg && response.msg.toLowerCase().includes('no existe datos del asegurado')) {
            // ✅ ENCONTRADO PERO SIN DATOS: Consulta exitosa pero no tiene registro
            // NO incrementamos encontrados ni noEncontrados aquí
            // Esta es una consulta exitosa que simplemente no tiene datos
            encontrados++; // ✅ Considerarlo como encontrado ya que la consulta fue exitosa
            return { 
              success: true, 
              ci: detalle.ci, 
              encontrado: true,
              detalle,
              estado_afiliacion: 'SIN_REGISTRO',
              mensaje_api: response.msg
            };
          } else {
            // ✅ ENCONTRADO: Cualquier otra respuesta válida del API
            encontrados++;
            return { 
              success: true, 
              ci: detalle.ci, 
              encontrado: true,
              detalle,
              estado_afiliacion: 'OTRO',
              mensaje_api: response.msg || 'Respuesta válida del sistema'
            };
          }
        } catch (error) {
          // ❌ ERROR: Solo los errores de conexión/timeout se consideran no encontrados
          consultasConError++;
          noEncontrados++; // Solo los errores técnicos van a no encontrados
          console.error(`❌ Error al consultar CI ${detalle.ci}: ${error.message}`);
          
          // Solo agregar errores a resultados (no las consultas exitosas sin datos)
          const resultado = {
            ci: detalle.ci,
            nombre_completo: `${detalle.apellido_paterno} ${detalle.apellido_materno} ${detalle.nombres}`,
            encontrado_en_afiliaciones: false,
            estado_consulta: 'error',
            mensaje: `Error en la consulta: ${error.message}`,
            mensaje_api: 'Error de conexión o servicio no disponible'
          };
          resultadosNoEncontrados.push(resultado);
          
          return { 
            success: false, 
            ci: detalle.ci, 
            error: error.message,
            detalle 
          };
        }
      });

      // Esperar a que termine el lote
      const resultadosLote = await Promise.allSettled(promises);
      
      // ✅ NO necesitamos contar consultas exitosas aquí porque ya se cuentan en el try

      // Mostrar progreso cada 1000 registros
      if ((i + batchSize) % 1000 === 0 || i + batchSize >= detalles.length) {
        const progreso = Math.min(i + batchSize, detalles.length);
        const porcentaje = ((progreso / detalles.length) * 100).toFixed(1);
        console.log(`⏳ Progreso: ${progreso}/${detalles.length} (${porcentaje}%) - Encontrados: ${encontrados}, No encontrados: ${noEncontrados}, Errores: ${consultasConError}`);
      }

      // ✅ Pequeña pausa entre lotes para no saturar el API
      if (i + batchSize < detalles.length) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms de pausa
      }
    }

    // Generar resumen final
    const resumen = {
      total_consultados: detalles.length,
      consultas_exitosas: consultasExitosas,
      consultas_con_error: consultasConError,
      encontrados_en_afiliaciones: encontrados,
      no_encontrados_en_afiliaciones: noEncontrados, // ✅ Ahora incluye errores
      porcentaje_encontrados: detalles.length > 0 ? ((encontrados / detalles.length) * 100).toFixed(2) + '%' : '0%'
    };

    console.log(`📊 RESUMEN FINAL:`, resumen);
    console.log(`📋 Total de no encontrados en resultados: ${resultadosNoEncontrados.length}`);

    return {
      mensaje: `✅ Verificación completada. ${encontrados} de ${detalles.length} CIs encontrados en afiliaciones (${resumen.porcentaje_encontrados}).`,
      resumen,
      resultados: resultadosNoEncontrados // Solo los no encontrados y errores
    };

  } catch (error) {
    throw new BadRequestException(`Error al verificar CIs en afiliaciones: ${error.message}`);
  }
}

// 33.- GENERAR REPORTE PDF DE VERIFICACIÓN DE AFILIACIONES
async generarReporteVerificacionAfiliaciones(idPlanilla: number): Promise<StreamableFile> {
  try {
    // Validar parámetro
    if (!idPlanilla || idPlanilla < 1) {
      throw new BadRequestException('El ID de la planilla debe ser un número positivo');
    }

    // Obtener información de la planilla
    const planillaInfo = await this.obtenerPlanilla(idPlanilla);
    if (!planillaInfo || !planillaInfo.planilla) {
      throw new BadRequestException('No se encontró la planilla especificada');
    }

    // Ejecutar la verificación
    const verificacion = await this.verificarCiEnAfiliaciones(idPlanilla);

    // Configurar moment para español
    moment.locale('es');

    // Preparar los datos para el reporte
    const data = {
      planilla: {
        id_planilla_aportes: planillaInfo.planilla.id_planilla_aportes,
        com_nro: planillaInfo.planilla.com_nro || 'S/N', // ✅ Número de comprobante
        mes: planillaInfo.planilla.fecha_planilla
          ? moment(planillaInfo.planilla.fecha_planilla).format('MMMM').toUpperCase()
          : 'N/A',
        anio: planillaInfo.planilla.fecha_planilla
          ? moment(planillaInfo.planilla.fecha_planilla).format('YYYY')
          : 'N/A',
        gestion: planillaInfo.planilla.gestion || 'N/A', // ✅ Gestión de la planilla
        empresa: planillaInfo.planilla.empresa?.nombre || 'No disponible', // ✅ Nombre de empresa
        cod_patronal: planillaInfo.planilla.cod_patronal, // ✅ Número patronal
        total_trabajadores: planillaInfo.planilla.total_trabaj,
        fecha_reporte: moment().format('DD/MM/YYYY'),
        hora_reporte: moment().format('HH:mm:ss'),
      },
      resumen: {
        total_consultados: verificacion.resumen.total_consultados,
        encontrados: verificacion.resumen.encontrados_en_afiliaciones,
        no_encontrados: verificacion.resumen.no_encontrados_en_afiliaciones,
        consultas_con_error: verificacion.resumen.consultas_con_error,
        porcentaje_encontrados: verificacion.resumen.porcentaje_encontrados,
        porcentaje_no_encontrados: verificacion.resumen.total_consultados > 0 
          ? ((verificacion.resumen.no_encontrados_en_afiliaciones / verificacion.resumen.total_consultados) * 100).toFixed(2) + '%' 
          : '0%'
      },
      no_encontrados: verificacion.resultados.map((resultado, index) => ({
        nro: index + 1,
        ci: resultado.ci,
        nombre_completo: resultado.nombre_completo,
        estado_consulta: resultado.estado_consulta,
        mensaje: resultado.mensaje,
        tipo_problema: resultado.estado_consulta === 'error' ? 'ERROR DE CONSULTA' : 'NO EXISTE EN SISTEMA'
      })),
      metadatos: {
        total_no_encontrados: verificacion.resultados.length,
        generado_por: planillaInfo.planilla.usuario_creacion || 'Sistema', // ✅ Usuario que generó
        fecha_reporte: moment().format('DD/MM/YYYY'), // ✅ Fecha del reporte
        hora_reporte: moment().format('HH:mm:ss'), // ✅ Hora del reporte
        nota: '- CBES (Sistema de Gestión de Planillas)', // ✅ Nota adicional
        mensaje_conclusion: verificacion.mensaje
      }
    };

    console.log('Datos para el reporte de verificación de afiliaciones:', JSON.stringify(data, null, 2));

    // Ruta de la plantilla
    const templatePath = path.resolve('reports/verificacion_afiliaciones.docx');

    // Verificar si la plantilla existe
    if (!fs.existsSync(templatePath)) {
      throw new BadRequestException(`La plantilla en ${templatePath} no existe`);
    }

    return new Promise<StreamableFile>((resolve, reject) => {
      carbone.render(
        templatePath,
        data,
        { convertTo: 'pdf' },
        (err, result) => {
          if (err) {
            console.error('Error en Carbone:', err);
            return reject(new BadRequestException(`Error al generar el reporte: ${err.message}`));
          }

          console.log('Reporte de verificación de afiliaciones generado correctamente');

          if (typeof result === 'string') {
            result = Buffer.from(result, 'utf-8');
          }

          resolve(
            new StreamableFile(result, {
              type: 'application/pdf',
              disposition: `attachment; filename=verificacion_afiliaciones_planilla_${idPlanilla}_${moment().format('YYYYMMDD')}.pdf`,
            }),
          );
        },
      );
    });
  } catch (error) {
    throw new BadRequestException(`Error al generar el reporte de verificación de afiliaciones: ${error.message}`);
  }
}

// 
async obtenerResumenConAdicionales(idPlanillaMensual: number) {
  const planillaMensual = await this.planillaRepo.findOne({
    where: { id_planilla_aportes: idPlanillaMensual },
    relations: ['planillasAdicionales'],
  });

  if (!planillaMensual) {
    throw new NotFoundException('No se encontró la planilla mensual');
  }

  const totalMensual = parseFloat(planillaMensual.total_importe as any || '0');
  const trabajadoresMensual = planillaMensual.total_trabaj || 0;

  const totalAdicionales = planillaMensual.planillasAdicionales.reduce(
    (acc, p) => acc + parseFloat(p.total_importe as any || '0'),
    0,
  );

  const totalTrabajadoresAdicionales = planillaMensual.planillasAdicionales.reduce(
    (acc, p) => acc + (p.total_trabaj || 0),
    0,
  );

  const totalFinal = totalMensual + totalAdicionales;
  const totalTrabajadores = trabajadoresMensual + totalTrabajadoresAdicionales;

  return {
    id: planillaMensual.id_planilla_aportes,
    total_mensual: totalMensual,
    trabajadores_mensual: trabajadoresMensual,
    adicionales: planillaMensual.planillasAdicionales.map((p) => ({
      id: p.id_planilla_aportes,
      total: parseFloat(p.total_importe as any || '0'),
      trabajadores: p.total_trabaj || 0,
    })),
    total_combinado: totalFinal,
    trabajadores_combinado: totalTrabajadores,
  };
}




}
