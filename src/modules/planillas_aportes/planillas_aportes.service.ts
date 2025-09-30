import { Injectable, BadRequestException, StreamableFile, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Brackets, In, Not, Repository } from 'typeorm';
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
import { PagoAporte } from '../pagos-aportes/entities/pagos-aporte.entity';
import { DataSource } from 'typeorm';

@Injectable()
export class PlanillasAportesService {
  findOne(idPlanillaAportes: number) {
    throw new Error('Method not implemented.');
  }
  constructor(
    @InjectRepository(PlanillasAporte)
    private planillaRepo: Repository<PlanillasAporte>,
    private readonly httpService: HttpService,
    private notificacionesService: NotificacionesService,

    @InjectRepository(PlanillaAportesDetalles)
    private detalleRepo: Repository<PlanillaAportesDetalles>,

    // Agregar el repositorio de PagoAporte
    @InjectRepository(PagoAporte)
    private pagoAporteRepo: Repository<PagoAporte>,

    private readonly empresasService: EmpresasService,
    private readonly externalApiService: ExternalApiService,
    private readonly dataSource: DataSource,
  ) {}


//* DESCARGAR PLANTILLA DE EXCEL PARA PLANILLAS DE APORTES (version extendida)
async descargarPlantilla(): Promise<StreamableFile> {
  const filePath = path.resolve('reports/PLANTILLA-OFICIAL.xlsx',);
  console.log('Ruta generada:', filePath);
  if (!fs.existsSync(filePath)) {
    throw new BadRequestException('La plantilla no se encuentra en el servidor');
  }
  const fileStream = fs.createReadStream(filePath);
  return new StreamableFile(fileStream);
}

//* DESCARGAR PLANTILLA DE EXCEL PARA PLANILLAS DE APORTES (version corta)
async descargarPlantillaCorta(): Promise<StreamableFile> {
  const filePath = path.resolve('reports/PLANTILLA-OFICIAL-CORTO.xlsx',);
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

  // Calcular totales consolidados desde los detalles (trabajadores únicos por CI)
  const totalesConsolidados = await this.detalleRepo
    .createQueryBuilder('detalle')
    .select([
      'SUM(detalle.salario) as total_importe',
      'COUNT(DISTINCT detalle.ci) as total_trabajadores'
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
      /* const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { range: 1 }); */


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

  // 🔄 CREAR QUERY RUNNER PARA TRANSACCIONES
  const queryRunner = this.planillaRepo.manager.connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // ✅ VALIDACIONES INICIALES (usando empresasService fuera de la transacción)
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
      planillaMensualExistente = await queryRunner.manager.findOne(PlanillasAporte, {
        where: {
          cod_patronal,
          fecha_planilla: fechaPlanilla,
          tipo_planilla: 'Mensual',
          estado: In([1, 2]),
        },
      });

      if (!planillaMensualExistente) {
        throw new BadRequestException('Debe existir una planilla Mensual activa (estado = 1 o 2) antes de subir una Adicional.');
      }
    } else if (tipo_planilla === 'Mensual') {
      // Validación para no duplicar planilla mensual (sin importar estado)
      planillaMensualExistente = await queryRunner.manager.findOne(PlanillasAporte, {
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

    // ✅ MANTENER TU LÓGICA DE CÁLCULOS (parseOrZero, totalImporte, etc.)
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

    const trabajadoresUnicos = new Set(data.map(row => row['Número documento de identidad'])).size;
    const totalTrabaj = trabajadoresUnicos;

    console.log(`📊 Estadísticas de guardado:
    - Registros totales: ${data.length}
    - Trabajadores únicos: ${totalTrabaj}
    - Trabajadores con múltiples cargos: ${data.length - totalTrabaj}`);

    // ✅ CREAR PLANILLA USANDO QUERY RUNNER
    const nuevaPlanilla = queryRunner.manager.create(PlanillasAporte, {
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

    const planillaGuardada = await queryRunner.manager.save(nuevaPlanilla);


    // ✅ LÓGICA PARA PLANILLAS ADICIONALES (OPTIMIZADA)
    let nroBase = 1;

    if (tipo_planilla === 'Planilla Adicional') {
      // 🚀 CONSULTA OPTIMIZADA para encontrar el máximo número
      const maxNroResult = await queryRunner.manager
        .createQueryBuilder()
        .select('MAX(detalle.nro)', 'max')
        .from(PlanillaAportesDetalles, 'detalle')
        .innerJoin(PlanillasAporte, 'planilla', 'planilla.id_planilla_aportes = detalle.id_planilla_aportes')
        .where('(planilla.id_planilla_aportes = :planillaId OR planilla.id_planilla_origen = :planillaId)', 
          { planillaId: planillaMensualExistente.id_planilla_aportes })
        .getRawOne();

      nroBase = (parseInt(maxNroResult?.max || '0', 10) || 0) + 1;
    }

    // VALIDACIONES - MODIFICADAS PARA RECOPILAR ERRORES
    // Array para recopilar todos los errores de validación
    const erroresValidacion: string[] = [];

    // FUNCIÓN DE VALIDACIÓN DE SEXO ------------------------------------------------------------------------------------------------------
    const validarSexo = (sexo: any, fila: number, errores: string[]): string => {
      const sexoStr = sexo?.toString()?.trim()?.toUpperCase();
      if (!sexoStr) {
        errores.push(`Fila ${fila}: El campo "Sexo" es obligatorio y no puede estar vacío.`);
        return '';
      }
      if (!['M', 'F'].includes(sexoStr)) {
        errores.push(`Fila ${fila}: El campo "Sexo" debe ser 'M' (Masculino) o 'F' (Femenino). Valor encontrado: "${sexo}"`);
        return '';
      }
      return sexoStr;
    };

    // FUNCIÓN DE VALIDACIÓN DE REGIONAL ------------------------------------------------------------------------------------------------------
    const validarRegional = (regional: any, fila: number, errores: string[]): string => {
      const regionalStr = regional?.toString()?.trim()?.toUpperCase();
      if (!regionalStr) {
        errores.push(`Fila ${fila}: El campo "Regional" es obligatorio y no puede estar vacío.`);
        return '';
      }
      
      const regionalesValidas = [
        'LA PAZ', 'COCHABAMBA', 'SANTA CRUZ', 'ORURO', 
        'TARIJA', 'POTOSI', 'PANDO', 'BENI', 'CHUQUISACA'
      ];
      
      if (!regionalesValidas.includes(regionalStr)) {
        errores.push(`Fila ${fila}: El campo "Regional" debe ser uno de: ${regionalesValidas.join(', ')}. Valor encontrado: "${regional}"`);
        return '';
      }
      
      return regionalStr;
    };

    // FUNCIÓN DE VALIDACIÓN DE DÍAS PAGADOS ------------------------------------------------------------------------------------------------------
    const validarDiasPagados = (diasPagados: any, fila: number, errores: string[]): number => {
      const diasStr = diasPagados?.toString()?.trim();     
      if (!diasStr) {
        errores.push(`Fila ${fila}: El campo "Días pagados" es obligatorio y no puede estar vacío.`);
        return 0;
      }
      if (!/^\d+$/.test(diasStr)) {
        errores.push(`Fila ${fila}: El campo "Días pagados" debe contener solo números enteros sin puntos ni caracteres adicionales. Valor encontrado: "${diasPagados}"`);
        return 0;
      }
      const dias = parseInt(diasStr, 10);
      if (isNaN(dias)) {
        errores.push(`Fila ${fila}: El campo "Días pagados" no es un número válido. Valor encontrado: "${diasPagados}"`);
        return 0;
      }
      if (dias < 0 || dias > 31) {
        errores.push(`Fila ${fila}: El campo "Días pagados" debe estar entre 1 y 31 días. Valor encontrado: ${dias}`);
        return 0;
      }
      return dias;
    };

    // FUNCIÓN DE VALIDACIÓN DE APELLIDO PATERNO ------------------------------------------------------------------------------------------------------
    const validarApellidoPaterno = (apellidoPaterno: any, fila: number, errores: string[]): string => {
      const apellidoStr = apellidoPaterno?.toString()?.trim()?.toUpperCase();
      if (!apellidoStr) {
        errores.push(`Fila ${fila}: El campo "Apellido Paterno" es obligatorio. Si no tiene apellido paterno, coloque "0".`);
        return '';
      }
      if (apellidoStr !== "0" && !/^[A-ZÁÉÍÓÚÑ\s]+$/.test(apellidoStr)) {
        errores.push(`Fila ${fila}: El campo "Apellido Paterno" solo puede contener letras y espacios (sin tildes), o "0" si no tiene apellido paterno. Valor encontrado: "${apellidoPaterno}"`);
        return apellidoStr;
      }
      return apellidoStr;
    };

    // FUNCIÓN DE VALIDACIÓN DE APELLIDO MATERNO ------------------------------------------------------------------------------------------------------
    const validarApellidoMaterno = (apellidoMaterno: any, fila: number, errores: string[]): string => {
      const apellidoStr = apellidoMaterno?.toString()?.trim()?.toUpperCase();
      if (!apellidoStr) {
        errores.push(`Fila ${fila}: El campo "Apellido Materno" es obligatorio. Si no tiene apellido materno, coloque "0".`);
        return '';
      }
      if (apellidoStr !== "0" && !/^[A-ZÁÉÍÓÚÑ\s]+$/.test(apellidoStr)) {
        errores.push(`Fila ${fila}: El campo "Apellido Materno" solo puede contener letras y espacios (sin tildes), o "0" si no tiene apellido materno. Valor encontrado: "${apellidoMaterno}"`);
        return apellidoStr;
      }      
      return apellidoStr;
    };

    // FUNCIÓN DE VALIDACIÓN DE NOMBRES ------------------------------------------------------------------------------------------------------
    const validarNombres = (nombres: any, fila: number, errores: string[]): string => {
      const nombresStr = nombres?.toString()?.trim()?.toUpperCase();
      
      if (!nombresStr) {
        errores.push(`Fila ${fila}: El campo "Nombres" es obligatorio y no puede estar vacío.`);
        return '';
      }
      // Validar que solo contenga letras y espacios
      if (!/^[A-ZÁÉÍÓÚÑ\s]+$/.test(nombresStr)) {
        errores.push(`Fila ${fila}: El campo "Nombres" solo puede contener letras y espacios (sin tildes). Valor encontrado: "${nombres}"`);
        return nombresStr;
      }
      // Validar longitud mínima (al menos 2 caracteres)
      if (nombresStr.length < 2) {
        errores.push(`Fila ${fila}: El campo "Nombres" debe tener al menos 2 caracteres. Valor encontrado: "${nombres}"`);
        return nombresStr;
      }
      return nombresStr;
    };

    // FUNCIÓN DE VALIDACIÓN DE CARGO ------------------------------------------------------------------------------------------------------
    const validarCargo = (cargo: any, fila: number, errores: string[]): string => {
      const cargoStr = cargo?.toString()?.trim()?.toUpperCase();
      if (!cargoStr) {
        errores.push(`Fila ${fila}: El campo "Cargo" es obligatorio y no puede estar vacío.`);
        return '';
      }
      // Validar longitud mínima (al menos 2 caracteres)
      if (cargoStr.length < 2) {
        errores.push(`Fila ${fila}: El campo "Cargo" debe tener al menos 2 caracteres. Valor encontrado: "${cargo}"`);
        return cargoStr;
      }
      // Validar longitud máxima (máximo 100 caracteres)
      if (cargoStr.length > 100) {
        errores.push(`Fila ${fila}: El campo "Cargo" no puede exceder 100 caracteres. Longitud actual: ${cargoStr.length}`);
        return cargoStr;
      }
      return cargoStr;
    };

    // FUNCIÓN DE VALIDACIÓN DE CAMPOS MONETARIOS ------------------------------------------------------------------------------------------------------
    const validarCampoMonetario = (valor: any, nombreCampo: string, fila: number, errores: string[], esObligatorio: boolean = false): number => {
      // Si es obligatorio y está vacío, agregar error
      if (esObligatorio && (valor === null || valor === undefined || valor === '' || valor === 0)) {
        errores.push(`Fila ${fila}: El campo "${nombreCampo}" es obligatorio y no puede estar vacío.`);
        return 0;
      }
      // Si no es obligatorio y está vacío, retornar 0
      if (!esObligatorio && (valor === null || valor === undefined || valor === '')) {
        return 0;
      }
      // Usar la función parseOrZero existente para el parsing
      return parseOrZero(valor);
    };

    // FUNCIÓN DE VALIDACIÓN DE FECHAS MODIFICADA ------------------------------------------------------------------------------------------------------
    const validarFecha = (fechaValue: any, nombreCampo: string, fila: number, errores: string[], esObligatorio: boolean = true): string | undefined => {
      if (!fechaValue) {
        if (esObligatorio) {
          errores.push(`Fila ${fila}: El campo "${nombreCampo}" es obligatorio y no puede estar vacío.`);
        }
        return undefined;
      }
      
      let fechaParseada: Date | null = null;
      
      try {
        // Si es un número (fecha serial de Excel)
        if (typeof fechaValue === 'number') {
          const excelEpoch = new Date(1899, 11, 30);
          fechaParseada = new Date(excelEpoch.getTime() + fechaValue * 24 * 60 * 60 * 1000);
        } 
        // Si es string, intentar parsear formato dd/mm/yyyy
        else if (typeof fechaValue === 'string') {
          const fechaStr = fechaValue.toString().trim();
          
          // Validar formato dd/mm/yyyy con regex
          const formatoValido = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.test(fechaStr);
          if (!formatoValido) {
            errores.push(`Fila ${fila}: El campo "${nombreCampo}" debe tener formato dd/mm/aaaa. Ejemplo: 24/03/1988. Valor encontrado: "${fechaValue}"`);
            return undefined;
          }
          
          // Extraer día, mes y año
          const partes = fechaStr.split('/');
          const dia = parseInt(partes[0], 10);
          const mes = parseInt(partes[1], 10);
          const anio = parseInt(partes[2], 10);
          
          // Crear fecha (mes - 1 porque Date usa índice 0-11 para meses)
          fechaParseada = new Date(anio, mes - 1, dia);
          
          // Verificar si la fecha es válida
          if (fechaParseada.getDate() !== dia || fechaParseada.getMonth() !== mes - 1 || fechaParseada.getFullYear() !== anio) {
            errores.push(`Fila ${fila}: La "${nombreCampo}" no es válida. Verifique que el día, mes y año sean correctos. Valor encontrado: "${fechaValue}"`);
            return undefined;
          }
        } 
        // Si ya es un objeto Date
        else if (fechaValue instanceof Date) {
          fechaParseada = fechaValue;
        } 
        else {
          errores.push(`Fila ${fila}: El campo "${nombreCampo}" tiene un formato no reconocido. Debe ser dd/mm/aaaa. Valor encontrado: "${fechaValue}"`);
          return undefined;
        }
        
        // Validar que la fecha sea válida
        if (!fechaParseada || isNaN(fechaParseada.getTime())) {
          errores.push(`Fila ${fila}: La "${nombreCampo}" no es válida. Valor encontrado: "${fechaValue}"`);
          return undefined;
        }
        
        return fechaParseada.toISOString();
        
      } catch (error) {
        errores.push(`Fila ${fila}: Error al procesar la fecha "${nombreCampo}". Valor encontrado: "${fechaValue}"`);
        return undefined;
      }
    };




    // ✅ PREPARAR DETALLES CON VALIDACIÓN COMPLETA
    const detalles: CreatePlanillaAportesDetallesDto[] = data.map((row, index) => {
      const fila = index + 1;
      const redondear = (valor: any): number => parseFloat(parseOrZero(valor).toFixed(6));
      const haberBasico = redondear(row['Haber Básico']);
      const bonoAntiguedad = redondear(row['Bono de antigüedad']);
      const montoHorasExtra = redondear(row['Monto horas extra']);
      const montoHorasExtraNocturnas = redondear(row['Monto horas extra nocturnas']);
      const otrosBonosPagos = redondear(row['Otros bonos y pagos']);

      return {
        id_planilla_aportes: planillaGuardada.id_planilla_aportes,
        nro: tipo_planilla === 'Mensual' ? fila : nroBase + index,
        ci: row['Número documento de identidad']?.toString(),
        apellido_paterno: validarApellidoPaterno(row['Apellido Paterno'], fila, erroresValidacion),
        apellido_materno: validarApellidoMaterno(row['Apellido Materno'], fila, erroresValidacion),
        nombres: validarNombres(row['Nombres'], fila, erroresValidacion),
        sexo: validarSexo(row['Sexo (M/F)'], fila, erroresValidacion),
        cargo: validarCargo(row['Cargo'], fila, erroresValidacion),
        fecha_nac: validarFecha(row['Fecha de nacimiento'], 'Fecha de nacimiento', fila, erroresValidacion, true),
        fecha_ingreso: validarFecha(row['Fecha de ingreso'], 'Fecha de ingreso', fila, erroresValidacion, true),
        fecha_retiro: row['Fecha de retiro'] ? validarFecha(row['Fecha de retiro'], 'Fecha de retiro', fila, erroresValidacion, false) : undefined,
        dias_pagados: validarDiasPagados(row['Días pagados'], fila, erroresValidacion),

        haber_basico: validarCampoMonetario(row['Haber Básico'], 'Haber Básico', fila, erroresValidacion, false),
        bono_antiguedad: validarCampoMonetario(row['Bono de antigüedad'], 'Bono de antigüedad', fila, erroresValidacion, false),
        monto_horas_extra: validarCampoMonetario(row['Monto horas extra'], 'Monto horas extra', fila, erroresValidacion, false),
        monto_horas_extra_nocturnas: validarCampoMonetario(row['Monto horas extra nocturnas'], 'Monto horas extra nocturnas', fila, erroresValidacion, false),
        otros_bonos_pagos: validarCampoMonetario(row['Otros bonos y pagos'], 'Otros bonos y pagos', fila, erroresValidacion, false),
        
        salario: parseFloat((haberBasico + bonoAntiguedad + montoHorasExtra + montoHorasExtraNocturnas + otrosBonosPagos).toFixed(6)),
        regional: validarRegional(row['regional'], fila, erroresValidacion),
        tipo: tipo_planilla.toLowerCase().replace(' ', '_') as 'mensual' | 'planilla_adicional',
      };
    });

    // ✅ VERIFICAR SI HAY ERRORES DE VALIDACIÓN Y LANZAR EXCEPCIÓN CON TODOS LOS ERRORES
    if (erroresValidacion.length > 0) {
      // Limitar el número de errores mostrados para evitar respuestas muy largas
      const maxErrores = 50; // Mostrar máximo 50 errores
      const erroresAMostrar = erroresValidacion.slice(0, maxErrores);
      let mensajeError = `Se encontraron ${erroresValidacion.length} error(es) de validación en la planilla:\n\n`;
      
      erroresAMostrar.forEach((error, index) => {
        mensajeError += `${index + 1}. ${error}\n`;
      });

      if (erroresValidacion.length > maxErrores) {
        mensajeError += `\n... y ${erroresValidacion.length - maxErrores} error(es) adicional(es).\n`;
      }

      mensajeError += '\nPor favor, corrija todos los errores antes de volver a subir la planilla.';
      
      throw new BadRequestException(mensajeError);
    }

    // 🚀 GUARDAR DETALLES EN LOTES USANDO QUERY RUNNER
    const batchSize = 1000;
    console.log(`💾 Iniciando guardado de ${detalles.length} detalles en lotes de ${batchSize}...`);
    
    for (let i = 0; i < detalles.length; i += batchSize) {
      const batch = detalles.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(detalles.length / batchSize);
      
      console.log(`📦 Procesando lote ${batchNumber}/${totalBatches} (${batch.length} registros)...`);
      
      // Crear entidades y guardar con query runner
      const detalleEntities = batch.map(detalle => 
        queryRunner.manager.create(PlanillaAportesDetalles, detalle)
      );
      
      await queryRunner.manager.save(detalleEntities);
    }

    // ✅ COMMIT DE LA TRANSACCIÓN
    await queryRunner.commitTransaction();
    
    console.log(`✅ Planilla guardada exitosamente con ${detalles.length} detalles`);

    return {
      mensaje: '✅ Planilla guardada con éxito',
      id_planilla: planillaGuardada.id_planilla_aportes,
      estadisticas: {
        total_registros: detalles.length,
        trabajadores_unicos: totalTrabaj,
        total_importe: totalImporte,
        lotes_procesados: Math.ceil(detalles.length / batchSize)
      }
    };

  } catch (error) {
    // 🔄 ROLLBACK EN CASO DE ERROR
    console.error('❌ Error en guardarPlanilla, haciendo rollback:', error.message);
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    // 🔄 LIBERAR QUERY RUNNER
    await queryRunner.release();
  }
}
// 3 .- ACTUALIZAR DETALLES DE PLANILLA DE APORTES -------------------------------------------------------------------------------------------------------
async actualizarDetallesPlanilla(id_planilla: number, data: any[], createPlanillaDto?: CreatePlanillasAporteDto) {
  // 🔄 CREAR QUERY RUNNER PARA TRANSACCIONES
  const queryRunner = this.planillaRepo.manager.connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // ✅ VALIDACIONES INICIALES DENTRO DE LA TRANSACCIÓN
    const planilla = await queryRunner.manager.findOne(PlanillasAporte, {
      where: { id_planilla_aportes: id_planilla },
      relations: ['empresa'],
    });

    if (!planilla) {
      throw new NotFoundException('❌ La planilla no existe.');
    }

    if (planilla.estado !== 0) {
      throw new BadRequestException('❌ Solo se pueden actualizar planillas en estado borrador.');
    }

    // ✅ VALIDAR DATOS DE ENTRADA
    const datosValidos = data.filter(row =>
      row['Número documento de identidad'] &&
      row['Nombres'] &&
      row['Haber Básico']
    );

    if (datosValidos.length === 0) {
      throw new BadRequestException('❌ No se encontraron registros válidos en el archivo.');
    }

    // 🚀 VALIDACIÓN DE TAMAÑO DE DATOS
    if (datosValidos.length > 50000) {
      throw new BadRequestException(`Los datos contienen ${datosValidos.length} registros. El máximo permitido es 50,000.`);
    }

    console.log(`📊 Iniciando actualización de planilla ${id_planilla}:
    - Registros válidos: ${datosValidos.length}
    - Planilla: ${planilla.tipo_planilla} - ${planilla.cod_patronal}`);

    let planillaMensualExistente: PlanillasAporte | null = null;
    
    if (planilla.tipo_planilla === 'Planilla Adicional') {
      if (planilla.id_planilla_origen) {
        planillaMensualExistente = await queryRunner.manager.findOne(PlanillasAporte, {
          where: { id_planilla_aportes: planilla.id_planilla_origen }
        });
      } else {
        const fechaPlanilla = new Date(`${planilla.gestion}-${planilla.mes.padStart(2, '0')}-01`);
        planillaMensualExistente = await queryRunner.manager.findOne(PlanillasAporte, {
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

    // ✅ VALIDACIONES ADICIONALES SI SE PROPORCIONA DTO
    if (createPlanillaDto) {
      const { cod_patronal, gestion, mes, tipo_planilla } = createPlanillaDto;

      const empresa = await this.empresasService.findByCodPatronal(cod_patronal);
      if (!empresa) {
        throw new BadRequestException('No se encontró una empresa con el código patronal proporcionado');
      }

      if (tipo_planilla === 'Planilla Adicional') {
        planillaMensualExistente = await queryRunner.manager.findOne(PlanillasAporte, {
          where: {
            cod_patronal,
            tipo_planilla: 'Mensual',
            estado: In([1, 2]),
          },
        });

        if (!planillaMensualExistente) {
          throw new BadRequestException('Debe existir una planilla Mensual activa (estado = 1 o 2) antes de subir una Adicional.');
        }
      } else if (tipo_planilla === 'Mensual') {
        const planillaExistente = await queryRunner.manager.findOne(PlanillasAporte, {
          where: {
            cod_patronal,
            tipo_planilla: 'Mensual',
          },
        });

        if (planillaExistente && planillaExistente.id_planilla_aportes !== id_planilla) {
          throw new BadRequestException('Ya existe una planilla Mensual para este mes y gestión.');
        }
      }
    }

    // ✅ FUNCIÓN PARA PARSEAR FECHAS DE EXCEL (REUTILIZADA)
    function parseExcelDate(value: any): string | undefined {
      if (!value) return undefined;
      
      if (typeof value === 'string') {
        const cleanValue = value.trim();
        if (cleanValue === '') return undefined;
        
        const parsedDate = moment(cleanValue, ['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY', 'DD-MM-YYYY'], true);
        if (parsedDate.isValid()) {
          return parsedDate.toISOString();
        }
        
        throw new BadRequestException(`Formato de fecha no válido: "${cleanValue}"`);
      }

      if (typeof value === 'number' && !isNaN(value) && value > 0) {
        const date = new Date(1900, 0, value - 1);
        return isNaN(date.getTime()) ? undefined : date.toISOString();
      }

      return undefined;
    }

    // ✅ CALCULAR NUMERACIÓN BASE PARA PLANILLAS ADICIONALES
    let nroBase = 1;
    const tipoPlanilla = createPlanillaDto?.tipo_planilla || planilla.tipo_planilla;
    
    if (tipoPlanilla === 'Planilla Adicional' && planillaMensualExistente) {
      // 🚀 CONSULTA OPTIMIZADA usando query runner
      const maxNroResult = await queryRunner.manager
        .createQueryBuilder()
        .select('MAX(detalle.nro)', 'max')
        .from(PlanillaAportesDetalles, 'detalle')
        .innerJoin(PlanillasAporte, 'planilla', 'planilla.id_planilla_aportes = detalle.id_planilla_aportes')
        .where('(planilla.id_planilla_aportes = :planillaId OR planilla.id_planilla_origen = :planillaId)', 
          { planillaId: planillaMensualExistente.id_planilla_aportes })
        .andWhere('detalle.id_planilla_aportes != :currentPlanilla', { currentPlanilla: id_planilla })
        .getRawOne();

      nroBase = (parseInt(maxNroResult?.max || '0', 10) || 0) + 1;
    }

    // ✅ PROCESAR Y VALIDAR DATOS
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
    const trabajadoresUnicos = new Set(datosValidos.map(row => row['Número documento de identidad'])).size;
    const totalTrabaj = trabajadoresUnicos;

    console.log(`📊 Estadísticas de actualización:
    - Registros válidos: ${datosValidos.length}
    - Trabajadores únicos: ${totalTrabaj}
    - Trabajadores con múltiples cargos: ${datosValidos.length - totalTrabaj}`);

    // ✅ PREPARAR NUEVOS DETALLES CON VALIDACIÓN MEJORADA
    const nuevosDetalles: CreatePlanillaAportesDetallesDto[] = datosValidos.map((row, index) => {
      try {
        const redondear = (valor: any): number => parseFloat(parseOrZero(valor).toFixed(6));
        const haberBasico = redondear(row['Haber Básico']);
        const bonoAntiguedad = redondear(row['Bono de antigüedad']);
        const montoHorasExtra = redondear(row['Monto horas extra']);
        const montoHorasExtraNocturnas = redondear(row['Monto horas extra nocturnas']);
        const otrosBonosPagos = redondear(row['Otros bonos y pagos']);

        const salario = parseFloat((haberBasico + bonoAntiguedad + montoHorasExtra + montoHorasExtraNocturnas + otrosBonosPagos).toFixed(6));

        if (isNaN(salario)) {
          throw new BadRequestException(`Error al calcular salario en la fila ${index + 1}: valores no numéricos`);
        }

        totalImporte += salario;

        return {
          id_planilla_aportes: id_planilla,
          nro: tipoPlanilla === 'Mensual' ? index + 1 : nroBase + index,
          ci: row['Número documento de identidad']?.toString() || '',
          apellido_paterno: row['Apellido Paterno']?.toString() || '',
          apellido_materno: row['Apellido Materno']?.toString() || '',
          nombres: row['Nombres']?.toString() || '',
          sexo: row['Sexo (M/F)']?.toString() || '',
          cargo: row['Cargo']?.toString() || '',
          fecha_nac: parseExcelDate(row['Fecha de nacimiento']),
          fecha_ingreso: parseExcelDate(row['Fecha de ingreso']),
          fecha_retiro: parseExcelDate(row['Fecha de retiro']),
          dias_pagados: parseInt(row['Días pagados'] || '0', 10) || null,
          haber_basico: haberBasico,
          bono_antiguedad: bonoAntiguedad,
          monto_horas_extra: montoHorasExtra,
          monto_horas_extra_nocturnas: montoHorasExtraNocturnas,
          otros_bonos_pagos: otrosBonosPagos,
          salario,
          regional: row['regional']?.toString() || '',
          tipo: planilla.tipo_planilla.toLowerCase().replace(' ', '_') as 'mensual' | 'planilla_adicional',
        };
      } catch (error) {
        throw new BadRequestException(`Error en la fila ${index + 1}: ${error.message}`);
      }
    });

    // 🗑️ ELIMINAR DETALLES EXISTENTES USANDO QUERY RUNNER
    console.log(`🗑️ Eliminando detalles existentes de la planilla ${id_planilla}...`);
    await queryRunner.manager.delete(PlanillaAportesDetalles, { id_planilla_aportes: id_planilla });

    // 🚀 INSERTAR NUEVOS DETALLES EN LOTES USANDO QUERY RUNNER
    const batchSize = 1000;
    console.log(`💾 Iniciando guardado de ${nuevosDetalles.length} detalles en lotes de ${batchSize}...`);
    
    for (let i = 0; i < nuevosDetalles.length; i += batchSize) {
      const batch = nuevosDetalles.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(nuevosDetalles.length / batchSize);
      
      console.log(`📦 Procesando lote ${batchNumber}/${totalBatches} (${batch.length} registros)...`);
      
      try {
        // Crear entidades y guardar con query runner
        const detalleEntities = batch.map(detalle => 
          queryRunner.manager.create(PlanillaAportesDetalles, detalle)
        );
        
        await queryRunner.manager.save(detalleEntities);
      } catch (error) {
        console.error(`❌ Error al guardar lote ${batchNumber}:`, error);
        throw new BadRequestException(`Error al guardar lote ${batchNumber}: ${error.message}`);
      }
    }

    // ✅ ACTUALIZAR TOTALES DE LA PLANILLA USANDO QUERY RUNNER
    console.log(`📊 Actualizando totales de la planilla...`);
    planilla.total_importe = parseFloat(totalImporte.toFixed(6));
    planilla.total_trabaj = totalTrabaj;
    await queryRunner.manager.save(planilla);

    // ✅ ACTUALIZAR PLANILLA MENSUAL SI ES NECESARIO
    if (tipoPlanilla === 'Planilla Adicional' && planillaMensualExistente) {
      console.log(`🔄 Actualizando totales de planilla mensual relacionada...`);
      // Nota: Esta función debe ser llamada después del commit para evitar deadlocks
    }

    // ✅ COMMIT DE LA TRANSACCIÓN
    await queryRunner.commitTransaction();
    
    console.log(`✅ Actualización completada exitosamente para planilla ${id_planilla}`);

    // ✅ ACTUALIZAR PLANILLA MENSUAL FUERA DE LA TRANSACCIÓN
    if (tipoPlanilla === 'Planilla Adicional' && planillaMensualExistente) {
      try {
        await this.actualizarTotalesPlanillaMensual(planillaMensualExistente.id_planilla_aportes, planilla.empresa.tipo?.toUpperCase());
      } catch (error) {
        console.warn('⚠️ Error al actualizar totales de planilla mensual:', error.message);
        // No fallar la operación principal por este error
      }
    }

    return {
      mensaje: '✅ Detalles de la planilla actualizados con éxito',
      id_planilla: planilla.id_planilla_aportes,
      total_importe: planilla.total_importe,
      total_trabajadores: totalTrabaj,
      estadisticas: {
        registros_procesados: nuevosDetalles.length,
        trabajadores_unicos: totalTrabaj,
        lotes_procesados: Math.ceil(nuevosDetalles.length / batchSize),
        total_importe: totalImporte
      }
    };

  } catch (error) {
    // 🔄 ROLLBACK EN CASO DE ERROR
    console.error('❌ Error en actualizarDetallesPlanilla, haciendo rollback:', error.message);
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    // 🔄 LIBERAR QUERY RUNNER
    await queryRunner.release();
  }
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
        'planilla.valido_cotizacion',
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
        fecha_liquidacion: planilla.fecha_liquidacion,
        valido_cotizacion: planilla.valido_cotizacion,
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
        'planilla.valido_cotizacion',
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
        valido_cotizacion: planilla.valido_cotizacion,
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
      fecha_verificacion_afiliacion: planilla.fecha_verificacion_afiliacion,
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

    // Crear una consulta separada para contar los estados de asegurados
    const estadosQuery = this.detalleRepo.createQueryBuilder('detalle')
      .innerJoin('detalle.planilla_aporte', 'planilla')
      .where(
        '(detalle.id_planilla_aportes = :id_planilla OR planilla.id_planilla_origen = :id_planilla)',
        { id_planilla }
      )
      .select('detalle.asegurado_estado', 'estado')
      .addSelect('COUNT(*)', 'cantidad')
      .groupBy('detalle.asegurado_estado');

    // Aplicar la misma búsqueda al conteo de estados si existe
    if (busqueda && busqueda.trim() !== '') {
      estadosQuery.andWhere(new Brackets(qb => {
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
        'detalle.matricula',

        'detalle.tipo_afiliado',
        'detalle.asegurado_tipo',
        'detalle.asegurado_estado',
        'detalle.tipo',
        'detalle.observaciones_afiliacion',
      ]);

    // Paginación
    if (limite > 0) {
      query.skip(skip).take(limite);
    }

    // Ejecutar ambas consultas en paralelo
    const [detallesResult, estadosResult] = await Promise.all([
      query.getManyAndCount(),
      estadosQuery.getRawMany()
    ]);

    const [detalles, total] = detallesResult;

    // Procesar el conteo de estados
    const conteoEstados = {
      VIGENTE: 0,
      BAJA: 0,
      'DER HABIENTE': 0,
      FALLECIDO: 0,
      CESANTIA: 0
    };

    // Llenar el conteo con los resultados de la consulta
    estadosResult.forEach(item => {
      const estado = item.estado?.toUpperCase().trim();
      const cantidad = parseInt(item.cantidad) || 0;
      
      if (estado && conteoEstados.hasOwnProperty(estado)) {
        conteoEstados[estado] = cantidad;
      }
    });

    if (!detalles.length) {
      return {
        mensaje: 'No hay detalles registrados para esta planilla',
        detalles: [],
        total: 0,
        conteo_estados_asegurados: conteoEstados
      };
    }

    return {
      mensaje: 'Detalles obtenidos con éxito',
      id_planilla,
      trabajadores: detalles,
      total,
      pagina,
      limite,
      conteo_estados_asegurados: conteoEstados
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
//? MÉTODO AUXILIAR: Consolidar trabajadores por CI para comparaciones
private consolidarTrabajadoresParaComparacion(trabajadores: any[]): any[] {
  const trabajadoresConsolidados = new Map();

  trabajadores.forEach(trabajador => {
    const ci = trabajador.ci;
    
    if (trabajadoresConsolidados.has(ci)) {
      // Si ya existe, consolidar datos
      const existente = trabajadoresConsolidados.get(ci);
      
      // Sumar salarios y montos
      existente.salario += trabajador.salario;
      existente.haber_basico += trabajador.haber_basico;
      existente.bono_antiguedad += trabajador.bono_antiguedad;
      existente.monto_horas_extra += trabajador.monto_horas_extra;
      existente.monto_horas_extra_nocturnas += trabajador.monto_horas_extra_nocturnas;
      existente.otros_bonos_pagos += trabajador.otros_bonos_pagos;
      
      // Concatenar cargos diferentes
      const cargosExistentes = existente.cargo.split(' / ');
      if (!cargosExistentes.includes(trabajador.cargo)) {
        existente.cargo += ` / ${trabajador.cargo}`;
      }
      
      // Mantener fecha de ingreso más antigua
      if (trabajador.fecha_ingreso) {
        const fechaExistente = new Date(existente.fecha_ingreso);
        const fechaNueva = new Date(trabajador.fecha_ingreso);
        if (fechaNueva < fechaExistente) {
          existente.fecha_ingreso = trabajador.fecha_ingreso;
        }
      }
      
      // Mantener fecha de retiro más reciente (o null si alguno no tiene)
      if (trabajador.fecha_retiro && existente.fecha_retiro) {
        const fechaExistente = new Date(existente.fecha_retiro);
        const fechaNueva = new Date(trabajador.fecha_retiro);
        if (fechaNueva > fechaExistente) {
          existente.fecha_retiro = trabajador.fecha_retiro;
        }
      } else if (!existente.fecha_retiro) {
        // Si el trabajador existente no tiene fecha de retiro, mantenerlo así
        existente.fecha_retiro = null;
      }
      
      // Agregar metadatos de consolidación
      existente._registros_consolidados = (existente._registros_consolidados || 1) + 1;
      
    } else {
      // Primer registro de este CI
      trabajadoresConsolidados.set(ci, {
        ...trabajador,
        _registros_consolidados: 1
      });
    }
  });

  const resultado = Array.from(trabajadoresConsolidados.values());
  
  // Log para debug
  const consolidados = resultado.filter(t => t._registros_consolidados > 1);
  if (consolidados.length > 0) {
    console.log(`🔄 Consolidados ${consolidados.length} trabajadores con múltiples cargos:`);
    consolidados.forEach(t => {
      console.log(`   CI: ${t.ci} - ${t.nombres} ${t.apellido_paterno} (${t._registros_consolidados} cargos: ${t.cargo})`);
    });
  }

  return resultado;
}
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

  // Obtener TODOS los detalles (mensual + adicionales)
  const detallesMesAnterior = await this.obtenerDetallesDeMes(cod_patronal, mesAnteriorNum.toString(), gestionMesAnterior);
  const detallesMesActual = await this.obtenerDetallesDeMes(cod_patronal, mesActualNum.toString(), gestion);

  console.log(`📊 Datos originales obtenidos:
    - Mes anterior: ${detallesMesAnterior.length} registros
    - Mes actual: ${detallesMesActual.length} registros`);

  // 🔄 CONSOLIDAR solo para la comparación (sin afectar datos originales)
  const trabajadoresAnterioresConsolidados = this.consolidarTrabajadoresParaComparacion(detallesMesAnterior);
  const trabajadoresActualesConsolidados = this.consolidarTrabajadoresParaComparacion(detallesMesActual);

  console.log(`📊 Datos consolidados para comparación:
    - Mes anterior: ${trabajadoresAnterioresConsolidados.length} trabajadores únicos
    - Mes actual: ${trabajadoresActualesConsolidados.length} trabajadores únicos`);

  // Validar si hay datos en ambos meses
  if (!trabajadoresAnterioresConsolidados || trabajadoresAnterioresConsolidados.length === 0) {
    throw new Error(`No se encontraron datos para el mes anterior (${mesAnterior}) en la gestión ${gestionMesAnterior}.`);
  }

  if (!trabajadoresActualesConsolidados || trabajadoresActualesConsolidados.length === 0) {
    throw new Error(`No se encontraron datos para el mes actual (${mesActual}) en la gestión ${gestion}.`);
  }

  const altas = [];
  const bajasNoEncontradas = [];
  const bajasPorRetiro = [];

  // Crear mapas con trabajadores consolidados
  const trabajadoresMesAnterior = new Map(
    trabajadoresAnterioresConsolidados.map((trabajador) => [trabajador.ci, trabajador]),
  );

  const trabajadoresMesActual = new Map(
    trabajadoresActualesConsolidados.map((trabajador) => [trabajador.ci, trabajador]),
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
  trabajadoresActualesConsolidados.forEach((trabajadorActual) => {
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
  trabajadoresActualesConsolidados.forEach((trabajadorActual) => {
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
  trabajadoresAnterioresConsolidados.forEach((trabajadorAnterior) => {
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
    Total trabajadores mes anterior: ${trabajadoresAnterioresConsolidados.length}
    Total trabajadores mes actual: ${trabajadoresActualesConsolidados.length}
    Total registros mes anterior: ${detallesMesAnterior.length}
    Total registros mes actual: ${detallesMesActual.length}
    Trabajadores con múltiples cargos mes anterior: ${trabajadoresAnterioresConsolidados.filter(t => t._registros_consolidados > 1).length}
    Trabajadores con múltiples cargos mes actual: ${trabajadoresActualesConsolidados.filter(t => t._registros_consolidados > 1).length}
  `);

  return {
    altas,
    bajas: {
      noEncontradas: bajasNoEncontradas,
      porRetiro: bajasPorRetiro,
    },
    resumen: {
      totalTrabajadoresMesAnterior: trabajadoresAnterioresConsolidados.length, // Trabajadores únicos
      totalTrabajadoresMesActual: trabajadoresActualesConsolidados.length,     // Trabajadores únicos
      totalRegistrosMesAnterior: detallesMesAnterior.length,                   // Registros totales
      totalRegistrosMesActual: detallesMesActual.length,                       // Registros totales
      totalAltas: altas.length,
      totalBajas: bajasNoEncontradas.length + bajasPorRetiro.length,
      // Nueva info: trabajadores con múltiples cargos
      trabajadoresMultiplesCargosAnterior: trabajadoresAnterioresConsolidados.filter(t => t._registros_consolidados > 1).length,
      trabajadoresMultiplesCargosActual: trabajadoresActualesConsolidados.filter(t => t._registros_consolidados > 1).length
    },
    mensaje: 'Comparación de planillas completada con consolidación automática por CI.',
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
    console.log('👥 Registros obtenidos:', detallesPlanilla.trabajadores.length);

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

    // 🔄 CONSOLIDAR TRABAJADORES POR CI ANTES DE AGRUPAR POR REGIONAL
    const trabajadoresConsolidadosMap = new Map();
    
    detallesPlanilla.trabajadores.forEach((trabajador) => {
      const ci = trabajador.ci;
      
      if (trabajadoresConsolidadosMap.has(ci)) {
        // Consolidar salarios del mismo trabajador
        const existente = trabajadoresConsolidadosMap.get(ci);
        existente.salario += parseFloat(trabajador.salario.toString());
        
        // Concatenar cargos si son diferentes
        const cargosExistentes = existente.cargo.split(' / ');
        if (!cargosExistentes.includes(trabajador.cargo)) {
          existente.cargo += ` / ${trabajador.cargo}`;
        }
        
        // Mantener la regional (asumiendo que no cambia para el mismo trabajador)
        // Si hay diferencias, tomar la primera
        
      } else {
        // Primera aparición del trabajador
        trabajadoresConsolidadosMap.set(ci, {
          ...trabajador,
          salario: parseFloat(trabajador.salario.toString())
        });
      }
    });

    const trabajadoresConsolidados = Array.from(trabajadoresConsolidadosMap.values());
    
    console.log(`🔄 Consolidación completada:
      - Registros originales: ${detallesPlanilla.trabajadores.length}
      - Trabajadores únicos: ${trabajadoresConsolidados.length}
      - Trabajadores con múltiples cargos: ${detallesPlanilla.trabajadores.length - trabajadoresConsolidados.length}`);

    // Variables para resumen
    let totalCantidad = 0;
    let totalGanado = 0;
    const regionalesMap = new Map();

    // PROCESAR TRABAJADORES CONSOLIDADOS
    trabajadoresConsolidados.forEach((trabajador) => {
      const { regional, salario } = trabajador;
      const salarioNum = salario; // Ya está convertido a número

      if (!regionalesMap.has(regional)) {
        regionalesMap.set(regional, {
          regional,
          cantidad: 0,
          total_ganado: 0,
          cotizacion: 0
        });
      }

      const regionData = regionalesMap.get(regional);
      regionData.cantidad += 1; // ← AHORA CUENTA TRABAJADORES ÚNICOS
      regionData.total_ganado += salarioNum;
      regionData.cotizacion = parseFloat((regionData.total_ganado * tasaCotizacion).toFixed(2));

      totalCantidad += 1; // ← AHORA CUENTA TRABAJADORES ÚNICOS
      totalGanado += salarioNum;
    });

    const resumenArray = Array.from(regionalesMap.values());

    console.log('📋 Resumen por regional (trabajadores únicos):', resumenArray);
    console.log('📦 Totales generales:', {
      trabajadores_unicos: totalCantidad,
      registros_originales: detallesPlanilla.trabajadores.length,
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

    return {
      mensaje: 'Detalles obtenidos con éxito (consolidados por CI)',
      planilla: planilla,
      resumen: formattedResumen,
      totales: formattedTotales,
      // Información adicional para debugging
      metadata: {
        registros_originales: detallesPlanilla.trabajadores.length,
        trabajadores_unicos: totalCantidad,
        trabajadores_con_multiples_cargos: detallesPlanilla.trabajadores.length - totalCantidad
      }
    };

  } catch (error) {
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
//** LIQUIDACIONES */
//***************** */


//! 22.-  Función para consultar la API del Banco Central y obtener el UFV de una fecha específica -------------------------------------------------------------------------------------------------------
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

// ===================================================================================
  // FUNCIONES AUXILIARES PARA CÁLCULO DE FECHAS LÍMITE DE DECLARACIÓN - ACTUALIZADAS
  // ===================================================================================

/**
   * Calcula la fecha límite para declaración de aportes según las reglas:
   * - Tienen hasta el día 30 del mes siguiente
   * - Si el mes siguiente tiene menos de 30 días, se completan los días faltantes en el mes posterior
   * 
   * Ejemplos:
   * - Enero → mes siguiente = febrero (28 días) → faltan 2 días → 2 de marzo
   * - Febrero → mes siguiente = marzo (31 días) → 30 de marzo  
   * - Marzo → mes siguiente = abril (30 días) → 30 de abril
   * - Abril → mes siguiente = mayo (31 días) → 30 de mayo
   */
// ! - calcularFechaLimiteDeclaracion
  private calcularFechaLimiteDeclaracion(fechaPlanilla: Date): Date {
    const fecha = new Date(fechaPlanilla);
    fecha.setUTCHours(0, 0, 0, 0);
    
    // Obtener el mes siguiente al mes de la planilla
    const añoPlanilla = fecha.getUTCFullYear();
    const mesPlanilla = fecha.getUTCMonth();
    
    // Calcular el mes siguiente
    const mesSiguiente = mesPlanilla + 1;
    const añoSiguiente = añoPlanilla + (mesSiguiente > 11 ? 1 : 0);
    const mesSiguienteCorregido = mesSiguiente > 11 ? 0 : mesSiguiente;
    
    // Calcular cuántos días tiene el mes siguiente
    const diasEnMesSiguiente = new Date(añoSiguiente, mesSiguienteCorregido + 1, 0).getDate();
    
    let fechaLimite: Date;
    
    if (diasEnMesSiguiente === 31) {
      // Si el mes siguiente tiene 31 días → límite el 31
      fechaLimite = new Date(añoSiguiente, mesSiguienteCorregido, 31);
      console.log(`📅 Mes siguiente tiene 31 días → Límite: día 31 del mes siguiente`);
    } else if (diasEnMesSiguiente === 30) {
      // Si el mes siguiente tiene 30 días → límite el 30
      fechaLimite = new Date(añoSiguiente, mesSiguienteCorregido, 30);
      console.log(`📅 Mes siguiente tiene 30 días → Límite: día 30 del mes siguiente`);
    } else {
      // Si el mes siguiente tiene menos de 30 días (febrero)
      const diasFaltantes = 30 - diasEnMesSiguiente;
      const mesPosterior = mesSiguienteCorregido + 1;
      const añoPosterior = añoSiguiente + (mesPosterior > 11 ? 1 : 0);
      const mesPosteriorCorregido = mesPosterior > 11 ? 0 : mesPosterior;
    
      fechaLimite = new Date(añoPosterior, mesPosteriorCorregido, diasFaltantes);
      console.log(`📅 Mes siguiente tiene ${diasEnMesSiguiente} días (<30) → Faltan ${diasFaltantes} días → Límite: ${diasFaltantes} del mes posterior`);
    }
    
    
    fechaLimite.setUTCHours(0, 0, 0, 0);
    
    console.log(`📊 Fecha límite calculada: ${moment(fechaLimite).format('DD/MM/YYYY')}`);
    return fechaLimite;
  }

  /**
   * Verifica si una fecha de declaración está dentro del plazo oficial
   */
// ! - estaEnPlazoOficial
  private estaEnPlazoOficial(fechaPlanilla: Date, fechaDeclarada: Date): boolean {
    const fechaLimite = this.calcularFechaLimiteDeclaracion(fechaPlanilla);
    
    const fechaDeclaradaNormalized = new Date(fechaDeclarada);
    fechaDeclaradaNormalized.setHours(0, 0, 0, 0);
    
    const fechaLimiteNormalized = new Date(fechaLimite);
    fechaLimiteNormalized.setHours(0, 0, 0, 0);
    
    return fechaDeclaradaNormalized <= fechaLimiteNormalized;
  }

/**
   * Calcula la multa por no presentación según las nuevas reglas de fechas
   * Incluye validación especial para planillas adicionales
   */
// ! - calcularMultaNoPresentacion
  private async calcularMultaNoPresentacion(
    planilla: any, // Planilla completa para acceder a tipo_planilla y otros datos
    fechaPlanilla: Date, 
    fechaDeclarada: Date, 
    aportePorcentaje: number
  ): Promise<number> {
    
    // ========== VALIDACIÓN ESPECIAL PARA PLANILLAS ADICIONALES ==========
    if (planilla.tipo_planilla === 'Planilla Adicional' || planilla.tipo_planilla === 'planilla_adicional') {
      console.log('🔍 Es planilla adicional, verificando planilla mensual...');
      
      let planillaMensual = null;
      
      // Buscar planilla mensual por id_planilla_origen o por código patronal, mes y gestión
      if (planilla.id_planilla_origen) {
        planillaMensual = await this.planillaRepo.findOne({
          where: { id_planilla_aportes: planilla.id_planilla_origen }
        });
        console.log(`📋 Buscando planilla mensual por ID origen: ${planilla.id_planilla_origen}`);
      } else {
        // Buscar por código patronal, mes, gestión y tipo mensual
        planillaMensual = await this.planillaRepo.findOne({
          where: {
            cod_patronal: planilla.cod_patronal,
            mes: planilla.mes,
            gestion: planilla.gestion,
            tipo_planilla: 'Mensual'
          }
        });
        console.log(`📋 Buscando planilla mensual por: ${planilla.cod_patronal}, ${planilla.mes}/${planilla.gestion}`);
      }
      
      if (planillaMensual && planillaMensual.fecha_declarada) {
        console.log(`📅 Planilla mensual encontrada - Fecha declarada: ${planillaMensual.fecha_declarada}`);
        console.log(`📅 Planilla mensual - Fecha planilla: ${planillaMensual.fecha_planilla}`);
        
        // Verificar si la planilla mensual se presentó a tiempo usando la nueva lógica
        const fechaDeclaradaMensual = new Date(planillaMensual.fecha_declarada);
        const fechaPlanillaMensual = new Date(planillaMensual.fecha_planilla);
        
        if (this.estaEnPlazoOficial(fechaPlanillaMensual, fechaDeclaradaMensual)) {
          console.log('✅ PLANILLA MENSUAL SE PRESENTÓ A TIEMPO → NO SE APLICA MULTA A LA ADICIONAL');
          console.log(`📊 Fecha límite mensual: ${moment(this.calcularFechaLimiteDeclaracion(fechaPlanillaMensual)).format('DD/MM/YYYY')}`);
          console.log(`📊 Fecha declarada mensual: ${moment(fechaDeclaradaMensual).format('DD/MM/YYYY')}`);
          return 0; // ← AQUÍ ESTÁ LA CLAVE: NO COBRAR MULTA
        } else {
          console.log('❌ Planilla mensual se presentó fuera de plazo');
          console.log(`📊 Fecha límite mensual: ${moment(this.calcularFechaLimiteDeclaracion(fechaPlanillaMensual)).format('DD/MM/YYYY')}`);
          console.log(`📊 Fecha declarada mensual: ${moment(fechaDeclaradaMensual).format('DD/MM/YYYY')}`);
          
          // Solo ahora verificar si la adicional también está fuera de plazo
          if (this.estaEnPlazoOficial(fechaPlanilla, fechaDeclarada)) {
            console.log('✅ Adicional está en plazo, pero mensual no → NO MULTA');
            return 0;
          } else {
            console.log('❌ Tanto mensual como adicional fuera de plazo → SÍ MULTA');
            const multa = aportePorcentaje * 0.01;
            console.log(`💰 Multa aplicada: ${multa} (1% de ${aportePorcentaje})`);
            return multa;
          }
        }
      } else {
        console.log('⚠️ No se encontró planilla mensual relacionada o no tiene fecha declarada');
        console.log('📝 Aplicando lógica normal de multa para la adicional...');
        // Si no hay planilla mensual, aplicar lógica normal
      }
    }
    
    // ========== LÓGICA NORMAL PARA PLANILLAS MENSUALES ==========
    console.log('📋 Aplicando lógica normal (planilla mensual o adicional sin mensual)');
    
    // Verificar si está en plazo oficial
    if (this.estaEnPlazoOficial(fechaPlanilla, fechaDeclarada)) {
      console.log('✅ Fecha declarada dentro del plazo oficial → NO MULTA');
      console.log(`📊 Fecha límite: ${moment(this.calcularFechaLimiteDeclaracion(fechaPlanilla)).format('DD/MM/YYYY')}`);
      console.log(`📊 Fecha declarada: ${moment(fechaDeclarada).format('DD/MM/YYYY')}`);
      return 0;
    }
    
    // Si llegamos aquí, aplicar multa del 1%
    const multa = aportePorcentaje * 0.01;
    console.log('❌ Fecha declarada fuera del plazo oficial → SÍ MULTA');
    console.log(`📊 Fecha límite: ${moment(this.calcularFechaLimiteDeclaracion(fechaPlanilla)).format('DD/MM/YYYY')}`);
    console.log(`📊 Fecha declarada: ${moment(fechaDeclarada).format('DD/MM/YYYY')}`);
    console.log(`💰 Multa aplicada: ${multa} (1% de ${aportePorcentaje})`);
    return multa;
  }

// MÉTODO AUXILIAR: Calcular aportes con monto de cotización ajustado (empresas públicas)
private async calcularAportesConMontoAjustado(idPlanilla: number, cotizacionReal: number): Promise<any> {
  try {
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

    const tipoEmpresa = planilla.empresa?.tipo;
    if (tipoEmpresa !== 'AP') {
      throw new BadRequestException('Este método solo aplica para empresas públicas (AP)');
    }

    // Usar el monto real del TGN en lugar del cálculo teórico
    const aportePorcentaje = cotizacionReal;
    const tasaPorcentaje = 0.1; // Para empresas públicas siempre es 10%

    // UFV día formal: Usar la fecha límite para días de retraso (01/04/2025)
    const fechaLimiteRetrasoParaUfv = this.calcularFechaLimiteParaDiasRetraso(fechaPlanillaBolivia);
    const ufvDiaFormal = await this.getUfvForDate(fechaLimiteRetrasoParaUfv);

    // UFV día presentación: Fecha de pago - 1 día (23/04/2025)
    const fechaPagoForUfv = new Date(fechaPagoBolivia);
    fechaPagoForUfv.setDate(fechaPagoForUfv.getDate() - 1);
    fechaPagoForUfv.setHours(0, 0, 0, 0);
    const ufvDiaPresentacion = await this.getUfvForDate(fechaPagoForUfv);

    console.log('💰 === FECHAS UFV CORREGIDAS ===');
    console.log('💰 Fecha UFV Formal (FD):', moment(fechaLimiteRetrasoParaUfv).format('DD/MM/YYYY'));
    console.log('💰 Fecha UFV Presentación (FP):', moment(fechaPagoForUfv).format('DD/MM/YYYY'));

    console.log('💰 === CÁLCULO UFV ===');
    console.log('💰 UFV día formal:', ufvDiaFormal);
    console.log('💰 UFV día presentación:', ufvDiaPresentacion);

    const calculoAporteActualizado = (aportePorcentaje / ufvDiaFormal) * ufvDiaPresentacion;
    const aporteActualizado = calculoAporteActualizado < aportePorcentaje ? aportePorcentaje : calculoAporteActualizado;
    const montoActualizado = Math.max(0, aporteActualizado - aportePorcentaje);

    console.log('💰 === CÁLCULO ACTUALIZACIÓN ===');
    console.log('💰 Cálculo aporte actualizado:', calculoAporteActualizado);
    console.log('💰 Aporte actualizado:', aporteActualizado);
    console.log('💰 Monto actualizado (AP-AC):', montoActualizado);

    // ✅ IMPORTANTE: Usar la función corregida de multa con validación de fechas límite
    const multaNoPresentacion = await this.calcularMultaNoPresentacion(
      planilla, // Planilla completa para validar adicionales
      fechaPlanillaBolivia,
      fechaDeclaradaBolivia, 
      aportePorcentaje // Usar el monto real
    );

    console.log('💰 === CÁLCULO DÍAS DE RETRASO ===');
    console.log('💰 Fecha planilla:', moment(fechaPlanillaBolivia).format('DD/MM/YYYY'));
    console.log('💰 Fecha declarada:', moment(fechaDeclaradaBolivia).format('DD/MM/YYYY'));
    console.log('💰 Fecha pago:', moment(fechaPagoBolivia).format('DD/MM/YYYY'));

    // Días de retraso desde la fecha límite para días de retraso
    const fechaLimiteRetraso = this.calcularFechaLimiteParaDiasRetraso(fechaPlanillaBolivia);
    const normalize = (d: Date) => {
      const copy = new Date(d);
      copy.setHours(0, 0, 0, 0);
      return copy;
    };

    const diasRetraso = Math.max(
      0,
      Math.floor((normalize(fechaDeclaradaBolivia).getTime() - normalize(fechaLimiteRetraso).getTime()) / (1000 * 60 * 60 * 24))
    );

    console.log('💰 Fecha límite para días de retraso:', moment(fechaLimiteRetraso).format('DD/MM/YYYY'));
    console.log('💰 Días de retraso:', diasRetraso);

    // Intereses y multa sobre intereses
    const intereses = (aporteActualizado * 0.0999 / 360) * diasRetraso;
    const multaSobreIntereses = intereses * 0.1;

    console.log('💰 === CÁLCULO INTERESES ===');
    console.log('💰 Intereses:', intereses);
    console.log('💰 Multa sobre intereses:', multaSobreIntereses);
    console.log('💰 Multa no presentación:', multaNoPresentacion);

    // Total a cancelar parcial
    const totalACancelarParcial =
      aportePorcentaje + montoActualizado + multaNoPresentacion + intereses + multaSobreIntereses;

    // ✅ CORRECCIÓN: Totales de multas incluyendo todos los recargos
    const totalMultas = montoActualizado + multaNoPresentacion + multaSobreIntereses + intereses;
    const totalTasaInteres = intereses;

    console.log('💰 === CÁLCULO RECARGOS DE LEY ===');
    console.log('💰 Monto actualizado:', montoActualizado);
    console.log('💰 Multa no presentación:', multaNoPresentacion);
    console.log('💰 Intereses:', intereses);
    console.log('💰 Multa sobre intereses:', multaSobreIntereses);
    console.log('💰 TOTAL MULTAS (Recargos de Ley):', totalMultas);

    // No hay formulario DS08 para empresas públicas, solo AV
    const formds08 = 0;
    let totalACancelar = totalACancelarParcial + formds08;

    let totalDeducciones = 0;
    let descuentoMinSalud = 0;
    if (planilla.aplica_descuento_min_salud) {
      descuentoMinSalud = aportePorcentaje * 0.05;
      totalDeducciones += descuentoMinSalud;
    }

    const otrosDescuentos = parseFloat(planilla.otros_descuentos as any) || 0;
    totalDeducciones += otrosDescuentos;

    totalACancelar = totalACancelar - totalDeducciones;

    console.log('💰 === RESUMEN FINAL ===');
    console.log('💰 Total a cancelar parcial:', totalACancelarParcial);
    console.log('💰 Total deducciones:', totalDeducciones);
    console.log('💰 Total a cancelar final:', totalACancelar);

    // Asignar a planilla (usar el monto real)
    planilla.aporte_porcentaje = aportePorcentaje; // Monto real del TGN
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

    // Guardar cambios
    const resultado = await this.planillaRepo.save(planilla);
    console.log('💰 Planilla guardada con monto ajustado');

    return {
      mensaje: 'Liquidación recalculada con cotización real del TGN',
      cotizacion_teorica: planilla.cotizacion_tasa,
      cotizacion_real: cotizacionReal,
      diferencia: cotizacionReal - planilla.cotizacion_tasa,
      total_importe: planilla.total_importe,
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
      tipo_empresa: tipoEmpresa,
      fechaLimiteDeclaracion: this.calcularFechaLimiteDeclaracion(fechaPlanillaBolivia),
      estaEnPlazo: this.estaEnPlazoOficial(fechaPlanillaBolivia, fechaDeclaradaBolivia),
    };
  } catch (error) {
    throw new BadRequestException(`Error al calcular aportes con monto ajustado: ${error.message}`);
  }
}


//! NUEVA FUNCIÓN: Calcular fecha límite para días de retraso (diferente a multa)
private calcularFechaLimiteParaDiasRetraso(fechaPlanilla: Date): Date {
  const fecha = new Date(fechaPlanilla);
  fecha.setUTCHours(0, 0, 0, 0);
  
  // Para días de retraso: Primer día del segundo mes siguiente
  const añoPlanilla = fecha.getUTCFullYear();
  const mesPlanilla = fecha.getUTCMonth();
  
  // Segundo mes siguiente (mes + 2)
  const mesLimite = mesPlanilla + 2;
  const añoLimite = añoPlanilla + (mesLimite > 11 ? 1 : 0);
  const mesLimiteCorregido = mesLimite > 11 ? mesLimite - 12 : mesLimite;
  
  // Primer día de ese mes
  const fechaLimite = new Date(añoLimite, mesLimiteCorregido, 1);
  fechaLimite.setUTCHours(0, 0, 0, 0);
  
  console.log(`📅 Fecha límite para días de retraso: ${moment(fechaLimite).format('DD/MM/YYYY')}`);
  return fechaLimite;
}


//! 23 .- Función para calcular los aportes  -------------------------------------------------------------------------------------------------------
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

    // UFV día formal: Usar la fecha límite para días de retraso (01/04/2025)
    const fechaLimiteRetrasoParaUfv = this.calcularFechaLimiteParaDiasRetraso(fechaPlanillaBolivia);
    const ufvDiaFormal = await this.getUfvForDate(fechaLimiteRetrasoParaUfv);

    // UFV día presentación: Fecha de pago - 1 día (23/04/2025)
    const fechaPagoForUfv = new Date(fechaPagoBolivia);
    fechaPagoForUfv.setDate(fechaPagoForUfv.getDate() - 1);
    fechaPagoForUfv.setHours(0, 0, 0, 0);
    const ufvDiaPresentacion = await this.getUfvForDate(fechaPagoForUfv);

    console.log('Fechas UFV corregidas - FD:', moment(fechaLimiteRetrasoParaUfv).format('DD/MM/YYYY'), 'FP:', moment(fechaPagoForUfv).format('DD/MM/YYYY'));

    const calculoAporteActualizado = (aportePorcentaje / ufvDiaFormal) * ufvDiaPresentacion;
    const aporteActualizado = calculoAporteActualizado < aportePorcentaje ? aportePorcentaje : calculoAporteActualizado;

    const montoActualizado = Math.max(0, aporteActualizado - aportePorcentaje);

    // ✅ Multa por no presentación usando la nueva lógica CON validación de planillas adicionales
    const multaNoPresentacion = await this.calcularMultaNoPresentacion(
      planilla, // Pasar la planilla completa
      fechaPlanillaBolivia,
      fechaDeclaradaBolivia, 
      aportePorcentaje
    );

    console.log('Multa por no presentación calculada:', multaNoPresentacion);
    console.log('Fecha planilla (Bolivia):', fechaPlanillaBolivia);
    console.log('Fecha declarada (Bolivia):', fechaDeclaradaBolivia);
    console.log('Fecha límite oficial:', this.calcularFechaLimiteDeclaracion(fechaPlanillaBolivia));
    console.log('Tipo de planilla:', planilla.tipo_planilla);

    // ✅ Días de retraso desde la fecha límite oficial
    const fechaLimiteRetraso = this.calcularFechaLimiteParaDiasRetraso(fechaPlanillaBolivia);
    const normalize = (d: Date) => {
      const copy = new Date(d);
      copy.setHours(0, 0, 0, 0);
      return copy;
    };

    const diasRetraso = Math.max(
      0,
      Math.floor((normalize(fechaDeclaradaBolivia).getTime() - normalize(fechaLimiteRetraso).getTime()) / (1000 * 60 * 60 * 24))
    );

    console.log('Fecha límite para días de retraso:', moment(fechaLimiteRetraso).format('DD/MM/YYYY'));

    // ✅ Intereses y multa sobre intereses
    const intereses = (aporteActualizado * 0.0999 / 360) * diasRetraso;
    const multaSobreIntereses = intereses * 0.1;

    // ✅ Total a cancelar parcial
    const totalACancelarParcial =
      aportePorcentaje + montoActualizado + multaNoPresentacion + intereses + multaSobreIntereses;

    // ✅ Totales de multas y tasas - CORREGIDO: incluye todos los recargos
    const totalMultas = montoActualizado + multaNoPresentacion + multaSobreIntereses + intereses;
    const totalTasaInteres = intereses;

    // ✅ Formulario DS08 (solo para AV)
    const formds08 = tipo === 'AV' ? totalImporte * 0.005 : 0;
    let totalACancelar = totalACancelarParcial + formds08;

    let totalDeducciones = 0;
    let descuentoMinSalud = 0;
    if (tipo === 'PA') {
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
    };
  } catch (error) {
    throw new BadRequestException(`Error al calcular los aportes: ${error.message}`);
  }
}
//! 24 .- calcular aportes con fecha pago -------------------------------------------------------------------------------------------------------
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
      // 🔍 LOGS DE DEBUG - AGREGAR ESTOS
      console.log('🔍 DEBUG Fecha Presentación Oficial:');
      console.log('📅 Fecha planilla original:', fechaPlanilla);
      console.log('📅 Fecha planilla Bolivia:', fechaPlanillaBolivia);
      
      const fechaInicial = moment(fechaPlanilla).tz('America/La_Paz');
      console.log('📅 Moment inicial:', fechaInicial.format('YYYY-MM-DD'));
      
      const fechaConMeses = fechaInicial.add(3, 'months');
      console.log('➕ Después de agregar 3 meses:', fechaConMeses.format('YYYY-MM-DD'));
      
      const fechaFinal = fechaConMeses.startOf('month');
      console.log('📅 Primer día del mes:', fechaFinal.format('YYYY-MM-DD'));
      
      const resultado = fechaFinal.toDate();
      console.log('📅 Resultado final:', resultado);
      console.log('-----------------------------------');
      
      return resultado;
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

    // ✅ Multa por no presentación usando la nueva lógica CON validación de planillas adicionales
    const multaNoPresentacion = await this.calcularMultaNoPresentacion(
      planilla, // Pasar la planilla completa
      fechaPlanillaBolivia,
      fechaDeclaradaBolivia,
      aportePorcentaje
    );

    const fechaLimite = this.calcularFechaLimiteDeclaracion(fechaPlanillaBolivia);

    console.log('=== CÁLCULO PRELIMINAR ===');
    console.log('Fecha planilla:', moment(fechaPlanillaBolivia).format('DD/MM/YYYY'));
    console.log('Fecha declarada:', moment(fechaDeclaradaBolivia).format('DD/MM/YYYY'));
    console.log('Fecha límite oficial:', moment(fechaLimite).format('DD/MM/YYYY'));
    console.log('Multa por no presentación:', multaNoPresentacion);
    console.log('Está en plazo:', this.estaEnPlazoOficial(fechaPlanillaBolivia, fechaDeclaradaBolivia));
    console.log('Tipo de planilla:', planilla.tipo_planilla);

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

    // ✅ Deducciones
    let totalDeducciones = 0;
    let descuentoMinSalud = 0;

    if (planilla.aplica_descuento_min_salud) {
      descuentoMinSalud = aportePorcentaje * 0.05;
      totalDeducciones += descuentoMinSalud;
    }

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
      fechaLimiteDeclaracion: fechaLimite,
      estaEnPlazo: this.estaEnPlazoOficial(fechaPlanillaBolivia, fechaDeclaradaBolivia),
    };
  } catch (error) {
    throw new BadRequestException(`Error al calcular los aportes preliminares: ${error.message}`);
  }
}
//?! -- Actualizar planilla con liquidación calculada ---------------------------------------------------
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
//! 29 .- VALIDAR LIQUIDACIONES
async validarLiquidacion(idPlanilla: number, payload: { fecha_pago?: string; valido_cotizacion?: string }): Promise<any> {
  const planilla = await this.planillaRepo.findOne({ 
    where: { id_planilla_aportes: idPlanilla },
    relations: ['empresa'] // Por si necesitas datos de la empresa
  });

  if (!planilla) {
    throw new NotFoundException('La planilla no existe.');
  }

  // NUEVA VALIDACIÓN: Verificar si ya está validada
  if (planilla.fecha_liquidacion && planilla.valido_cotizacion) {
    return {
      mensaje: 'La liquidación ya está validada.',
      planilla: planilla,
      validado_por: planilla.valido_cotizacion,
      fecha_validacion: planilla.fecha_liquidacion,
      ya_validada: true
    };
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

  // ACTUALIZAR el nombre del validador (siempre requerido para validaciones)
  planilla.valido_cotizacion = payload.valido_cotizacion || 'Administrador';

  // AGREGAR LOG para debug
  console.log(`💚 Validando liquidación ${idPlanilla} por: ${planilla.valido_cotizacion}`);

  // Guardar los cambios
  const planillaActualizada = await this.planillaRepo.save(planilla);

  return {
    mensaje: 'Liquidación validada correctamente.',
    planilla: planillaActualizada,
    validado_por: planilla.valido_cotizacion,
    fecha_validacion: planilla.fecha_liquidacion,
    ya_validada: false
  };
}

//? helpers
private formatearRespuestaLiquidacion(planilla: any): any {
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
    tipo_empresa: planilla.empresa?.tipo?.toUpperCase(),
    total_aportes_asuss: planilla.total_aportes_asuss,
    total_aportes_min_salud: planilla.total_aportes_min_salud,
    excedente: planilla.excedente,
    motivo_excedente: planilla.motivo_excedente,
    fechaFormal: planilla.fecha_presentacion_oficial,
    fechaPagoUfv: planilla.fecha_deposito_presentacion,
    observaciones: planilla.observaciones,
    valido_cotizacion: planilla.valido_cotizacion
  };
}
//? OBTENER LIQUIDACIÓN (Dispatcher según tipo de empresa)
async obtenerLiquidacion(idPlanilla: number): Promise<any> {
  try {
    // Determinar tipo de empresa
    const planilla = await this.planillaRepo.findOne({
      where: { id_planilla_aportes: idPlanilla },
      relations: ['empresa'],
    });

    if (!planilla) {
      throw new BadRequestException('Planilla no encontrada');
    }

    const tipoEmpresa = planilla.empresa?.tipo?.toUpperCase();
    console.log('🔍 obtenerLiquidacion - Tipo empresa:', tipoEmpresa);

    // Dispatcher: Decidir qué método usar según el tipo de empresa
    if (tipoEmpresa === 'AP') {
      return await this.obtenerLiquidacionPublica(idPlanilla);
    } else {
      return await this.obtenerLiquidacionPrivada(idPlanilla);
    }
  } catch (error) {
    throw new BadRequestException(`Error al obtener liquidación: ${error.message}`);
  }
}
//? MÉTODOS ESPECÍFICOS PARA EMPRESAS PRIVADAS (AV, PA, VA)--------------------------------------------------------------
//? EMPRESAS PRIVADAS: Obtener liquidación (lógica original)
async obtenerLiquidacionPrivada(idPlanilla: number): Promise<any> {
  try {
    const planilla = await this.planillaRepo.findOne({
      where: { id_planilla_aportes: idPlanilla },
      relations: ['empresa'],
    });

    if (!planilla) {
      throw new BadRequestException('Planilla no encontrada');
    }

    console.log('🏢 Obteniendo liquidación EMPRESA PRIVADA:', planilla.empresa?.tipo);

    // Si ya tiene liquidación calculada, retornar datos guardados
    if (planilla.fecha_liquidacion && planilla.total_a_cancelar !== null) {
      console.log('✅ Empresa privada - Datos desde BD');
      return this.formatearRespuestaLiquidacion(planilla);
    }

    // Si tiene fecha_pago pero no liquidación, calcular usando método original
    if (planilla.fecha_pago) {
      console.log('🔄 Empresa privada - Calculando con método original');
      return await this.calcularAportes(idPlanilla);
    }

    throw new BadRequestException('La planilla no tiene fecha de pago ni liquidación calculada');
  } catch (error) {
    throw new BadRequestException(`Error al obtener liquidación privada: ${error.message}`);
  }
}
async recalcularLiquidacionPrivada(idPlanilla: number, fechaPago: Date): Promise<any> {
  try {
    console.log('🏢 Recalculando liquidación EMPRESA PRIVADA con nueva fecha:', fechaPago);

    // Usar el método preliminar original
    const datosLiquidacion = await this.calcularAportesPreliminar(idPlanilla, fechaPago);
    
    // Actualizar planilla con los datos calculados usando método original
    await this.actualizarPlanillaConLiquidacion(idPlanilla, fechaPago, datosLiquidacion);
    
    console.log('✅ Liquidación empresa privada recalculada');
    return datosLiquidacion;
  } catch (error) {
    throw new BadRequestException(`Error al recalcular liquidación privada: ${error.message}`);
  }
}

//? MÉTODOS ESPECÍFICOS PARA EMPRESAS PÚBLICAS (AP)  ---------------------------------------------------------------------
//? EMPRESAS PÚBLICAS: Obtener liquidación (lógica nueva con preliminares)
async obtenerLiquidacionPublica(idPlanilla: number): Promise<any> {
  try {
    const planilla = await this.planillaRepo.findOne({
      where: { id_planilla_aportes: idPlanilla },
      relations: ['empresa'],
    });

    if (!planilla) {
      throw new BadRequestException('Planilla no encontrada');
    }

    console.log('🏛️ Obteniendo liquidación EMPRESA PÚBLICA');

    // Si ya tiene liquidación calculada, retornar datos guardados
    if (planilla.fecha_liquidacion && planilla.total_a_cancelar !== null) {
      console.log('✅ Empresa pública - Datos desde BD');
      const datos = this.formatearRespuestaLiquidacion(planilla);
      
      // Verificar si es liquidación preliminar
      if (planilla.observaciones?.includes('LIQUIDACIÓN PRELIMINAR')) {
        datos.es_liquidacion_preliminar = true;
      }
      
      return datos;
    }

    // Si tiene fecha_pago pero no liquidación, calcular automáticamente
    if (planilla.fecha_pago) {
      console.log('🔄 Empresa pública - Calculando preliquidación automática');
      const liquidacion = await this.calcularAportes(idPlanilla);
      
      // Marcar como liquidación preliminar para empresas públicas
      const planillaActualizada = await this.planillaRepo.findOne({ where: { id_planilla_aportes: idPlanilla } });
      if (planillaActualizada) {
        planillaActualizada.observaciones = (planillaActualizada.observaciones || '') + '\nLIQUIDACIÓN PRELIMINAR - Empresa Pública';
        await this.planillaRepo.save(planillaActualizada);
      }
      
      liquidacion.es_liquidacion_preliminar = true;
      return liquidacion;
    }

    throw new BadRequestException('La planilla no tiene fecha de pago ni liquidación calculada');
  } catch (error) {
    throw new BadRequestException(`Error al obtener liquidación pública: ${error.message}`);
  }
}
//? EMPRESAS PÚBLICAS: Actualizar con nuevo monto TGN real
async actualizarConNuevoMontoTGN(idPlanilla: number, fechaPago: Date, nuevoMontoTGN: number): Promise<any> {
  try {
    console.log('🏛️ Actualizando EMPRESA PÚBLICA con nuevo monto TGN:', nuevoMontoTGN);

    const planilla = await this.planillaRepo.findOne({
      where: { id_planilla_aportes: idPlanilla },
      relations: ['empresa'],
    });

    if (!planilla) {
      throw new BadRequestException('Planilla no encontrada');
    }

    // Calcular datos base usando método preliminar
    const datosBase = await this.calcularAportesPreliminar(idPlanilla, fechaPago);
    
    // SOBRESCRIBIR con el nuevo monto TGN específico
    datosBase.aporte_porcentaje = nuevoMontoTGN;
    datosBase.aporte_actualizado = nuevoMontoTGN;
    
    // Para empresas públicas SIEMPRE aplicar 5% de descuento
    const descuentoMinSalud = nuevoMontoTGN * 0.05;
    datosBase.descuento_min_salud = descuentoMinSalud;
    datosBase.total_deducciones = descuentoMinSalud + (datosBase.otros_descuentos || 0);
    
    // Recalcular totales con el nuevo monto y descuentos
    const multasEIntereses = (datosBase.multa_no_presentacion || 0) + 
                            (datosBase.intereses || 0) + 
                            (datosBase.multa_sobre_intereses || 0);
    
    /* datosBase.total_a_cancelar_parcial = nuevoMontoTGN + multasEIntereses; */
    datosBase.total_a_cancelar_parcial = nuevoMontoTGN + datosBase.monto_actualizado + multasEIntereses;
    datosBase.total_a_cancelar = datosBase.total_a_cancelar_parcial - datosBase.total_deducciones;
    datosBase.total_aportes_asuss = nuevoMontoTGN * 0.005;
    
    // Guardar en base de datos usando método existente
    await this.actualizarPlanillaConLiquidacion(idPlanilla, fechaPago, datosBase);
    
    // Actualizar observaciones específicas para TGN real
    const planillaActualizada = await this.planillaRepo.findOne({ where: { id_planilla_aportes: idPlanilla } });
    if (planillaActualizada) {
      planillaActualizada.observaciones = 'LIQUIDACIÓN REAL - TGN ACTUALIZADO';
      planillaActualizada.aplica_descuento_min_salud = true; // Asegurar que aplique el 5%
      await this.planillaRepo.save(planillaActualizada);
    }
    
    // NUEVO: Guardar el pago del desembolso TGN
    await this.guardarPagoDesembolsoTGN(idPlanilla, fechaPago, nuevoMontoTGN, datosBase.total_a_cancelar);
    
    console.log('✅ Empresa pública actualizada con nuevo TGN:', nuevoMontoTGN);
    console.log('💊 Descuento 5% aplicado:', descuentoMinSalud);
    
    return datosBase;
  } catch (error) {
    throw new BadRequestException(`Error al actualizar empresa pública con nuevo TGN: ${error.message}`);
  }
}
//? EMPRESAS PÚBLICAS: Recalcular liquidación normal (sin nuevo TGN)
async recalcularLiquidacionPublica(idPlanilla: number, fechaPago: Date): Promise<any> {
  try {
    console.log('🏛️ Recalculando liquidación EMPRESA PÚBLICA (sin nuevo TGN)');
    
    // Usar método original pero marcar como liquidación real
    const datosLiquidacion = await this.calcularAportesPreliminar(idPlanilla, fechaPago);
    await this.actualizarPlanillaConLiquidacion(idPlanilla, fechaPago, datosLiquidacion);
    
    // Actualizar observaciones para quitar "preliminar"
    const planilla = await this.planillaRepo.findOne({ where: { id_planilla_aportes: idPlanilla } });
    if (planilla) {
      planilla.observaciones = 'LIQUIDACIÓN REAL - Empresa Pública';
      await this.planillaRepo.save(planilla);
    }
    
    // NUEVO: Guardar el pago del desembolso TGN (usando el aporte calculado)
    await this.guardarPagoDesembolsoTGN(idPlanilla, fechaPago, datosLiquidacion.aporte_actualizado, datosLiquidacion.total_a_cancelar);
    
    return datosLiquidacion;
  } catch (error) {
    throw new BadRequestException(`Error al recalcular liquidación pública: ${error.message}`);
  }
}



async validarPlanilla(idPlanilla: number, nombreAdministrador: string): Promise<any> {
  try {
    const planilla = await this.planillaRepo.findOne({ 
      where: { id_planilla_aportes: idPlanilla },
      relations: ['empresa']
    });

    if (!planilla) {
      throw new NotFoundException('La planilla no existe.');
    }

    // Actualizar el campo valido_cotizacion con el nombre completo del administrador
    planilla.valido_cotizacion = nombreAdministrador;

    // Guardar los cambios
    const planillaActualizada = await this.planillaRepo.save(planilla);

    return {
      mensaje: 'Planilla validada correctamente.',
      planilla: planillaActualizada,
      validado_por: nombreAdministrador,
    };
  } catch (error) {
    throw new BadRequestException(`Error al validar la planilla: ${error.message}`);
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

//TODO 27 .- REPORTE DE APORTES RECIBIDOS POR MES (NOMBRE EN FRONT : VER APORTES POR MES Y AÑO)(OJO REVISAR)
async generarReporteHistorial(mes?: number, gestion?: number): Promise<StreamableFile> {
  try {
    console.log('=== INICIO generarReporteHistorial ===');
    console.log('Parámetros recibidos -> mes:', mes, ', gestion:', gestion);

    // Validar parámetros
    if (mes && (isNaN(mes) || mes < 1 || mes > 12)) {
      console.error('❌ Error: Mes inválido:', mes);
      throw new BadRequestException('El mes debe ser un número entre 1 y 12');
    }
    if (gestion && (isNaN(gestion) || gestion < 1900 || gestion > 2100)) {
      console.error('❌ Error: Gestión inválida:', gestion);
      throw new BadRequestException('El año debe ser un número válido (1900-2100)');
    }

    // Crear consulta propia para el reporte con estado = 2
    console.log('📌 Consultando planillas con estado = 2...');
    const query = this.planillaRepo.createQueryBuilder('planilla')
      .leftJoinAndSelect('planilla.empresa', 'empresa')
      .where('planilla.estado = :estado', { estado: 2 })
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
    console.log(`📊 Total planillas encontradas con estado 2: ${planillas.length}`);

    if (!planillas || planillas.length === 0) {
      console.warn('⚠️ No se encontraron planillas para el reporte');
      throw new BadRequestException('No hay planillas con estado 2 para generar el reporte');
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

    console.log('📌 Preparando datos para el reporte...');

    let apEfectivoTotal = 0;
    
    // Primero mapear las planillas y calcular el total
    const planillasData = planillas.map((planilla) => {
      // Calcular ap_efectivo = total_a_cancelar + total_min_salud
      const totalACancelar = parseFloat(planilla.total_a_cancelar?.toString() || '0') || 0;
      const totalMinSalud = parseFloat(planilla.total_aportes_min_salud?.toString() || '0') || 0;
      const apEfectivo = totalACancelar + totalMinSalud;

      apEfectivoTotal += apEfectivo;

      return {
        id_planilla_aportes: planilla.id_planilla_aportes,
        com_nro: planilla.com_nro || 0,
        cod_patronal: planilla.cod_patronal || 'N/A',
        empresa: planilla.empresa ? planilla.empresa.emp_nom : 'N/A',
        tipo_planilla: planilla.tipo_planilla || 'N/A',
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
        ap_efectivo: formatNumber(apEfectivo),
      };
    });

    // Ahora crear el objeto data con el total ya calculado
    const data = {
      mes: mes ? moment().month(mes - 1).format('MMMM').toUpperCase() : 'Todos',
      gestion: gestion || 'Todos',
      ap_efectivo_total: formatNumber(apEfectivoTotal),
      planillas: planillasData,
    };

    console.log('✅ Datos finales para el reporte:', JSON.stringify(data, null, 2));

    // Verificar existencia de plantilla
    const templatePath = path.resolve(process.cwd(), 'reports/aportes-mensuales.docx');
    console.log('📂 Verificando plantilla en:', templatePath);

    if (!fs.existsSync(templatePath)) {
      console.error('❌ Plantilla no encontrada en:', templatePath);
      throw new BadRequestException(`La plantilla en ${templatePath} no existe`);
    }

    // Generar el reporte con Carbone
    console.log('⚙️ Generando reporte con Carbone...');
    return new Promise<StreamableFile>((resolve, reject) => {
      carbone.render(templatePath, data, { convertTo: 'pdf' }, (err, result) => {
        if (err) {
          console.error('❌ Error al generar PDF con Carbone:', err);
          return reject(new BadRequestException(`Error al generar el reporte con Carbone: ${err.message}`));
        }

        if (typeof result === 'string') {
          console.warn('⚠️ El resultado de Carbone es string, convirtiendo a Buffer...');
          result = Buffer.from(result, 'utf-8');
        }

        console.log('✅ Reporte generado correctamente');
        resolve(
          new StreamableFile(result, {
            type: 'application/pdf',
            disposition: `attachment; filename=historial_planillas_${mes || 'todos'}_${gestion || 'todos'}_${new Date().toISOString().split('T')[0]}.pdf`,
          }),
        );
      });
    });
  } catch (error) {
    console.error('❌ Error en generarReporteHistorial:', error);
    throw new BadRequestException(`Error al generar el reporte de historial: ${error.message}`);
  }
}


// 28 .- CRUCE CON AFILIACIONES 1 
async verificarAfiliacionDetalles(idPlanilla: number): Promise<{ mensaje: string; detallesActualizados: number; estadisticas: any; casos: any; resumen: any; trabajadoresFaltantes: any[]; fecha_verificacion: Date }> {
  try {
    if (!idPlanilla || idPlanilla < 1) {
      throw new BadRequestException('El ID de la planilla debe ser un número positivo');
    }

    // 1. Obtener datos de la planilla y detalles
    const planilla = await this.planillaRepo.findOne({
      where: { id_planilla_aportes: idPlanilla },
      relations: ['empresa']
    });

    if (!planilla) {
      throw new BadRequestException('Planilla no encontrada');
    }

    const detalles = await this.detalleRepo.find({
      where: { id_planilla_aportes: idPlanilla },
    });

    if (!detalles || detalles.length === 0) {
      throw new BadRequestException('No se encontraron detalles para la planilla especificada');
    }

    console.log(`📊 Iniciando verificación COMPLETA de ${detalles.length} registros para planilla ${idPlanilla}...`);
    console.log(`🏢 Empresa: ${planilla.empresa?.emp_nom}, Patrón: ${planilla.cod_patronal}`);

    let detallesActualizados = 0;
    const trabajadoresFaltantes = [];
    
    // Estadísticas expandidas
    const estadisticas = {
      total_procesados: 0,
      encontrados_vigentes: 0,
      encontrados_no_vigentes: 0,
      mensajes_especiales: 0,
      no_encontrados: 0,
      errores_consulta: 0,
      ci_no_coinciden: 0,
      total_api_asegurados: 0,
      total_api_vigentes: 0,
      total_api_no_vigentes: 0,
      trabajadores_faltantes: 0,
      trabajadores_excluidos_baja: 0,
      personas_unicas_planilla: 0,
      personas_vigentes_planilla: 0,
      registros_doble_cargo: 0
    };
    
    // 2. Asegurar token de API
    if (!this.externalApiService.getApiToken()) {
      console.log('🔑 Obteniendo token de API externa...');
      await this.externalApiService.loginToExternalApi();
    }

    // 3. Obtener TODOS los asegurados del número patronal
    console.log(`🔍 Obteniendo todos los asegurados del patrón ${planilla.cod_patronal}...`);
    
    let todosLosAsegurados = [];
    try {
      const responseAsegurados = await this.externalApiService.getAllAseguradosByNroPatronal(planilla.cod_patronal);
      
      if (responseAsegurados.status && responseAsegurados.data) {
        todosLosAsegurados = responseAsegurados.data;
        estadisticas.total_api_asegurados = todosLosAsegurados.length;
        
        // Contar por estado
        estadisticas.total_api_vigentes = todosLosAsegurados.filter(a => a.ASE_ESTADO === 'VIGENTE').length;
        estadisticas.total_api_no_vigentes = todosLosAsegurados.filter(a => a.ASE_ESTADO !== 'VIGENTE').length;
        
        console.log(`📋 Obtenidos ${todosLosAsegurados.length} asegurados de la API:`);
        console.log(`   ✅ Vigentes: ${estadisticas.total_api_vigentes}`);
        console.log(`   ⚠️ No vigentes: ${estadisticas.total_api_no_vigentes}`);
      } else {
        console.log(`❌ No se pudieron obtener asegurados del patrón ${planilla.cod_patronal}`);
      }
    } catch (error) {
      console.error(`❌ Error al obtener asegurados del patrón:`, error);
    }

    // 4. Crear mapas para comparación eficiente
    const aseguradosMap = new Map();

    // Mapear asegurados de la API por CI base
    todosLosAsegurados.forEach(asegurado => {
      const ciApi = (asegurado.ASE_CI || '').toString().trim();
      const complementoApi = (asegurado.ASE_CI_COM || '').trim().toUpperCase();
      const complementoValido = complementoApi && 
                               complementoApi !== '-' && 
                               complementoApi !== '' && 
                               complementoApi.length > 0;
      
      const ciCompleto = complementoValido ? `${ciApi}-${complementoApi}` : ciApi;
      
      // Mapear por CI base y completo
      aseguradosMap.set(ciApi, asegurado);
      aseguradosMap.set(ciApi.toUpperCase(), asegurado);
      aseguradosMap.set(ciCompleto, asegurado);
      aseguradosMap.set(ciCompleto.toUpperCase(), asegurado);
      aseguradosMap.set(ciApi.toLowerCase(), asegurado);
      aseguradosMap.set(ciCompleto.toLowerCase(), asegurado);
    });

    console.log(`🗺️ Asegurados mapeados: ${aseguradosMap.size} entradas para ${todosLosAsegurados.length} asegurados`);

    // 5. Identificar trabajadores faltantes - CORREGIDO
    console.log(`🔍 Identificando trabajadores faltantes (considerando doble cargo)...`);

    // Crear un Set de CIs base únicos que SÍ están en la planilla (NORMALIZADO)
    const cisBasePlanilla = new Set();
    detalles.forEach(detalle => {
      const ciBase = detalle.ci.split('-')[0].trim().toLowerCase();
      cisBasePlanilla.add(ciBase);
    });

    console.log(`👥 CIs base únicos en planilla: ${cisBasePlanilla.size}`);

    // Limpiar el array de trabajadores faltantes
    trabajadoresFaltantes.length = 0;

    // Comparar cada asegurado vigente de la API
    let contadorFaltantes = 0;
    todosLosAsegurados.forEach((asegurado) => {
      if (asegurado.ASE_ESTADO === 'VIGENTE') {
        const ciApiBase = (asegurado.ASE_CI || '').toString().trim().toLowerCase();
        
        // Verificar si este CI base está en la planilla
        const estaEnPlanilla = cisBasePlanilla.has(ciApiBase);
        
        if (!estaEnPlanilla) {
          // ESTE SÍ es un faltante real
          const complementoApi = (asegurado.ASE_CI_COM || '').trim().toUpperCase();
          const complementoValido = complementoApi && 
                                  complementoApi !== '-' && 
                                  complementoApi !== '' && 
                                  complementoApi.length > 0;
          const ciCompleto = complementoValido ? `${asegurado.ASE_CI}-${complementoApi}` : asegurado.ASE_CI;
          
          contadorFaltantes++;
          trabajadoresFaltantes.push({
            ci: ciCompleto,
            nombres: asegurado.ASE_NOM,
            apellido_paterno: asegurado.ASE_APAT,
            apellido_materno: asegurado.ASE_AMAT,
            matricula: asegurado.ASE_MAT,
            cargo: asegurado.ASE_CARGO,
            estado: asegurado.ASE_ESTADO,
            tipo: asegurado.ASE_TIPO,
            fecha_afiliacion: asegurado.ASE_FEC_AFI,
            haber: asegurado.ASE_HABER
          });
          
          console.log(`❓ FALTANTE ${contadorFaltantes}: CI ${ciCompleto} - ${asegurado.ASE_NOM} ${asegurado.ASE_APAT}`);
        }
      } else {
        estadisticas.trabajadores_excluidos_baja++;
      }
    });

    // Actualizar estadística
    estadisticas.trabajadores_faltantes = trabajadoresFaltantes.length;

    console.log(`❓ Trabajadores (personas) faltantes en planilla: ${trabajadoresFaltantes.length}`);
    console.log(`🚫 Trabajadores excluidos (BAJA/otros): ${estadisticas.trabajadores_excluidos_baja}`);

    // 6. Procesar detalles de la planilla
    console.log(`🔄 Procesando ${detalles.length} trabajadores de la planilla...`);

    const procesarDetalle = async (detalle: any) => {
      try {
        // Limpiar campos
        detalle.matricula = null;
        detalle.tipo_afiliado = null;
        detalle.asegurado_tipo = null;
        detalle.asegurado_estado = null;
        detalle.observaciones_afiliacion = null;
        detalle.fecha_ultima_verificacion = new Date();

        const ciBase = detalle.ci.split('-')[0].trim();
        
        // Buscar en el mapa local de asegurados
        const aseguradoEncontrado = aseguradosMap.get(ciBase) || 
                                   aseguradosMap.get(detalle.ci.trim().toUpperCase()) ||
                                   aseguradosMap.get(detalle.ci.trim().toLowerCase());
        
        if (aseguradoEncontrado) {
          console.log(`✅ ENCONTRADO EN MAPA LOCAL para CI ${detalle.ci}`);
          
          // Verificar coincidencia de CI
          const ciApi = (aseguradoEncontrado.ASE_CI || '').toString().trim();
          const complementoApi = (aseguradoEncontrado.ASE_CI_COM || '').trim().toUpperCase();
          const complementoValido = complementoApi && 
                                   complementoApi !== '-' && 
                                   complementoApi !== '' && 
                                   complementoApi.length > 0;
          const ciApiCompleto = complementoValido ? `${ciApi}-${complementoApi}` : ciApi;
          const ciDetalle = detalle.ci.trim().toUpperCase();
          
          const comparaciones = [
            ciDetalle === ciApiCompleto.toUpperCase(),
            ciDetalle.split('-')[0] === ciApi,
            ciDetalle === ciApi.toUpperCase(),
            ciDetalle.toLowerCase() === ciApiCompleto.toLowerCase()
          ];
          
          const coincide = comparaciones.some(comp => comp);
          
          if (coincide) {
            // Mapear datos exitosos
            detalle.matricula = aseguradoEncontrado.ASE_MAT || null;
            detalle.tipo_afiliado = aseguradoEncontrado.ASE_COND_EST || null;
            detalle.asegurado_tipo = aseguradoEncontrado.ASE_TIPO || null;
            detalle.asegurado_estado = aseguradoEncontrado.ASE_ESTADO || null;
            
            if (aseguradoEncontrado.ASE_ESTADO === 'VIGENTE') {
              estadisticas.encontrados_vigentes++;
            } else {
              estadisticas.encontrados_no_vigentes++;
            }
            
            console.log(`✅ CI ${detalle.ci} MAPEADO: Estado=${aseguradoEncontrado.ASE_ESTADO}, Matrícula=${aseguradoEncontrado.ASE_MAT}`);
          } else {
            detalle.observaciones_afiliacion = `CI no coincide. Planilla: "${ciDetalle}", API: "${ciApiCompleto}"`;
            estadisticas.ci_no_coinciden++;
          }
        } else {
          // Fallback: Consultar individualmente
          const response = await this.externalApiService.getAseguradoByCi(ciBase);
          
          if (response.msg && response.msg.trim() !== '') {
            detalle.observaciones_afiliacion = response.msg.trim();
            estadisticas.mensajes_especiales++;
          } else if (response.status === true && response.data && response.data.ASE_CI) {
            const data = response.data;
            const ciApi = (data.ASE_CI || '').trim();
            const complementoApi = (data.ASE_CI_COM || '').trim().toUpperCase();
            const complementoValido = complementoApi && 
                                     complementoApi !== '-' && 
                                     complementoApi !== '' && 
                                     complementoApi.length > 0;
            const ciApiCompleto = complementoValido ? `${ciApi}-${complementoApi}` : ciApi;
            const ciDetalle = detalle.ci.trim().toUpperCase();
            
            const comparaciones = [
              ciDetalle === ciApiCompleto.toUpperCase(),
              ciDetalle.split('-')[0] === ciApi,
              ciDetalle === ciApi.toUpperCase()
            ];
            
            const coincide = comparaciones.some(comp => comp);
            
            if (coincide) {
              detalle.matricula = data.ASE_MAT || null;
              detalle.tipo_afiliado = data.ASE_COND_EST || null;
              detalle.asegurado_tipo = data.ASE_TIPO || null;
              detalle.asegurado_estado = data.ASE_ESTADO || null;
              
              if (data.ASE_ESTADO === 'VIGENTE') {
                estadisticas.encontrados_vigentes++;
              } else {
                estadisticas.encontrados_no_vigentes++;
              }
            } else {
              detalle.observaciones_afiliacion = `CI no coincide. Planilla: "${ciDetalle}", API: "${ciApiCompleto}"`;
              estadisticas.ci_no_coinciden++;
            }
          } else {
            detalle.observaciones_afiliacion = 'No se encontró información en el sistema de afiliaciones';
            estadisticas.no_encontrados++;
          }
        }

        estadisticas.total_procesados++;
        return detalle;

      } catch (error) {
        console.error(`❌ ERROR para CI ${detalle.ci}: ${error.message}`);
        
        detalle.matricula = null;
        detalle.tipo_afiliado = null;
        detalle.asegurado_tipo = null;
        detalle.asegurado_estado = null;
        detalle.observaciones_afiliacion = `Error de consulta: ${error.message}`;
        detalle.fecha_ultima_verificacion = new Date();
        
        estadisticas.errores_consulta++;
        estadisticas.total_procesados++;
        return detalle;
      }
    };

    // 7. Procesar todos los detalles por lotes
    const BATCH_SIZE = 50;
    for (let i = 0; i < detalles.length; i += BATCH_SIZE) {
      const lote = detalles.slice(i, i + BATCH_SIZE);
      console.log(`🔄 Procesando lote ${Math.floor(i/BATCH_SIZE) + 1} (${lote.length} registros)`);
      
      const detallesProcesados = await Promise.all(lote.map(procesarDetalle));
      
      try {
        await this.detalleRepo.save(detallesProcesados, { chunk: 100, reload: false });
        detallesActualizados += detallesProcesados.length;
      } catch (saveError) {
        console.error(`❌ Error al guardar lote:`, saveError);
        for (const detalle of detallesProcesados) {
          try {
            await this.detalleRepo.save(detalle);
            detallesActualizados++;
          } catch (individualError) {
            console.error(`❌ Error individual CI ${detalle.ci}:`, individualError);
          }
        }
      }
      
      if (i + BATCH_SIZE < detalles.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // 8. ANÁLISIS COMPLETO DE TODOS LOS CASOS
    console.log(`🔍 GENERANDO ANÁLISIS COMPLETO DE TODOS LOS CASOS...`);

    // Arrays para los 4 casos
    const trabajadoresVigentes = [];
    const trabajadoresNoVigentes = [];
    const trabajadoresNoEncontrados = [];

    // Procesar detalles para clasificar en los 4 casos
    detalles.forEach(detalle => {
      const trabajadorBase = {
        ci: detalle.ci,
        nombres: detalle.nombres,
        apellido_paterno: detalle.apellido_paterno,
        apellido_materno: detalle.apellido_materno,
        cargo: detalle.cargo,
        regional: detalle.regional,
        salario: detalle.salario,
        fecha_ingreso: detalle.fecha_ingreso,
        fecha_retiro: detalle.fecha_retiro,
        matricula: detalle.matricula,
        tipo_afiliado: detalle.tipo_afiliado,
        observaciones_afiliacion: detalle.observaciones_afiliacion
      };

      if (detalle.asegurado_estado === 'VIGENTE') {
        // CASO 1: Vigentes
        trabajadoresVigentes.push({
          ...trabajadorBase,
          estado: detalle.asegurado_estado,
          tipo: detalle.asegurado_tipo
        });
      } else if (detalle.asegurado_estado && detalle.asegurado_estado !== 'VIGENTE') {
        // CASO 2: No vigentes (tienen estado pero no es VIGENTE)
        trabajadoresNoVigentes.push({
          ...trabajadorBase,
          estado: detalle.asegurado_estado,
          tipo: detalle.asegurado_tipo || 'N/A',
          motivo: `Estado en API: ${detalle.asegurado_estado}`
        });
      } else {
        // CASO 3: No encontrados (no tienen estado)
        trabajadoresNoEncontrados.push({
          ...trabajadorBase,
          motivo: detalle.observaciones_afiliacion || 'No se encontró información en el sistema de afiliaciones'
        });
      }
    });

    // 9. CÁLCULOS ESPECIALES PARA DOBLE CARGO
    const personasUnicasEnPlanilla = new Set();
    const personasVigentesEnPlanilla = new Set();

    detalles.forEach(detalle => {
      const ciBase = detalle.ci.split('-')[0].trim().toLowerCase();
      personasUnicasEnPlanilla.add(ciBase);
      
      if (detalle.asegurado_estado === 'VIGENTE') {
        personasVigentesEnPlanilla.add(ciBase);
      }
    });

    const registrosConDobleCargo = detalles.length - personasUnicasEnPlanilla.size;

    // Resumen completo
    const resumenCompleto = {
      total_planilla: detalles.length,
      vigentes: trabajadoresVigentes.length,
      no_vigentes: trabajadoresNoVigentes.length,
      no_encontrados: trabajadoresNoEncontrados.length,
      faltantes: trabajadoresFaltantes.length,
      verificacion_matematica: trabajadoresVigentes.length + trabajadoresNoVigentes.length + trabajadoresNoEncontrados.length === detalles.length
    };

    // 10. Estadísticas finales expandidas
    console.log(`📊 ESTADÍSTICAS FINALES COMPLETAS:`);
    console.log(`   📋 DATOS DE LA API:`);
    console.log(`      Total asegurados en API: ${estadisticas.total_api_asegurados}`);
    console.log(`      API vigentes: ${estadisticas.total_api_vigentes}`);
    console.log(`      API no vigentes: ${estadisticas.total_api_no_vigentes}`);
    console.log(`   📋 DATOS DE LA PLANILLA:`);
    console.log(`      Total REGISTROS procesados: ${estadisticas.total_procesados}`);
    console.log(`      Total PERSONAS únicas: ${personasUnicasEnPlanilla.size}`);
    console.log(`      Registros con doble cargo: ${registrosConDobleCargo}`);
    console.log(`      ✅ Encontrados vigentes (registros): ${estadisticas.encontrados_vigentes}`);
    console.log(`      ✅ Personas vigentes únicas: ${personasVigentesEnPlanilla.size}`);
    console.log(`      ⚠️ Encontrados no vigentes: ${estadisticas.encontrados_no_vigentes}`);
    console.log(`      📝 Con mensajes especiales: ${estadisticas.mensajes_especiales}`);
    console.log(`      ❓ No encontrados: ${estadisticas.no_encontrados}`);
    console.log(`      ❌ CI no coinciden: ${estadisticas.ci_no_coinciden}`);
    console.log(`      🚨 Errores de consulta: ${estadisticas.errores_consulta}`);
    console.log(`   🔍 ANÁLISIS DE DIFERENCIAS (PERSONAS, NO REGISTROS):`);
    console.log(`      ❓ Personas faltantes en planilla: ${estadisticas.trabajadores_faltantes}`);
    console.log(`      🚫 Excluidos por estado BAJA: ${estadisticas.trabajadores_excluidos_baja}`);
    console.log(`   📊 RESUMEN DE LOS 4 CASOS:`);
    console.log(`      ✅ Vigentes: ${resumenCompleto.vigentes}`);
    console.log(`      ⚠️ No vigentes: ${resumenCompleto.no_vigentes}`);
    console.log(`      ❓ No encontrados: ${resumenCompleto.no_encontrados}`);
    console.log(`      📋 Faltantes: ${resumenCompleto.faltantes}`);
    console.log(`   🧮 VERIFICACIÓN MATEMÁTICA:`);
    console.log(`      ${resumenCompleto.vigentes} + ${resumenCompleto.no_vigentes} + ${resumenCompleto.no_encontrados} = ${resumenCompleto.vigentes + resumenCompleto.no_vigentes + resumenCompleto.no_encontrados} (debe ser ${resumenCompleto.total_planilla})`);
    console.log(`      ✅ ¿Suma correcta? ${resumenCompleto.verificacion_matematica ? 'SÍ' : 'NO'}`);

    // ACTUALIZAR LAS ESTADÍSTICAS PARA EL FRONTEND
    estadisticas.personas_unicas_planilla = personasUnicasEnPlanilla.size;
    estadisticas.personas_vigentes_planilla = personasVigentesEnPlanilla.size;
    estadisticas.registros_doble_cargo = registrosConDobleCargo;

    console.log(`✅ Verificación COMPLETA finalizada. Total actualizados: ${detallesActualizados}`);

    // NUEVO: Actualizar fecha de verificación en la planilla
    try {
      planilla.fecha_verificacion_afiliacion = new Date();
      await this.planillaRepo.save(planilla);
      console.log(`📅 Fecha de verificación actualizada: ${planilla.fecha_verificacion_afiliacion}`);
    } catch (error) {
      console.warn(`⚠️ No se pudo actualizar fecha de verificación: ${error.message}`);
      // No lanzar error, es solo informativo
    }

    // RETURN COMPLETO CON TODOS LOS DATOS (agregar fecha_verificacion)
    return {
      mensaje: `Verificación completa finalizada. Se actualizaron ${detallesActualizados} detalles.`,
      detallesActualizados,
      estadisticas,
      
      // LOS 4 CASOS PRINCIPALES
      casos: {
        vigentes: trabajadoresVigentes,
        no_vigentes: trabajadoresNoVigentes,
        no_encontrados: trabajadoresNoEncontrados,
        faltantes: trabajadoresFaltantes
      },
      
      // RESUMEN EJECUTIVO
      resumen: {
        total_planilla: resumenCompleto.total_planilla,
        vigentes: resumenCompleto.vigentes,
        no_vigentes: resumenCompleto.no_vigentes,
        no_encontrados: resumenCompleto.no_encontrados,
        faltantes: resumenCompleto.faltantes,
        verificacion_matematica: resumenCompleto.verificacion_matematica
      },

      fecha_verificacion: planilla.fecha_verificacion_afiliacion,
      trabajadoresFaltantes
    };

  } catch (error) {
    console.error('❌ Error en verificarAfiliacionDetalles:', error);
    throw new BadRequestException(`Error al verificar afiliación: ${error.message}`);
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
        /* es_afiliado: detalle.es_afiliado ? 'Sí' : 'No', */
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





// NUEVO MÉTODO: Buscar planilla del mes anterior usando fecha_planilla
async buscarPlanillaMesAnterior(codPatronal: string, fechaActual: Date): Promise<any> {
  try {
    // Calcular el primer y último día del mes anterior
    const fechaMesAnterior = new Date(fechaActual);
    fechaMesAnterior.setMonth(fechaMesAnterior.getMonth() - 1);
    
    // Primer día del mes anterior
    const primerDia = new Date(fechaMesAnterior.getFullYear(), fechaMesAnterior.getMonth(), 1);
    
    // Último día del mes anterior
    const ultimoDia = new Date(fechaMesAnterior.getFullYear(), fechaMesAnterior.getMonth() + 1, 0);
    
    console.log(`🔍 Buscando planilla mes anterior:
      - Cod Patronal: ${codPatronal}
      - Rango fechas: ${primerDia.toISOString().split('T')[0]} a ${ultimoDia.toISOString().split('T')[0]}`);

    const planilla = await this.planillaRepo.findOne({
      where: {
        cod_patronal: codPatronal,
        fecha_planilla: Between(primerDia, ultimoDia),
        estado: Not(0) // No incluir borradas
      },
      order: {
        fecha_planilla: 'DESC', // La más reciente del mes
        fecha_creacion: 'DESC'
      }
    });

    if (planilla) {
      console.log(`✅ Planilla encontrada: ID ${planilla.id_planilla_aportes}, Fecha: ${planilla.fecha_planilla}`);
    } else {
      console.log(`❌ No se encontró planilla del mes anterior`);
    }

    return planilla;
  } catch (error) {
    console.error('Error al buscar planilla del mes anterior:', error);
    return null;
  }
}

// 31.- OBTENER DATOS DE VERIFICACIÓN GUARDADOS DE CRUCE DE AFILIACIONES
async obtenerDatosVerificacionGuardados(idPlanilla: number): Promise<any> {
  try {
    // Obtener información de la planilla
    const planilla = await this.planillaRepo.findOne({
      where: { id_planilla_aportes: idPlanilla },
      relations: ['empresa'],
    });

    if (!planilla) {
      throw new NotFoundException('Planilla no encontrada');
    }

    // Verificar que la planilla tenga fecha de verificación
    if (!planilla.fecha_verificacion_afiliacion) {
      throw new NotFoundException('Esta planilla no tiene datos de verificación guardados');
    }

    // Obtener todos los detalles de la planilla
    const detalles = await this.detalleRepo.find({
      where: { id_planilla_aportes: idPlanilla },
      order: { apellido_paterno: 'ASC', apellido_materno: 'ASC', nombres: 'ASC' }
    });

    if (!detalles || detalles.length === 0) {
      throw new BadRequestException('No se encontraron detalles para la planilla');
    }

    // Clasificar trabajadores según su estado de afiliación
    const trabajadoresVigentes = detalles.filter(d => d.asegurado_estado === 'VIGENTE');
    const trabajadoresNoVigentes = detalles.filter(d => 
      d.asegurado_estado && d.asegurado_estado !== 'VIGENTE' && d.asegurado_estado !== null
    );
    const trabajadoresNoEncontrados = detalles.filter(d => 
      !d.asegurado_estado || d.asegurado_estado === null
    );

    // Crear estructura de casos (similar a verificarAfiliacionDetalles)
    const casos = {
      vigentes: trabajadoresVigentes.map(detalle => ({
        ci: detalle.ci,
        nombres: detalle.nombres,
        apellido_paterno: detalle.apellido_paterno,
        apellido_materno: detalle.apellido_materno,
        cargo: detalle.cargo,
        regional: detalle.regional,
        salario: detalle.salario,
        matricula: detalle.matricula,
        tipo_afiliado: detalle.tipo_afiliado,
        asegurado_tipo: detalle.asegurado_tipo,
        asegurado_estado: detalle.asegurado_estado,
        observaciones_afiliacion: detalle.observaciones_afiliacion
      })),
      no_vigentes: trabajadoresNoVigentes.map(detalle => ({
        ci: detalle.ci,
        nombres: detalle.nombres,
        apellido_paterno: detalle.apellido_paterno,
        apellido_materno: detalle.apellido_materno,
        cargo: detalle.cargo,
        regional: detalle.regional,
        salario: detalle.salario,
        asegurado_estado: detalle.asegurado_estado,
        asegurado_tipo: detalle.asegurado_tipo,
        observaciones_afiliacion: detalle.observaciones_afiliacion
      })),
      no_encontrados: trabajadoresNoEncontrados.map(detalle => ({
        ci: detalle.ci,
        nombres: detalle.nombres,
        apellido_paterno: detalle.apellido_paterno,
        apellido_materno: detalle.apellido_materno,
        cargo: detalle.cargo,
        regional: detalle.regional,
        salario: detalle.salario,
        asegurado_estado: detalle.asegurado_estado,
        asegurado_tipo: detalle.asegurado_tipo,
        observaciones_afiliacion: detalle.observaciones_afiliacion
      })),
      faltantes: [] // Este dato no se puede reconstruir, se necesitaría guardar por separado
    };

    // Crear resumen
    const resumen = {
      vigentes: trabajadoresVigentes.length,
      no_vigentes: trabajadoresNoVigentes.length,
      no_encontrados: trabajadoresNoEncontrados.length,
      faltantes: 0, // Este dato no se puede reconstruir
      total_planilla: detalles.length,
      total_verificados: trabajadoresVigentes.length + trabajadoresNoVigentes.length
    };

    // Crear estadísticas (puedes expandir según tus necesidades)
    const estadisticas = {
      porcentaje_vigentes: detalles.length > 0 ? ((trabajadoresVigentes.length / detalles.length) * 100).toFixed(2) : '0.00',
      porcentaje_no_vigentes: detalles.length > 0 ? ((trabajadoresNoVigentes.length / detalles.length) * 100).toFixed(2) : '0.00',
      porcentaje_no_encontrados: detalles.length > 0 ? ((trabajadoresNoEncontrados.length / detalles.length) * 100).toFixed(2) : '0.00'
    };

    return {
      success: true,
      message: 'Datos de verificación recuperados exitosamente',
      data: {
        casos,
        resumen,
        estadisticas,
        fecha_verificacion: planilla.fecha_verificacion_afiliacion,
        planilla_info: {
          mes: planilla.mes,
          gestion: planilla.gestion,
        }
      }
    };

  } catch (error) {
    if (error instanceof NotFoundException || error instanceof BadRequestException) {
      throw error;
    }
    throw new BadRequestException(`Error al obtener datos de verificación: ${error.message}`);
  }
}

//? MÉTODO PRIVADO: Guardar pago del desembolso TGN en pagos_aportes_mensuales
private async guardarPagoDesembolsoTGN(idPlanilla: number, fechaPago: Date, montoTGN: number , totalACancelar: number): Promise<void> {
  try {
    console.log('💾 Guardando pago del desembolso TGN en pagos_aportes_mensuales');
    
    const nuevoPago = this.pagoAporteRepo.create({
      id_planilla_aportes: idPlanilla,
      fecha_pago: fechaPago,
      monto_pagado: montoTGN,
      metodo_pago: 'SIGEP',
      comprobante_pago: null,
      foto_comprobante: null,
      observaciones: 'Pago automático del desembolso TGN',
      estado: 1,
      estado_envio: null,
      monto_demasia: null,
      total_a_cancelar: totalACancelar
    });

    await this.pagoAporteRepo.save(nuevoPago);
    console.log('✅ Pago del desembolso TGN guardado correctamente');
    
  } catch (error) {
    console.error('❌ Error al guardar pago del desembolso TGN:', error);
    throw new BadRequestException(`Error al guardar pago del desembolso TGN: ${error.message}`);
  }
}

// ELIMINAR PLANILLA COMPLETA (CABECERA + DETALLES) SOLO SI ESTÁ EN ESTADO BORRADOR (0) -------
async eliminarPlanillaCompleta(id_planilla: number, usuario_eliminacion?: string) {
  // Usar QueryRunner para transacción
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // 1. Buscar la planilla
    const planilla = await queryRunner.manager.findOne(PlanillasAporte, { 
      where: { id_planilla_aportes: id_planilla },
      relations: ['empresa']
    });

    if (!planilla) {
      throw new BadRequestException('La planilla no existe');
    }

    // 2. Validar que la planilla esté en estado BORRADOR (0)
    if (planilla.estado !== 0) {
      const estados = {
        1: 'PRESENTADA',
        2: 'APROBADA', 
        3: 'OBSERVADA'
      };
      throw new BadRequestException(
        `No se puede eliminar la planilla. Estado actual: ${estados[planilla.estado] || 'DESCONOCIDO'}. Solo se pueden eliminar planillas en estado BORRADOR.`
      );
    }

    // 3. Verificar si tiene pagos asociados (restricción adicional de seguridad)
    const pagosAsociados = await queryRunner.manager.count(PagoAporte, {
      where: { id_planilla_aportes: id_planilla }
    });

    if (pagosAsociados > 0) {
      throw new BadRequestException(
        'No se puede eliminar la planilla porque tiene pagos asociados'
      );
    }

    // 4. Contar cuántos detalles tiene antes de eliminar
    const totalDetalles = await queryRunner.manager.count(PlanillaAportesDetalles, {
      where: { id_planilla_aportes: id_planilla }
    });

    console.log(`🗑️ Eliminando planilla ${id_planilla} con ${totalDetalles} trabajadores...`);

    // 5. Eliminar PRIMERO los detalles (por la relación FK)
    await queryRunner.manager.delete(PlanillaAportesDetalles, { 
      id_planilla_aportes: id_planilla 
    });

    console.log(`✅ Eliminados ${totalDetalles} detalles de la planilla`);

    // 6. Eliminar la planilla principal
    await queryRunner.manager.delete(PlanillasAporte, { 
      id_planilla_aportes: id_planilla 
    });

    console.log(`✅ Planilla ${id_planilla} eliminada completamente`);

    // 7. Confirmar transacción
    await queryRunner.commitTransaction();

    // 8. Crear notificación de eliminación
    if (planilla.empresa) {
      const meses = [
        'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
        'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
      ];
      
      const nombreMes = meses[Number(planilla.mes) - 1];
      
      const notificacionDto = {
        id_usuario_receptor: 'COTIZACIONES_EMPRESA',
        tipo_notificacion: 'PLANILLA_ELIMINADA',
        empresa: planilla.empresa.emp_nom,
        mensaje: `Planilla Mensual ELIMINADA correspondiente a MES: ${nombreMes}, AÑO: ${planilla.gestion} - Total trabajadores eliminados: ${totalDetalles}`,
        id_recurso: id_planilla,
        tipo_recurso: 'PLANILLA_APORTES',
        usuario_creacion: usuario_eliminacion || 'SISTEMA',
        nom_usuario: usuario_eliminacion || 'Sistema Automático',
      };

      try {
        await this.notificacionesService.crearNotificacion(notificacionDto);
      } catch (notifError) {
        console.error('Error al crear notificación de eliminación:', notifError);
        // No fallar la eliminación por error en notificación
      }
    }

    return {
      mensaje: '✅ Planilla eliminada completamente con éxito',
      datos: {
        id_planilla_eliminada: id_planilla,
        empresa: planilla.empresa?.emp_nom || 'Sin empresa',
        mes: planilla.mes,
        gestion: planilla.gestion,
        total_trabajadores_eliminados: totalDetalles,
        cod_patronal: planilla.cod_patronal
      }
    };

  } catch (error) {
    // Hacer rollback en caso de error
    await queryRunner.rollbackTransaction();
    console.error('Error al eliminar planilla completa:', error);
    
    if (error instanceof BadRequestException) {
      throw error;
    }
    
    throw new BadRequestException(
      `Error al eliminar la planilla: ${error.message}`
    );
  } finally {
    // Liberar el QueryRunner
    await queryRunner.release();
  }
}



}
