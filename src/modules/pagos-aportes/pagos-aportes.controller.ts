import { Controller, Post, Body, UploadedFile, UseInterceptors, BadRequestException, Get, Param, HttpException, HttpStatus, StreamableFile, Patch } from '@nestjs/common';
import { PagosAportesService } from './pagos-aportes.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiConsumes, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Pagos-aportes')
@ApiBearerAuth('JWT-auth')    
@Controller('pagos-aportes')
export class PagosAportesController {
  constructor(private readonly pagosAportesService: PagosAportesService) {}

  // 1.- CREAR EN BASE DE DATOS EL PAGO Y TAMBIEN LA IMAGEN DEL COMPROBANTE ------------------------------------------
  @Post('create')
  @UseInterceptors(FileInterceptor('foto_comprobante'))
  async createPago(
    @Body() pagoData: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      console.error('No se recibió ningún archivo');
      throw new BadRequestException('No se subió ningún archivo');
    }
    console.log('Archivo procesado:', file.filename);
    return await this.pagosAportesService.createPago(pagoData, file);
  }

  // 2.- LISTAR TODOS LOS PAGOS
  @Get()
  async findAll() {
    return await this.pagosAportesService.findAll();
  }

  // 3.- LISTAR PAGOS PARA VISTA DE EMPLEADOR (ESTADO_ENVIO = 0 , ESTADO_ENVIO = 1)
  @Get('by-id/:id')
  async findByIdPlanilla(@Param('id') id: number) {
    return await this.pagosAportesService.findByIdPlanilla(id);
  }

  // 4.- LISTAR PAGOS PARA VISTA ADMINISTRADOR (ESTADO_ENVIO = 1)
  @Get('by-idAdmin/:id')
  async findByIdPlanillAdmin(@Param('id') id: number) {
    return await this.pagosAportesService.findByIdPlanillAdmin(id);
  }

  //5.-
  @Get('reporte-pago/:id_planilla')
  @ApiOperation({ summary: 'Generar reporte PDF de un pago específico' })
  @ApiParam({ name: 'id_planilla', description: 'ID de la planilla', type: Number })
  @ApiResponse({ status: 200, description: 'Reporte PDF generado exitosamente', type: StreamableFile })
  @ApiResponse({ status: 400, description: 'ID inválido o error al generar el reporte' })
  async generarReportePagoAporte(@Param('id_planilla') id_planilla: string): Promise<StreamableFile> {
    console.log('Valor crudo recibido en id_planilla:', id_planilla);
    console.log('Tipo de id_planilla:', typeof id_planilla);

    // Convertir manualmente para depuración
    const parsedId = parseInt(id_planilla, 10);
    console.log('ID parseado:', parsedId, 'Es NaN:', isNaN(parsedId));

    if (isNaN(parsedId) || parsedId < 1) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: `El ID de la planilla debe ser un número positivo, recibido: ${id_planilla}`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      return await this.pagosAportesService.generarReportePagoAporte(parsedId);
    } catch (error) {
      throw new HttpException(
        {
          status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
          error: error.message || 'Error al generar el reporte de pago',
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // 6.- 

  @Get('lista-pagos')
  @ApiOperation({ summary: 'Listar todos los pagos con detalles de empresa y fecha de planilla' })
  @ApiResponse({ status: 200, description: 'Pagos obtenidos con éxito' })
  @ApiResponse({ status: 400, description: 'Error al listar los pagos con detalles' })
  async findAllWithDetails() {
    try {
      return await this.pagosAportesService.findAllWithDetails();
    } catch (error) {
      throw new HttpException(
        {
          status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
          error: error.message || 'Error al listar los pagos con detalles',
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Nuevo endpoint para buscar pagos por com_nro con detalles
  @Get('by-com-nro/:com_nro')
  @ApiOperation({ summary: 'Buscar pagos por com_nro con todos los detalles de planilla y empresa' })
  @ApiParam({ name: 'com_nro', description: 'Número de comprobante (com_nro)', type: Number })
  @ApiResponse({ 
    status: 200, 
    description: 'Pagos encontrados exitosamente',
    schema: {
      type: 'object',
      properties: {
        mensaje: { type: 'string' },
        total_registros: { type: 'number' },
        pagos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              id_planilla_aportes: { type: 'number' },
              numero_recibo: { type: 'number' },
              fecha_pago: { type: 'string' },
              monto_pagado: { type: 'number' },
              metodo_pago: { type: 'string' },
              comprobante_pago: { type: 'string' },
              foto_comprobante: { type: 'string' },
              estado: { type: 'number' },
              estado_envio: { type: 'number' },
              observaciones: { type: 'string' },
              empresa: { type: 'string' },
              fecha_planilla: { type: 'string' },
              monto_demasia: { type: 'number' },
              com_nro: { type: 'number' },
              cod_patronal: { type: 'string' },
              mes: { type: 'string' },
              gestion: { type: 'string' },
              tipo_planilla: { type: 'string' },
              total_importe: { type: 'number' },
              total_trabaj: { type: 'number' }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Error al buscar pagos por com_nro' })
  @ApiResponse({ status: 404, description: 'No se encontraron pagos para el com_nro especificado' })
  async findByComNroWithDetails(@Param('com_nro') com_nro: number) {
    try {
      const parsedComNro = parseInt(com_nro.toString(), 10);
      
      if (isNaN(parsedComNro) || parsedComNro < 1) {
        throw new BadRequestException(`El com_nro debe ser un número positivo, recibido: ${com_nro}`);
      }

      return await this.pagosAportesService.findByComNroWithDetails(parsedComNro);
    } catch (error) {
      throw new HttpException(
        {
          status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
          error: error.message || 'Error al buscar pagos por com_nro',
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }







  // NUEVO ENDPOINT: Obtener demasía del mes anterior
@Get('demasia-mes-anterior/:id_planilla')
@ApiOperation({ summary: 'Obtener demasía del mes anterior para una planilla' })
@ApiParam({ name: 'id_planilla', description: 'ID de la planilla actual', type: Number })
@ApiResponse({ status: 200, description: 'Demasía obtenida exitosamente', type: Number })
@ApiResponse({ status: 400, description: 'Error al obtener la demasía' })
async obtenerDemasiaMesAnterior(@Param('id_planilla') id_planilla: number): Promise<number> {
  try {
    return await this.pagosAportesService.obtenerDemasiaMesAnterior(id_planilla);
  } catch (error) {
    throw new BadRequestException(`Error al obtener demasía del mes anterior: ${error.message}`);
  }
}

  // ACTUALIZAR OBSERVACIONES DE UN PAGO
  @Patch('update-observaciones/:id')
  @ApiOperation({ summary: 'Actualizar las observaciones de un pago específico' })
  @ApiParam({ name: 'id', description: 'ID del pago a actualizar', type: Number })
  @ApiBody({ 
    schema: { 
      type: 'object', 
      properties: { 
        observaciones: { type: 'string', description: 'Nuevas observaciones para el pago' },
        usuario_modificacion: { type: 'string', description: 'Usuario que realiza la modificación (opcional)' }
      },
      required: ['observaciones']
    } 
  })
  @ApiResponse({ status: 200, description: 'Observaciones actualizadas exitosamente' })
  @ApiResponse({ status: 400, description: 'Error al actualizar las observaciones' })
  async updateObservaciones(
    @Param('id') id: number,
    @Body() body: { observaciones: string; usuario_modificacion?: string }
  ) {
    try {
      return await this.pagosAportesService.updateObservaciones(
        id, 
        body.observaciones, 
        body.usuario_modificacion
      );
    } catch (error) {
      throw new BadRequestException(`Error al actualizar las observaciones: ${error.message}`);
    }
  }

}
