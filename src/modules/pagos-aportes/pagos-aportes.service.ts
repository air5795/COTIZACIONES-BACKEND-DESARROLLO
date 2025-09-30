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
  /* async createPago(pagoData: Partial<PagoAporte>, file?: Express.Multer.File): Promise<PagoAporte> {
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
        
        // CAMBIO IMPORTANTE: Obtener los datos de la preliquidación
        const datosLiquidacion = await this.planillasAportesService.calcularAportesPreliminar(
          idPlanilla, 
          fechaPago
        );

        // Actualizar TODOS los campos calculados en la planilla
        await this.planillasAportesService.actualizarPlanillaConLiquidacion(
          idPlanilla, 
          fechaPago, 
          datosLiquidacion
        );

        // Verificar si hubo excedente
        const montoPagado = Number(pagoData.monto_pagado || 0);
        const totalCancelar = Number(datosLiquidacion.total_a_cancelar || 0);

        if (montoPagado > totalCancelar) {
          const excedente = montoPagado - totalCancelar;
          const motivo = 'Pago superior al total calculado en liquidación';

          await this.planillasAportesService.actualizarExcedente(idPlanilla, excedente, motivo);
        }

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
  } */
  
// 1. MÉTODO CREATEPAGO ACTUALIZADO
async createPago(pagoData: Partial<PagoAporte>, file?: Express.Multer.File): Promise<PagoAporte> {
  const queryRunner = this.pagoAporteRepository.manager.connection.createQueryRunner();

  await queryRunner.startTransaction();
  try {
    let nuevoPago: PagoAporte;

    if (file) { 
      const filePath = join('comprobantes', file.filename); 
      pagoData.foto_comprobante = filePath; 
      console.log('Archivo guardado en:', filePath); 
    }

    // Actualizar la fecha_pago en planillas_aportes PRIMERO
    const idPlanilla = pagoData.id_planilla_aportes;
    if (idPlanilla) {
      const fechaPago = pagoData.fecha_pago ? new Date(pagoData.fecha_pago) : new Date();
      
      // Obtener los datos de la preliquidación
      const datosLiquidacion = await this.planillasAportesService.calcularAportesPreliminar(
        idPlanilla, 
        fechaPago
      );

      // ✅ ASIGNAR EL TOTAL A CANCELAR AL PAGO
      pagoData.total_a_cancelar = datosLiquidacion.total_a_cancelar;

      // Crear y guardar el nuevo pago CON el total_a_cancelar
      nuevoPago = this.pagoAporteRepository.create(pagoData);
      await queryRunner.manager.save(nuevoPago);

      // Actualizar TODOS los campos calculados en la planilla
      await this.planillasAportesService.actualizarPlanillaConLiquidacion(
        idPlanilla, 
        fechaPago, 
        datosLiquidacion
      );

      // LÓGICA ACTUALIZADA PARA MANEJAR DEMASÍA usando fecha_planilla
      const montoPagado = Number(pagoData.monto_pagado || 0);
      const totalCancelar = Number(datosLiquidacion.total_a_cancelar || 0);

      // Verificar si hay demasía del mes anterior usando el método actualizado
      const demasiaAnterior = await this.obtenerDemasiaMesAnterior(idPlanilla);
      
      // Calcular el total real a pagar (descontando demasía anterior)
      const totalConDescuento = Math.max(0, totalCancelar - demasiaAnterior);
      
      console.log('Cálculo de demasía actualizado:', {
        montoPagado,
        totalCancelar,
        totalCancelarGuardado: pagoData.total_a_cancelar,
        demasiaAnterior,
        totalConDescuento
      });

      // Si el monto pagado es mayor al total con descuento, generar nueva demasía
      if (montoPagado > totalConDescuento) {
        const nuevaDemasia = montoPagado - totalConDescuento;
        
        // Actualizar el pago con la nueva demasía
        nuevoPago.monto_demasia = nuevaDemasia;
        await queryRunner.manager.save(nuevoPago);
        
        console.log(`✅ Demasía generada: ${nuevaDemasia}`);
      }

    } else {
      throw new BadRequestException('El id_planilla_aportes es requerido.');
    }

    await queryRunner.commitTransaction();
    return nuevoPago;
  } catch (error) {
    await queryRunner.rollbackTransaction();
    if (file && file.filename) {
      const filePath = join(process.cwd(), 'comprobantes', file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    throw new BadRequestException('Error al crear el pago: ' + error.message);
  } finally {
    await queryRunner.release();
  }
}

// 2. NUEVO MÉTODO: Obtener demasía del mes anterior
async obtenerDemasiaMesAnterior(idPlanillaActual: number): Promise<number> {
  try {
    // Obtener datos de la planilla actual
    const planillaActual = await this.planillasAportesService.obtenerPlanilla(idPlanillaActual);
    if (!planillaActual?.planilla) {
      console.log('❌ No se encontró la planilla actual');
      return 0;
    }

    const codPatronal = planillaActual.planilla.cod_patronal;
    const fechaPlanilla = planillaActual.planilla.fecha_planilla;
    
    if (!fechaPlanilla) {
      console.log('❌ La planilla actual no tiene fecha_planilla');
      return 0;
    }

    console.log(`🔍 Buscando demasía para:
      - Planilla actual: ${idPlanillaActual}
      - Cod Patronal: ${codPatronal}
      - Fecha actual: ${fechaPlanilla}`);

    // Buscar la planilla del mes anterior usando fecha_planilla
    const planillaAnterior = await this.planillasAportesService.buscarPlanillaMesAnterior(
      codPatronal, 
      new Date(fechaPlanilla)
    );

    if (!planillaAnterior) {
      console.log('❌ No se encontró planilla del mes anterior');
      return 0;
    }

    console.log(`✅ Planilla anterior encontrada: ID ${planillaAnterior.id_planilla_aportes}`);

    // Buscar el pago de la planilla anterior
    const pagoAnterior = await this.pagoAporteRepository.findOne({
      where: { id_planilla_aportes: planillaAnterior.id_planilla_aportes },
      order: { fecha_creacion: 'DESC' }
    });

    if (!pagoAnterior) {
      console.log('❌ No se encontró pago para la planilla anterior');
      return 0;
    }

    const demasiaAnterior = pagoAnterior.monto_demasia || 0;
    console.log(`💰 Demasía encontrada: ${demasiaAnterior}`);

    return demasiaAnterior;
  } catch (error) {
    console.error('Error al obtener demasía del mes anterior:', error);
    return 0;
  }
}

  // LISTAR TODOS LOS PAGOS
  async findAll() {
    try {
      const pagos = await this.pagoAporteRepository.find();
      return pagos;
    } catch (error) {
      throw new BadRequestException('Error al listar los pagos: ' + error.message);
    }
  }
  // LISTAR PAGOS PARA VISTA DE EMPLEADOR (ESTADO_ENVIO = 0 , ESTADO_ENVIO = 1) 
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

  // LISTAR PAGOS PARA VISTA ADMINISTRADOR (ESTADO_ENVIO = 1)
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

  // IMPRIMIR RECIBO DE PAGO
  async generarReportePagoAporte(idPlanillaAportes: number): Promise<StreamableFile> {
    console.log('Iniciando generarReportePagoAporte con ID:', idPlanillaAportes);
    try {
      if (idPlanillaAportes < 1) {
        throw new BadRequestException('El ID de la planilla debe ser un número positivo');
      }
      const pago = await this.pagoAporteRepository.findOne({
        where: { id_planilla_aportes: idPlanillaAportes },
      });

      if (!pago) {
        throw new BadRequestException('Pago no encontrado');
      }
      console.log('Pago encontrado:', pago);
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
          monto_demasia: formatNumber(pago.monto_demasia),
          monto_demasia_literal: this.numeroALetrasSimple(pago.monto_demasia),
          observaciones: pago.observaciones || 'Sin observaciones',
          numero_recibo: pago.numero_recibo,
        },
        reporte: {
          fecha_generacion: moment().format('DD/MM/YYYY'),
          hora_generacion: moment().format('HH:mm:ss'),
          fecha_hora_generacion: moment().format('DD/MM/YYYY HH:mm:ss'),
        },
      };
      console.log('Datos para el reporte:', data);

      // Ruta de la plantilla de Carbone
      /* const templatePath = path.resolve('src/modules/pagos-aportes/templates/recibo.docx'); */
      const templatePath = path.resolve('reports/recibo.docx');
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
        .leftJoinAndSelect('planilla.empresa', 'empresa')
        .getMany();


      const pagosFormateados = pagos.map((pago) => ({
        id_planilla_aportes: pago.id_planilla_aportes,
        id: pago.id,
        numero_recibo: pago.numero_recibo,
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
        fecha_modificacion: pago.fecha_modificacion? moment(pago.fecha_modificacion).format('DD/MM/YYYY HH:mm:ss'): 'N/A',
        observaciones: pago.observaciones || 'Sin observaciones',
        empresa: pago.planilla?.empresa?.emp_nom || 'No disponible',
        fecha_planilla: pago.planilla?.fecha_planilla? moment(pago.planilla.fecha_planilla).format('DD/MM/YYYY'): 'No disponible',
        monto_demasia: pago.monto_demasia || 0,
        com_nro: pago.planilla?.com_nro || 'No disponible',
      }));

      return {
        mensaje: 'Pagos obtenidos con éxito',
        pagos: pagosFormateados,
      };
    } catch (error) {
      throw new BadRequestException(`Error al listar los pagos con detalles: ${error.message}`);
    }
  }

  // Función helper para formatear números a 2 decimales
  private formatNumber(value: number | string | null | undefined): number {
    if (value === null || value === undefined) return 0;
    
    // Convertir a número si es string
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    
    // Verificar si es un número válido
    if (isNaN(numValue)) return 0;
    
    // Redondear a 2 decimales y devolver como número
    return Math.round(numValue * 100) / 100;
  }

  // Nuevo método para buscar pagos por com_nro con detalles (servicio para sistema de ingresos Isra)
  async findByComNroWithDetails(com_nro: number) {
    try {
      const pagos = await this.pagoAporteRepository
        .createQueryBuilder('pago')
        .leftJoinAndSelect('pago.planilla', 'planilla')
        .leftJoinAndSelect('planilla.empresa', 'empresa')
        .where('planilla.com_nro = :com_nro', { com_nro })
        .getMany();

      if (pagos.length === 0) {
        return {
          mensaje: `No se encontraron pagos para el com_nro: ${com_nro}`,
          pagos: [],
        };
      }

      const pagosFormateados = pagos.map((pago) => ({
        ID_PLANILLA_APORTES: pago.id_planilla_aportes,
        EMPRESA: pago.planilla?.empresa?.emp_nom || 'No disponible',
        TIPO_EMPRESA: pago.planilla?.empresa?.tipo || 'No disponible',
        COD_PATRONAL: pago.planilla?.cod_patronal || 'No disponible',
        COM_NRO: pago.planilla?.com_nro || 'No disponible',
        FECHA_PAGO: pago.fecha_pago ? moment(pago.fecha_pago).format('DD/MM/YYYY') : 'N/A',
        /* MONTO_DESEMBOLSADO: this.formatNumber(pago.monto_pagado), */
        MONTO_PAGADO: this.formatNumber(pago.total_a_cancelar) || 'NULL',
        METODO_PAGO: pago.metodo_pago || 'N/A',
        COMPROBANTE_PAGO: pago.comprobante_pago || 'N/A',
        USUARIO_CREACION: pago.usuario_creacion || 'N/A',
        FECHA_CREACION: pago.fecha_creacion ? moment(pago.fecha_creacion).format('DD/MM/YYYY HH:mm:ss') : 'N/A',
        OBSERVACIONES: pago.observaciones || 'Sin observaciones',   
        FECHA_PLANILLA: pago.planilla?.fecha_planilla? moment(pago.planilla.fecha_planilla).format('DD/MM/YYYY'): 'No disponible',
        MONTO_DEMASIA: this.formatNumber(pago.monto_demasia),
        MES: pago.planilla?.mes || 'No disponible',
        GESTION: pago.planilla?.gestion || 'No disponible',
        TIPO_PLANILLA: pago.planilla?.tipo_planilla || 'No disponible',
        TOTAL_IMPORTE_PLANILLA: this.formatNumber(pago.planilla?.total_importe), 
        TOTAL_TRABAJ_PLANILLA: pago.planilla?.total_trabaj || 0,
        TOTAL_MULTAS: this.formatNumber(pago.planilla?.total_multas) || 'PLANILLA SIN MULTA',
        
      }));

      return {
        mensaje: `Pagos encontrados para com_nro: ${com_nro}`,
        total_registros: pagos.length,
        pagos: pagosFormateados,
      };
    } catch (error) {
      throw new BadRequestException(`Error al buscar pagos por com_nro: ${error.message}`);
    }
  }

  // ACTUALIZAR OBSERVACIONES DE UN PAGO
  async updateObservaciones(id: number, observaciones: string, usuario_modificacion?: string) {
    try {
      // Verificar que el pago existe
      const pagoExistente = await this.pagoAporteRepository.findOne({ where: { id } });
      if (!pagoExistente) {
        throw new BadRequestException(`No se encontró el pago con ID: ${id}`);
      }

      // Actualizar solo las observaciones y campos de auditoría
      const resultado = await this.pagoAporteRepository.update(id, {
        observaciones,
        usuario_modificacion: usuario_modificacion || 'SYSTEM',
        fecha_modificacion: new Date(),
      });

      if (resultado.affected === 0) {
        throw new BadRequestException(`No se pudo actualizar el pago con ID: ${id}`);
      }

      // Retornar el pago actualizado
      const pagoActualizado = await this.pagoAporteRepository.findOne({ where: { id } });
      
      return {
        success: true,
        message: 'Observaciones actualizadas correctamente',
        data: pagoActualizado
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Error al actualizar las observaciones del pago: ${error.message}`);
    }
  }

}