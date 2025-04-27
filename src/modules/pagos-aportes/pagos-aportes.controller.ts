import { Controller, Post, Body, UploadedFile, UseInterceptors, BadRequestException, Get, Param, HttpException, HttpStatus, StreamableFile } from '@nestjs/common';
import { PagosAportesService } from './pagos-aportes.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiConsumes } from '@nestjs/swagger';

@ApiTags('Pagos-aportes')
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



}
