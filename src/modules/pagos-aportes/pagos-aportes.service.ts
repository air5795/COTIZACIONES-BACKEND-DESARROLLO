import { Injectable, BadRequestException, StreamableFile } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PagoAporte } from './entities/pagos-aporte.entity';
import * as fs from 'fs';
import { join } from 'path';
import { PlanillasAportesService } from '../planillas_aportes/planillas_aportes.service';
import * as moment from 'moment-timezone';
import * as path from 'path';
import { resolve } from 'path';
import * as carbone from 'carbone';
import { NumeroALetras } from 'numero-a-letras';

@Injectable()
export class PagosAportesService {
  constructor(
    @InjectRepository(PagoAporte)
    private readonly pagoAporteRepository: Repository<PagoAporte>,
    private planillasAportesService: PlanillasAportesService,
  ) {}

  // 1.- CREAR EN BASE DE DATOS EL PAGO Y ACTUALIZAR FECHA_PAGO EN PLANILLAS_APORTES
  async createPago(pagoData: Partial<PagoAporte>, file?: Express.Multer.File): Promise<PagoAporte> {
    const queryRunner = this.pagoAporteRepository.manager.connection.createQueryRunner();

    await queryRunner.startTransaction();
    try {
      let nuevoPago: PagoAporte;

      if (file) {
        const filePath = join('pagos-imagenes', file.filename);
        pagoData.foto_comprobante = filePath;
        console.log('Archivo guardado en:', filePath);
      }

      // Crear y guardar el nuevo pago
      nuevoPago = this.pagoAporteRepository.create(pagoData);
      await queryRunner.manager.save(nuevoPago);

      // Actualizar la fecha_pago en planillas_aportes
      const idPlanilla = pagoData.id_planilla_aportes;
      if (idPlanilla) {
        const fechaPago = pagoData.fecha_pago ? new Date(pagoData.fecha_pago) : new Date();
        await this.planillasAportesService.actualizarFechaPago(idPlanilla, fechaPago);
        // Recalcular los aportes con la fecha_pago real
        await this.planillasAportesService.calcularAportes(idPlanilla);
      } else {
        throw new BadRequestException('El id_planilla_aportes es requerido.');
      }

      await queryRunner.commitTransaction();
      return nuevoPago;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (file && file.filename) {
        const filePath = join(process.cwd(), 'pagos-aportes', 'pagos', file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      throw new BadRequestException('Error al crear el pago: ' + error.message);
    } finally {
      await queryRunner.release();
    }
  }
  // 2.- LISTAR TODOS LOS PAGOS
  async findAll() {
    try {
      const pagos = await this.pagoAporteRepository.find();
      return pagos;
    } catch (error) {
      throw new BadRequestException('Error al listar los pagos: ' + error.message);
    }
  }
  // 3.- LISTAR PAGOS PARA VISTA DE EMPLEADOR (ESTADO_ENVIO = 0 , ESTADO_ENVIO = 1) 
  async findByIdPlanilla(id_planilla_aportes: number) {
    try {
      const pagos = await this.pagoAporteRepository.find({
        where: { id_planilla_aportes },
      });
      return pagos;
    } catch (error) {
      throw new BadRequestException('Error al buscar pagos por id_planilla_aportes: ' + error.message);
    }
  }

  // 4.- LISTAR PAGOS PARA VISTA ADMINISTRADOR (ESTADO_ENVIO = 1)
  async findByIdPlanillAdmin(id_planilla_aportes: number) {
    try {
      const pagos = await this.pagoAporteRepository.find({
        where: { 
          id_planilla_aportes, 
          estado_envio: 1
         },
      });
      return pagos;
    } catch (error) {
      throw new BadRequestException('Error al buscar pagos por id_planilla_aportes: ' + error.message);
    }
  }

// Función manual para convertir números a letras
private numeroALetrasSimple(num: number | string): string {
  // Convertir a número si es un string, y manejar casos inválidos
  const numero = typeof num === 'string' ? parseFloat(num) : num;

  // Validar que sea un número válido
  if (isNaN(numero) || numero === null || numero === undefined) {
    return 'CERO BOLIVIANOS';
  }

  const unidades = ['CERO', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const decenas = ['DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const especiales = ['ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const centenas = ['CIEN', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  const [entero, decimal] = numero.toFixed(2).split('.').map(Number);

  const convertirMenorAMil = (n: number): string => {
    if (n === 0) return '';
    if (n < 10) return unidades[n];
    if (n < 20) return n === 10 ? 'DIEZ' : especiales[n - 11];
    if (n < 100) {
      const decena = Math.floor(n / 10);
      const unidad = n % 10;
      return unidad === 0 ? decenas[decena - 1] : `${decenas[decena - 1]} Y ${unidades[unidad]}`;
    }
    const centena = Math.floor(n / 100);
    const resto = n % 100;
    if (resto === 0) return centenas[centena - 1];
    if (n === 100) return 'CIEN';
    return `${centenas[centena - 1]} ${convertirMenorAMil(resto)}`;
  };

  const convertir = (n: number): string => {
    if (n === 0) return 'CERO';
    if (n < 1000) return convertirMenorAMil(n);
    const miles = Math.floor(n / 1000);
    const resto = n % 1000;
    const milesTexto = miles === 1 ? 'MIL' : `${convertirMenorAMil(miles)} MIL`;
    return resto === 0 ? milesTexto : `${milesTexto} ${convertirMenorAMil(resto)}`;
  };

  const enteroTexto = convertir(entero);
  const decimalTexto = decimal > 0 ? `CON ${decimal}/100` : 'EXACTOS';
  return `${enteroTexto} ${decimalTexto} BOLIVIANOS`;
}

// ... Métodos existentes (createPago, findAll, etc.) ...

async generarReportePagoAporte(idPlanillaAportes: number): Promise<StreamableFile> {
  console.log('Iniciando generarReportePagoAporte con ID:', idPlanillaAportes);
  try {
    // Validar parámetro
    if (idPlanillaAportes < 1) {
      throw new BadRequestException('El ID de la planilla debe ser un número positivo');
    }

    // Obtener el pago de la tabla pagos_aportes_mensuales
    console.log('Buscando pago para id_planilla_aportes:', idPlanillaAportes);
    const pago = await this.pagoAporteRepository.findOne({
      where: { id_planilla_aportes: idPlanillaAportes },
    });

    if (!pago) {
      console.log('No se encontró pago para id_planilla_aportes:', idPlanillaAportes);
      throw new BadRequestException('Pago no encontrado');
    }
    console.log('Pago encontrado:', pago);

    // Obtener los datos de la planilla_aportes
    console.log('Obteniendo planilla para id_planilla_aportes:', idPlanillaAportes);
    const planillaAporte = await this.planillasAportesService.obtenerPlanilla(idPlanillaAportes);
    if (!planillaAporte || !planillaAporte.planilla) {
      console.log('No se encontró planilla para id_planilla_aportes:', idPlanillaAportes);
      throw new BadRequestException('No se encontró la planilla de aportes relacionada');
    }
    console.log('Planilla de aportes:', planillaAporte.planilla);

    // Usar el nombre de la empresa desde planillaAporte.planilla.empresa
    const nombreEmpresa = planillaAporte.planilla.empresa || 'No disponible';
    console.log('Nombre de la empresa:', nombreEmpresa);

    // Configurar moment para español
    moment.locale('es');

    // Asegurarnos de que monto_pagado sea un número
    console.log('Procesando monto_pagado:', pago.monto_pagado);
    const montoPagado = typeof pago.monto_pagado === 'string' ? parseFloat(pago.monto_pagado) : pago.monto_pagado;
    if (isNaN(montoPagado)) {
      console.log('monto_pagado no es válido:', pago.monto_pagado);
      throw new BadRequestException('El monto_pagado no es un valor numérico válido');
    }
    console.log('monto_pagado convertido:', montoPagado);

    // Formatear el monto_pagado a literal usando la función manual
    const montoLiteral = this.numeroALetrasSimple(montoPagado);
    console.log('Monto literal:', montoLiteral);

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
      pago: {
        fecha_pago: formatDate(pago.fecha_pago),
        empresa: nombreEmpresa,
        monto_pagado: formatNumber(montoPagado),
        monto_pagado_literal: montoLiteral,
        observaciones: pago.observaciones || 'Sin observaciones',
      },
    };
    console.log('Datos para el reporte:', data);

    // Ruta de la plantilla de Carbone
    const templatePath = path.resolve('src/modules/pagos-aportes/templates/recibo.docx');
    console.log('Ruta de la plantilla:', templatePath);

    // Verificar si la plantilla existe
    if (!fs.existsSync(templatePath)) {
      console.log('Plantilla no encontrada en:', templatePath);
      throw new BadRequestException(`La plantilla en ${templatePath} no existe`);
    }
    console.log('Plantilla encontrada');

    return new Promise<StreamableFile>((resolve, reject) => {
      console.log('Iniciando renderizado de Carbone');
      carbone.render(
        templatePath,
        data,
        { convertTo: 'pdf' },
        (err, result) => {
          if (err) {
            console.log('Error en Carbone:', err);
            return reject(new BadRequestException(`Error al generar el reporte con Carbone: ${err.message}`));
          }

          console.log('Reporte generado, convirtiendo resultado');
          if (typeof result === 'string') {
            result = Buffer.from(result, 'utf-8');
          }

          console.log('Enviando StreamableFile');
          resolve(
            new StreamableFile(result, {
              type: 'application/pdf',
              disposition: `attachment; filename=recibo_pago_${idPlanillaAportes}.pdf`,
            }),
          );
        },
      );
    });
  } catch (error) {
    console.log('Error en generarReportePagoAporte:', error.message);
    throw new BadRequestException(`Error al generar el reporte de pago: ${error.message}`);
  }
}

// Nuevo método para listar todos los pagos con detalles de empresa y fecha_planilla
async findAllWithDetails() {
  try {
    const pagos = await this.pagoAporteRepository
      .createQueryBuilder('pago')
      .leftJoinAndSelect('pago.planilla', 'planilla')
      .leftJoinAndSelect('planilla.empresa', 'empresa') // Cargar la relación empresa
      .getMany();

    // Formatear los datos
    const pagosFormateados = pagos.map((pago) => ({
      id_planilla_aportes: pago.id_planilla_aportes,
      fecha_pago: pago.fecha_pago ? moment(pago.fecha_pago).format('DD/MM/YYYY') : 'N/A',
      monto_pagado: pago.monto_pagado || 0,
      metodo_pago: pago.metodo_pago || 'N/A',
      comprobante_pago: pago.comprobante_pago || 'N/A',
      foto_comprobante: pago.foto_comprobante || 'N/A',
      estado: pago.estado || 'N/A',
      estado_envio: pago.estado_envio || 0,
      usuario_creacion: pago.usuario_creacion || 'N/A',
      fecha_creacion: pago.fecha_creacion ? moment(pago.fecha_creacion).format('DD/MM/YYYY HH:mm:ss') : 'N/A',
      usuario_modificacion: pago.usuario_modificacion || 'N/A',
      fecha_modificacion: pago.fecha_modificacion
        ? moment(pago.fecha_modificacion).format('DD/MM/YYYY HH:mm:ss')
        : 'N/A',
      observaciones: pago.observaciones || 'Sin observaciones',
      empresa: pago.planilla?.empresa?.emp_nom || 'No disponible', // Mapear emp_nom como empresa
      fecha_planilla: pago.planilla?.fecha_planilla
        ? moment(pago.planilla.fecha_planilla).format('DD/MM/YYYY')
        : 'No disponible',
    }));

    return {
      mensaje: 'Pagos obtenidos con éxito',
      pagos: pagosFormateados,
    };
  } catch (error) {
    throw new BadRequestException(`Error al listar los pagos con detalles: ${error.message}`);
  }
}

}