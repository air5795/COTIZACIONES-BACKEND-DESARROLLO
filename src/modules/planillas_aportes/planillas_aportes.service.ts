import { Injectable, BadRequestException, StreamableFile } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Not, Repository } from 'typeorm';
import { PlanillasAporte } from './entities/planillas_aporte.entity';
import { PlanillaAportesDetalles } from './entities/planillas_aportes_detalles.entity';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
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
  ) {}

// 1 .-  PROCESAR EXCEL DE APORTES-------------------------------------------------------------------------------------------------------
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
  const { cod_patronal, gestion, mes, tipo_planilla } = createPlanillaDto;

  const empresa = await this.empresasService.findByCodPatronal(cod_patronal);
  if (!empresa) {
    throw new BadRequestException('No se encontró una empresa con el código patronal proporcionado');
  }

  const fechaPlanilla = new Date(`${gestion}-${mes.padStart(2, '0')}-01`);

  if (tipo_planilla === 'Mensual') {
    const existePlanillaMensual = await this.planillaRepo.findOne({
      where: {
        cod_patronal,
        fecha_planilla: fechaPlanilla,
        tipo_planilla: 'Mensual',
      },
    });

    if (existePlanillaMensual) {
      throw new BadRequestException('❌ Ya existe una planilla Mensual para este mes y gestión.');
    }
  }

  const totalImporte = data.reduce((sum, row) => {
    const sumaFila =
      parseFloat(row['Haber Básico'] || '0') +
      parseFloat(row['Bono de antigüedad'] || '0') +
      parseFloat(row['Monto horas extra'] || '0') +
      parseFloat(row['Monto horas extra nocturnas'] || '0') +
      parseFloat(row['Otros bonos y pagos'] || '0');
    return sum + sumaFila;
  }, 0);

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
  });

  const planillaGuardada = await this.planillaRepo.save(nuevaPlanilla);

  const detalles: CreatePlanillaAportesDetallesDto[] = data.map((row) => ({
    id_planilla_aportes: planillaGuardada.id_planilla_aportes,
    nro: row['Nro.'],
    ci: row['Número documento de identidad'],
    apellido_paterno: row['Apellido Paterno'],
    apellido_materno: row['Apellido Materno'],
    nombres: row['Nombres'],
    sexo: row['Sexo (M/F)'],
    cargo: row['Cargo'],
    fecha_nac: row['Fecha de nacimiento']
      ? new Date(1900, 0, row['Fecha de nacimiento'] - 1).toISOString()
      : undefined,
    fecha_ingreso: row['Fecha de ingreso']
      ? new Date(1900, 0, row['Fecha de ingreso'] - 1).toISOString()
      : undefined,
    fecha_retiro: row['Fecha de retiro']
      ? new Date(1900, 0, row['Fecha de retiro'] - 1).toISOString()
      : undefined,
    dias_pagados: row['Días pagados'],
    haber_basico: parseFloat(row['Haber Básico'] || '0'),
    bono_antiguedad: parseFloat(row['Bono de antigüedad'] || '0'),
    monto_horas_extra: parseFloat(row['Monto horas extra'] || '0'),
    monto_horas_extra_nocturnas: parseFloat(row['Monto horas extra nocturnas'] || '0'),
    otros_bonos_pagos: parseFloat(row['Otros bonos y pagos'] || '0'),
    salario: (
      parseFloat(row['Haber Básico'] || '0') +
      parseFloat(row['Bono de antigüedad'] || '0') +
      parseFloat(row['Monto horas extra'] || '0') +
      parseFloat(row['Monto horas extra nocturnas'] || '0') +
      parseFloat(row['Otros bonos y pagos'] || '0')
    ) || 0,
    regional: row['regional'],
  }));

  await this.detalleRepo.save(detalles);

  return {
    mensaje: '✅ Planilla guardada con éxito',
    id_planilla: planillaGuardada.id_planilla_aportes,
  };
}
// 3 .- ACTUALIZAR DETALLES DE PLANILLA DE APORTES -------------------------------------------------------------------------------------------------------
async actualizarDetallesPlanilla(id_planilla: number, data: any[]) {
  const planilla = await this.planillaRepo.findOne({ where: { id_planilla_aportes: id_planilla } });

  if (!planilla) {
    throw new BadRequestException('❌ La planilla no existe.');
  }

  const datosValidos = data.filter(row => 
    row['Número documento de identidad'] && row['Nombres'] && row['Haber Básico']
  );

  if (datosValidos.length === 0) {
    throw new BadRequestException('❌ No se encontraron registros válidos en el archivo.');
  }

  await this.detalleRepo.delete({ id_planilla_aportes: id_planilla });

  const totalImporte = datosValidos.reduce((sum, row) => {
    const sumaFila =
      parseFloat(row['Haber Básico'] || '0') +
      parseFloat(row['Bono de antigüedad'] || '0') +
      parseFloat(row['Monto horas extra'] || '0') +
      parseFloat(row['Monto horas extra nocturnas'] || '0') +
      parseFloat(row['Otros bonos y pagos'] || '0');
    return sum + sumaFila;
  }, 0);

  const totalTrabaj = datosValidos.length;

  const nuevosDetalles = datosValidos.map((row) => ({
    id_planilla_aportes: id_planilla,
    nro: row['Nro.'] || 0,
    ci: row['Número documento de identidad'] || '',
    apellido_paterno: row['Apellido Paterno'] || '',
    apellido_materno: row['Apellido Materno'] || '',
    nombres: row['Nombres'] || '',
    sexo: row['Sexo (M/F)'] || '',
    cargo: row['Cargo'] || '',
    fecha_nac: row['Fecha de nacimiento'] ? new Date(1900, 0, row['Fecha de nacimiento'] - 1) : new Date('1900-01-01'),
    fecha_ingreso: row['Fecha de ingreso'] ? new Date(1900, 0, row['Fecha de ingreso'] - 1) : new Date(),
    fecha_retiro: row['Fecha de retiro'] ? new Date(1900, 0, row['Fecha de retiro'] - 1) : null,
    dias_pagados: row['Días pagados'] || 0,
    haber_basico: parseFloat(row['Haber Básico'] || '0'),
    bono_antiguedad: parseFloat(row['Bono de antigüedad'] || '0'),
    monto_horas_extra: parseFloat(row['Monto horas extra'] || '0'),
    monto_horas_extra_nocturnas: parseFloat(row['Monto horas extra nocturnas'] || '0'),
    otros_bonos_pagos: parseFloat(row['Otros bonos y pagos'] || '0'),
    salario: (
      parseFloat(row['Haber Básico'] || '0') +
      parseFloat(row['Bono de antigüedad'] || '0') +
      parseFloat(row['Monto horas extra'] || '0') +
      parseFloat(row['Monto horas extra nocturnas'] || '0') +
      parseFloat(row['Otros bonos y pagos'] || '0')
    ) || 0,
    regional: row['regional'] || '',
  }));

  await this.detalleRepo.save(nuevosDetalles);

  planilla.total_importe = totalImporte;
  planilla.total_trabaj = totalTrabaj;

  await this.planillaRepo.save(planilla);

  return { 
    mensaje: '✅ Detalles de la planilla actualizados con éxito',
    total_importe: totalImporte,
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
      com_nro: planilla.com_nro,
      cod_patronal: planilla.cod_patronal,
      empresa: planilla.empresa ? planilla.empresa.emp_nom : null,
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
    };

    return { mensaje: 'Planilla obtenida con éxito', planilla: mappedPlanilla };
  } catch (error) {
    throw new BadRequestException(`Error al obtener la planilla: ${error.message}`);
  }
}
// 8.- OBTENER DETALLES DE PLANILLA DE APORTES POR ID DE PLANILLA (TIENE PAGINACION Y BUSQUEDA)-------------------------------------------------------------------------------------------------------
async obtenerDetalles(id_planilla: number, pagina: number = 1, limite: number = 10, busqueda: string = '') {
  try {
    const skip = limite > 0 ? (pagina - 1) * limite : 0;

    const query = this.detalleRepo.createQueryBuilder('detalle')
      .where('detalle.id_planilla_aportes = :id_planilla', { id_planilla })
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
        'detalle.haber_basico'
      ]);

    if (limite > 0) { // Solo aplicar paginación si limite es positivo
      query.skip(skip).take(limite);
    }

    if (busqueda) {
      query.andWhere(
        '(detalle.ci LIKE :busqueda OR detalle.apellido_paterno LIKE :busqueda OR detalle.apellido_materno LIKE :busqueda OR detalle.nombres LIKE :busqueda OR detalle.cargo LIKE :busqueda)',
        { busqueda: `%${busqueda}%` }
      );
    }

    const [detalles, total] = await query.getManyAndCount();

    if (!detalles.length) {
      return { 
        mensaje: 'No hay detalles registrados para esta planilla', 
        detalles: [], 
        total: 0 
      };
    }

    return {
      mensaje: 'Detalles obtenidos con éxito',
      id_planilla,
      trabajadores: detalles,
      total,
      pagina,
      limite
    };
  } catch (error) {
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
async actualizarEstadoAPendiente(id_planilla: number, fecha_declarada?: string) {
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

  // Verificar si la empresa es de tipo 'AP' y actualizar fecha_pago
  if (planilla.empresa?.tipo === 'AP' && planilla.fecha_planilla) {
    const fechaPlanilla = new Date(planilla.fecha_planilla);
    // Calcular el primer día del mes siguiente
    const primerDiaMesSiguiente = new Date(
      fechaPlanilla.getFullYear(),
      fechaPlanilla.getMonth() + 1,
      1
    );
    planilla.fecha_pago = primerDiaMesSiguiente;
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
  };
  await this.notificacionesService.crearNotificacion(notificacionDto);

  return { mensaje: 'Estado de la planilla actualizado a Presentado correctamente' };
}

// 12 .- ACTUALIZAR METODO PARA APROBAR U OBSERVAR LA PLANILLA (ESTADO 2 o 3)- #con notificaciones# -------------------------------------------------------------------------------------------------------
async actualizarEstadoPlanilla(id_planilla: number, estado: number, observaciones?: string) {
  const meses = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
  ];

  const planilla = await this.planillaRepo.findOne({ 
    where: { id_planilla_aportes: id_planilla },
    relations: ['empresa'], // Necesitamos la relación con empresa para obtener emp_nom
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

  // Generar notificación para COTIZACIONES_EMPRESA
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
  };
  
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
    relations: ['empresa'], // Necesitamos la relación con empresa para obtener emp_nom
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

  // Generar notificación para ADMINISTRADOR_COTIZACIONES
  const nombreMes = meses[Number(planilla.mes) - 1];
  const notificacionDto: CreateNotificacioneDto = {
    id_usuario_receptor: 'ADMINISTRADOR_COTIZACIONES',
    tipo_notificacion: 'PLANILLA_CORREGIDA',
    empresa: planilla.empresa?.emp_nom,
    mensaje: `Planilla Mensual Corregida correspondiente a MES: ${nombreMes}, AÑO: ${planilla.gestion}`,
    id_recurso: planilla.id_planilla_aportes,
    tipo_recurso: 'PLANILLA_APORTES',
  };
  
  await this.notificacionesService.crearNotificacion(notificacionDto);

  return { mensaje: 'Planilla corregida y reenviada para validación', total_importe: totalImporteCalculado };
}
// 16.- (METODO AYUDA) OBTENER DETALLES DE PLANILLA POR MES Y GESTION -------------------------------------------------------------------------------------------------------
async obtenerDetallesDeMes(cod_patronal: string, mes: string, gestion: string) {
  const fechaPlanilla = new Date(`${gestion}-${mes.padStart(2, '0')}-01`);
  const planilla = await this.planillaRepo.findOne({
    where: { cod_patronal, fecha_planilla: fechaPlanilla },
  });

  if (!planilla) {
    throw new BadRequestException('No existe planilla para el mes y gestión solicitados.');
  }

  const detalles = await this.detalleRepo.find({
    where: { id_planilla_aportes: planilla.id_planilla_aportes },
    order: { nro: 'ASC' },
  });

  return detalles;
}

// 17.- Método para comparar planillas de dos meses y detectar altas y bajas -------------------------------------------------------------------------------------------------------
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

  console.log(`Comparando planillas para:
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

  // Obtener los detalles de las planillas de los dos meses
  const detallesMesAnterior = await this.obtenerDetallesDeMes(cod_patronal, mesAnteriorNum.toString(), gestionMesAnterior);
  const detallesMesActual = await this.obtenerDetallesDeMes(cod_patronal, mesActualNum.toString(), gestion);

  console.log('Detalles del mes anterior:', detallesMesAnterior);
  console.log('Detalles del mes actual:', detallesMesActual);

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

  // Definir el rango del mes actual para las fechas de retiro
  const mesActualInicio = new Date(`${gestion}-${mesActualNum.toString().padStart(2, '0')}-01`);
  const mesActualFin = new Date(mesActualInicio);
  mesActualFin.setMonth(mesActualFin.getMonth() + 1);

  // Detectar altas y bajas por retiro (incluyendo ingresos y retiros en el mismo mes)
  detallesMesActual.forEach((trabajadorActual) => {
    const esAlta = !trabajadoresMesAnterior.has(trabajadorActual.ci);

    // Verificar si tiene fecha de retiro en el mes actual
    if (trabajadorActual.fecha_retiro) {
      const fechaRetiroActual = new Date(trabajadorActual.fecha_retiro);

      console.log(`Trabajador ${trabajadorActual.ci}: Fecha de retiro: ${fechaRetiroActual}`);
      console.log('Mes actual inicio:', mesActualInicio);
      console.log('Mes actual fin:', mesActualFin);

      if (fechaRetiroActual >= mesActualInicio && fechaRetiroActual < mesActualFin) {
        bajasPorRetiro.push(trabajadorActual);
      }
    }

    // Si es alta y no está en bajas por retiro, agregarlo a altas
    if (esAlta && !bajasPorRetiro.some((baja) => baja.ci === trabajadorActual.ci)) {
      altas.push(trabajadorActual);
    }
  });

  // Detectar bajas por no encontrado
  detallesMesAnterior.forEach((trabajadorAnterior) => {
    if (!trabajadoresMesActual.has(trabajadorAnterior.ci)) {
      bajasNoEncontradas.push(trabajadorAnterior);
    }
  });

  console.log('Altas detectadas:', altas);
  console.log('Bajas por trabajador no encontrado:', bajasNoEncontradas);
  console.log('Bajas por fecha de retiro:', bajasPorRetiro);

  return {
    altas,
    bajas: {
      noEncontradas: bajasNoEncontradas,
      porRetiro: bajasPorRetiro,
    },
    mensaje: 'Comparación de planillas completada con bajas agrupadas.',
  };
}
    
// 18.-  Método para generar el reporte de bajas con Carbone -------------------------------------------------------------------------------------------------------
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
    // Obtener la información de la planilla y sus detalles
    const resultadoPlanilla = await this.obtenerPlanilla(id_planilla);
    // Usa limite: 0 para traer todos los registros sin paginación
    const detallesPlanilla = await this.obtenerDetalles(id_planilla, 1, 0);
    console.log('Total de trabajadores crudos:', detallesPlanilla.trabajadores.length);

    // Verifica cuántos trabajadores se obtienen inicialmente
    console.log('1. Total de trabajadores crudos:', detallesPlanilla.trabajadores.length);
    console.log('1.1. Primeros 5 trabajadores (muestra):', detallesPlanilla.trabajadores.slice(0, 5));

    if (!detallesPlanilla.trabajadores.length) {
      throw new Error('No se encontraron trabajadores para los datos de la planilla.');
    }

    // Extraer la información de la planilla
    const planilla = resultadoPlanilla.planilla;

    // Variables para la sección "totales"
    let totalCantidad = 0;
    let totalGanado = 0;

    // Agrupar los datos por regional
    const regionalesMap = new Map();

    detallesPlanilla.trabajadores.forEach((trabajador, index) => {
      const { regional, salario } = trabajador;
      const salarioNum = parseFloat(salario.toString());

      // Muestra algunos trabajadores para verificar sus datos
      if (index < 5 || index >= detallesPlanilla.trabajadores.length - 5) {
        console.log(`2. Procesando trabajador #${index + 1}:`, { regional, salario });
      }

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
      regionalData.porcentaje_10 = parseFloat((regionalData.total_ganado * 0.10).toFixed(2));

      totalCantidad += 1;
      totalGanado += salarioNum;
    });

    // Verifica los resultados después de procesar
    console.log('3. Totales calculados:', { totalCantidad, totalGanado });
    console.log('3.1. Regionales procesadas (Map):', Array.from(regionalesMap.entries()));

    // Convertir el mapa a un array
    const resumenArray = Array.from(regionalesMap.values());

    // Verifica el resumen antes de formatear
    console.log('4. Resumen sin formatear:', resumenArray);

    // Crear la sección de totales separada
    const totales = {
      cantidad_total: totalCantidad,
      total_ganado: parseFloat(totalGanado.toFixed(2)),
      porcentaje_10: parseFloat((totalGanado * 0.10).toFixed(2))
    };

    // Formato de números
    const formatNumber = (num: number) => new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);

    // Formatear los datos
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

    // Estructura final del JSON
    const data = {
      mensaje: 'Detalles obtenidos con éxito',
      planilla: planilla,
      resumen: formattedResumen,
      totales: formattedTotales
    };

    // Verifica el resultado final
    console.log('5. Respuesta final:', data);

    return data;

  } catch (error) {
    throw new Error('Error en obtenerDatosPlanillaPorRegional: ' + error.message);
  }
}
// 21 ACTUALIZAR FECHA PAGO EN PLANILLA APORTE --------------------------------------------------------------------------------------------------------------------------------------------------------------
async actualizarFechaPago(id_planilla: number, fechaPago?: Date) {
  const planilla = await this.planillaRepo.findOne({ where: { id_planilla_aportes: id_planilla } });

  if (!planilla) {
    throw new BadRequestException('La planilla no existe');
  }

  planilla.fecha_pago = fechaPago;
  await this.planillaRepo.save(planilla);

  return { mensaje: 'Fecha de pago de la planilla añadida correctamente' };
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
async calcularAportes(idPlanilla: number): Promise<PlanillasAporte> {
  try {
    // Validar parámetro
    if (!idPlanilla || idPlanilla < 1) {
      throw new BadRequestException('El ID de la planilla debe ser un número positivo');
    }

    // 1. Obtener la planilla con la relación empresa
    const planilla = await this.planillaRepo.findOne({
      where: { id_planilla_aportes: idPlanilla },
      relations: ['empresa'], // Cargar la relación empresa
    });

    if (!planilla) {
      throw new BadRequestException('Planilla no encontrada');
    }

    // 2. Validar fechas requeridas
    if (!planilla.fecha_declarada || !planilla.fecha_pago) {
      throw new BadRequestException('fecha_declarada y fecha_pago deben estar definidas para calcular los aportes');
    }
    if (!planilla.fecha_planilla) {
      throw new BadRequestException('fecha_planilla debe estar definida para calcular los aportes');
    }

    // 3. Ajustar fechas a la zona horaria de Bolivia (UTC-4)
    const adjustToBoliviaTime = (date: Date): Date => {
      const offsetBolivia = -4 * 60; // Bolivia es UTC-4 (en minutos)
      const utcDate = new Date(date.getTime() + (date.getTimezoneOffset() * 60 * 1000));
      return new Date(utcDate.getTime() + (offsetBolivia * 60 * 1000));
    };

    const fechaPlanillaBolivia = new Date(planilla.fecha_planilla);
    const fechaDeclaradaBolivia = adjustToBoliviaTime(new Date(planilla.fecha_declarada));
    const fechaPagoBolivia = adjustToBoliviaTime(new Date(planilla.fecha_pago));

    // 4. Calcular la fecha límite (último día del mes SIGUIENTE a fecha_planilla)
    const getFechaLimite = (fechaPlanilla: Date): Date => {
      const baseDate = new Date(fechaPlanilla);
      baseDate.setUTCHours(0, 0, 0, 0); // Normalizar a medianoche UTC
      baseDate.setUTCMonth(baseDate.getUTCMonth() + 2, 0); // +2 para llegar al final del mes siguiente
      return adjustToBoliviaTime(baseDate); // Ajustar a UTC-4
    };

    const fechaLimite = getFechaLimite(fechaPlanillaBolivia);

    // 5. Calcular Aporte según el tipo de empresa (usando planilla.empresa.tipo)
    const tipoEmpresa = planilla.empresa?.tipo;
    if (!tipoEmpresa) {
      throw new BadRequestException('No se pudo determinar el tipo de empresa');
    }
    if (tipoEmpresa === 'AP') {
      planilla.aporte_porcentaje = (planilla.total_importe || 0) * 0.10;
    } else if (tipoEmpresa === 'AV') {
      planilla.aporte_porcentaje = (planilla.total_importe || 0) * 0.03;
    } else {
      throw new BadRequestException(`Tipo de empresa no válido: ${tipoEmpresa}`);
    }

    // 6. Obtener UFV Día Oblig. Formal (usando fecha_declarada)
    const fechaDeclaradaForUfv = new Date(fechaDeclaradaBolivia);
    fechaDeclaradaForUfv.setHours(0, 0, 0, 0);
    planilla.ufv_dia_formal = await this.getUfvForDate(fechaDeclaradaForUfv);

    // 7. Obtener UFV Día Presentación (usando fecha_pago - 1 día)
    const fechaPagoForUfv = new Date(fechaPagoBolivia);
    fechaPagoForUfv.setDate(fechaPagoForUfv.getDate() - 1);
    fechaPagoForUfv.setHours(0, 0, 0, 0);
    planilla.ufv_dia_presentacion = await this.getUfvForDate(fechaPagoForUfv);

    // 8. Calcular Aporte Patronal Actualizado
    const calculoAporteActualizado = (planilla.aporte_porcentaje / planilla.ufv_dia_formal) * planilla.ufv_dia_presentacion;
    planilla.aporte_actualizado = calculoAporteActualizado < planilla.aporte_porcentaje ? planilla.aporte_porcentaje : calculoAporteActualizado;

    // 9. Calcular Monto Actualizado
    const calculoMontoActualizado = planilla.aporte_actualizado - planilla.aporte_porcentaje;
    planilla.monto_actualizado = calculoMontoActualizado < 0 ? 0 : calculoMontoActualizado;

    // 10. Calcular 1% Multa por la No Presentación Planilla (solo si aplica)
    const fechaDeclaradaNormalized = new Date(fechaDeclaradaBolivia);
    fechaDeclaradaNormalized.setHours(0, 0, 0, 0);
    const fechaLimiteNormalized = new Date(fechaLimite);
    fechaLimiteNormalized.setHours(0, 0, 0, 0);
    planilla.multa_no_presentacion = fechaDeclaradaNormalized > fechaLimiteNormalized ? planilla.aporte_porcentaje * 0.01 : 0;

    // 11. Calcular Días de Retraso
    const fechaPagoNormalized = new Date(fechaPagoBolivia);
    fechaPagoNormalized.setHours(0, 0, 0, 0);
    const fechaInicioRetraso = new Date(fechaLimite);
    fechaInicioRetraso.setHours(0, 0, 0, 0);
    planilla.dias_retraso = 0;
    if (fechaPagoNormalized > fechaInicioRetraso) {
      const diferenciaEnMilisegundos = fechaPagoNormalized.getTime() - fechaInicioRetraso.getTime();
      planilla.dias_retraso = Math.ceil(diferenciaEnMilisegundos / (1000 * 60 * 60 * 24));
    }

    // 12. Calcular Intereses
    planilla.intereses = (planilla.aporte_actualizado * 0.0999 / 360) * planilla.dias_retraso;

    // 13. Calcular Multa s/Int. 10%
    planilla.multa_sobre_intereses = planilla.intereses * 0.1;

    // 14. Calcular Total a Cancelar Parcial
    planilla.total_a_cancelar_parcial =
      planilla.aporte_porcentaje +
      planilla.monto_actualizado +
      planilla.multa_no_presentacion +
      planilla.intereses +
      planilla.multa_sobre_intereses;

    // 15. Calcular Total Multas
    planilla.total_multas = planilla.multa_no_presentacion + planilla.multa_sobre_intereses;

    // 16. Calcular Total Tasa de Interés
    planilla.total_tasa_interes = planilla.intereses;
    

    // 17. Calcular Total a Cancelar (incluye 5 Bs solo para tipo 'AV')
    planilla.total_a_cancelar = planilla.total_a_cancelar_parcial + (planilla.empresa?.tipo === 'AV' ? 5 : 0);

    // 18. Guardar los cambios
    await this.planillaRepo.save(planilla);

    return planilla;
  } catch (error) {
    throw new BadRequestException(`Error al calcular los aportes: ${error.message}`);
  }
}

// 24 .- calcular aportes con fecha pago -------------------------------------------------------------------------------------------------------
async calcularAportesPreliminar(idPlanilla: number, fechaPagoPropuesta: Date): Promise<any> {
  try {
    // Validar parámetros
    if (!idPlanilla || idPlanilla < 1) {
      throw new BadRequestException('El ID de la planilla debe ser un número positivo');
    }
    if (!fechaPagoPropuesta || isNaN(fechaPagoPropuesta.getTime())) {
      throw new BadRequestException('La fecha de pago propuesta debe ser una fecha válida');
    }

    // 1. Obtener la planilla con la relación empresa
    const planilla = await this.planillaRepo.findOne({
      where: { id_planilla_aportes: idPlanilla },
      relations: ['empresa'], // Cargar la relación empresa
    });

    if (!planilla) {
      throw new BadRequestException('Planilla no encontrada');
    }

    // 2. Validar fechas requeridas
    if (!planilla.fecha_declarada) {
      throw new BadRequestException('fecha_declarada debe estar definida para calcular los aportes');
    }
    if (!planilla.fecha_planilla) {
      throw new BadRequestException('fecha_planilla debe estar definida para calcular los aportes');
    }

    // 3. Ajustar fechas a la zona horaria de Bolivia (UTC-4)
    const adjustToBoliviaTime = (date: Date): Date => {
      const offsetBolivia = -4 * 60; // Bolivia es UTC-4 (en minutos)
      const utcDate = new Date(date.getTime() + (date.getTimezoneOffset() * 60 * 1000));
      return new Date(utcDate.getTime() + (offsetBolivia * 60 * 1000));
    };

    const fechaPlanillaBolivia = new Date(planilla.fecha_planilla);
    const fechaDeclaradaBolivia = adjustToBoliviaTime(new Date(planilla.fecha_declarada));
    const fechaPagoBolivia = adjustToBoliviaTime(new Date(fechaPagoPropuesta));

    // 4. Calcular la fecha límite (último día del mes SIGUIENTE a fecha_planilla)
    const getFechaLimite = (fechaPlanilla: Date): Date => {
      const baseDate = new Date(fechaPlanilla);
      baseDate.setUTCHours(0, 0, 0, 0); // Normalizar a medianoche UTC
      baseDate.setUTCMonth(baseDate.getUTCMonth() + 2, 0); // +2 para llegar al final del mes siguiente
      return adjustToBoliviaTime(baseDate); // Ajustar a UTC-4
    };

    const fechaLimite = getFechaLimite(fechaPlanillaBolivia);

    // 5. Calcular Aporte según el tipo de empresa (usando planilla.empresa.tipo)
    let aportePorcentaje: number;
    const tipoEmpresa = planilla.empresa?.tipo;
    if (!tipoEmpresa) {
      throw new BadRequestException('No se pudo determinar el tipo de empresa');
    }
    if (tipoEmpresa === 'AP') {
      aportePorcentaje = (planilla.total_importe || 0) * 0.10;
    } else if (tipoEmpresa === 'AV') {
      aportePorcentaje = (planilla.total_importe || 0) * 0.03;
    } else {
      throw new BadRequestException(`Tipo de empresa no válido: ${tipoEmpresa}`);
    }

    // 6. Obtener UFV Día Oblig. Formal (usando fecha_declarada)
    const fechaDeclaradaForUfv = new Date(fechaDeclaradaBolivia);
    fechaDeclaradaForUfv.setHours(0, 0, 0, 0);
    const ufvDiaFormal = await this.getUfvForDate(fechaDeclaradaForUfv);

    // 7. Obtener UFV Día Presentación (usando fecha_pago propuesta - 1 día)
    const fechaPagoForUfv = new Date(fechaPagoBolivia);
    fechaPagoForUfv.setDate(fechaPagoForUfv.getDate() - 1);
    fechaPagoForUfv.setHours(0, 0, 0, 0);
    const ufvDiaPresentacion = await this.getUfvForDate(fechaPagoForUfv);

    // 8. Calcular Aporte Patronal Actualizado
    const calculoAporteActualizado = (aportePorcentaje / ufvDiaFormal) * ufvDiaPresentacion;
    const aporteActualizado = calculoAporteActualizado < aportePorcentaje ? aportePorcentaje : calculoAporteActualizado;

    // 9. Calcular Monto Actualizado
    const calculoMontoActualizado = aporteActualizado - aportePorcentaje;
    const montoActualizado = calculoMontoActualizado < 0 ? 0 : calculoMontoActualizado;

    // 10. Calcular 1% Multa por la No Presentación Planilla (solo si aplica)
    const fechaDeclaradaNormalized = new Date(fechaDeclaradaBolivia);
    fechaDeclaradaNormalized.setHours(0, 0, 0, 0);
    const fechaLimiteNormalized = new Date(fechaLimite);
    fechaLimiteNormalized.setHours(0, 0, 0, 0);
    const aplicaMultaNoPresentacion = fechaDeclaradaNormalized > fechaLimiteNormalized;
    const multaNoPresentacion = aplicaMultaNoPresentacion ? aportePorcentaje * 0.01 : 0;

    // 11. Calcular Días de Retraso
    const fechaPagoNormalized = new Date(fechaPagoBolivia);
    fechaPagoNormalized.setHours(0, 0, 0, 0);
    const fechaInicioRetraso = new Date(fechaLimite);
    fechaInicioRetraso.setHours(0, 0, 0, 0);
    
    let diasRetraso = 0;
    if (fechaPagoNormalized > fechaInicioRetraso) {
      const diferenciaEnMilisegundos = fechaPagoNormalized.getTime() - fechaInicioRetraso.getTime();
      diasRetraso = Math.ceil(diferenciaEnMilisegundos / (1000 * 60 * 60 * 24) - 1);
    }

    // 12. Calcular Intereses
    const intereses = (aporteActualizado * 0.0999 / 360) * diasRetraso;

    // 13. Calcular Multa s/Int. 10%
    const multaSobreIntereses = intereses * 0.1;

    // 14. Calcular Total a Cancelar Parcial
    const totalACancelarParcial =
      aportePorcentaje +
      montoActualizado +
      multaNoPresentacion +
      intereses +
      multaSobreIntereses;

    // 15. Calcular Total Multas
    const totalMultas = multaNoPresentacion + multaSobreIntereses;

    // 16. Calcular Total Tasa de Interés
    const totalTasaInteres = intereses;

    // 17. Calcular Total a Cancelar (incluye 5 Bs solo para tipo 'AV')
    const totalACancelar = totalACancelarParcial + (tipoEmpresa === 'AV' ? 5 : 0);

    // Devolver un objeto con todos los valores calculados
    return {
      total_importe: planilla.total_importe || 0,
      aporte_porcentaje: aportePorcentaje,
      ufv_dia_formal: ufvDiaFormal,
      ufv_dia_presentacion: ufvDiaPresentacion,
      fecha_declarada: planilla.fecha_declarada,
      fecha_pago: fechaPagoPropuesta,
      aporte_actualizado: aporteActualizado,
      monto_actualizado: montoActualizado,
      multa_no_presentacion: multaNoPresentacion,
      dias_retraso: diasRetraso,
      intereses: intereses,
      multa_sobre_intereses: multaSobreIntereses,
      total_a_cancelar_parcial: totalACancelarParcial,
      total_multas: totalMultas,
      total_tasa_interes: totalTasaInteres,
      total_a_cancelar: totalACancelar,
    };
  } catch (error) {
    throw new BadRequestException(`Error al calcular los aportes preliminares: ${error.message}`);
  }
}
// 25 .- reporte DS 08 
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
        /* detalles: planilla.detalles || [], */
      },
    };

    // Ruta de la plantilla de Carbone
    const templatePath = path.resolve(
      'src/modules/planillas_aportes/templates/resumen_mensual.docx',
    );

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

 // 26 .- REPORTE DE DECLRACION DE APORTE Y MUESTRA REGIONALES 
async generarReportePlanillaPorRegional(idPlanilla: number): Promise<StreamableFile> {
  try {

    const datosPlanilla = await this.obtenerDatosPlanillaPorRegional(idPlanilla);

    if (!datosPlanilla || !datosPlanilla.planilla) {
      throw new Error('Planilla no encontrada o sin datos');
    }

    const porcentaje = datosPlanilla.planilla.total_importe * 0.10;

    moment.locale('es');

    const data = {
      planilla: {
        id_planilla_aportes: datosPlanilla.planilla.id_planilla_aportes,
        mes: moment(datosPlanilla.planilla.fecha_planilla).format('MMMM').toUpperCase(),
        anio: moment(datosPlanilla.planilla.fecha_planilla).format('YYYY'),
        fecha_declarada: moment(datosPlanilla.planilla.fecha_declarada).format('DD/MM/YYYY'),
        fecha_pago: moment(datosPlanilla.planilla.fecha_pago).format('DD/MM/YYYY'),
        tipo_empresa: datosPlanilla.planilla.tipo_empresa,
        total_importe: datosPlanilla.planilla.total_importe,
        aporte_porcentaje: datosPlanilla.planilla.aporte_porcentaje,
        empresa: datosPlanilla.planilla.empresa,
        total_trabaj: datosPlanilla.planilla.total_trabaj,
        com_nro: datosPlanilla.planilla.com_nro,
        aporte_porce: datosPlanilla.planilla.aporte_porcentaje,
        patronal: datosPlanilla.planilla.cod_patronal,
        porcentaje: porcentaje,
        
      },
      resumen: datosPlanilla.resumen.map(region => ({
        regional: region.regional,
        cantidad: region.cantidad,
        total_ganado: region.total_ganado,
        porcentaje_10: region.porcentaje_10,
      })),
      totales: {
        cantidad_total: datosPlanilla.totales.cantidad_total,
        total_ganado: datosPlanilla.totales.total_ganado,
        porcentaje_10: datosPlanilla.totales.porcentaje_10,
      },
    };

    console.log('Datos para el reporte por regional:', JSON.stringify(data, null, 2));

    // Ruta de la plantilla de Carbone (crea esta plantilla según tu diseño)
    const templatePath = path.resolve(
      'src/modules/planillas_aportes/templates/resumen.docx',
    );

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

// 27 .- REPORTE DE APORTES RECIBIDOS POR MES
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

    // Ruta de la plantilla de Carbone
    const templatePath = path.resolve(
      'src/modules/planillas_aportes/templates/aportes-mensuales.docx',
    );

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



}
