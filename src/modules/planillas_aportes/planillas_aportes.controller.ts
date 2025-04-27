import { Controller, Post, Get,StreamableFile, UseInterceptors, UploadedFile, BadRequestException, Body, Param, Put, HttpException, HttpStatus, Res, Delete, Query, ParseIntPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { PlanillasAportesService } from './planillas_aportes.service';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { query, Response } from 'express';
import { CreatePlanillasAporteDto } from './dto/create-planillas_aporte.dto';
import * as fs from 'fs';
import * as path from 'path';


@ApiTags('Planillas Aportes')
@Controller('planillas_aportes')
export class PlanillasAportesController {
  constructor(
    private readonly planillasAportesService: PlanillasAportesService,
  ) {}

  // 1.-  Endpoint para subir un archivo Excel con la planilla de aportes ----------------------------------------------
  @Post('subir')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          cb(null, `${Date.now()}-${file.originalname}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(xlsx|xls|csv)$/)) {
          return cb(
            new BadRequestException('Solo se permiten archivos Excel y CSV'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )

  // 2.-  Endpoint para subir un archivo Excel con la planilla de aportes---------------------------------------------------
  @ApiOperation({ summary: 'Subir un archivo Excel con la planilla de aportes' })
  @ApiResponse({ status: 201, description: 'Planilla guardada con éxito' })
  @ApiResponse({ status: 400, description: 'Error al procesar el archivo o datos inválidos' })
  @ApiBody({ type: CreatePlanillasAporteDto })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() createPlanillaDto: CreatePlanillasAporteDto,
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');

    const data = this.planillasAportesService.procesarExcel(file.path);
    return this.planillasAportesService.guardarPlanilla(
      data,
      createPlanillaDto,
    );
  }

  // 3.- Endpoint para actualizar los detalles de una planilla de aportes-----------------------------------------------------

  @Put('detalles/:id_planilla')
  @ApiOperation({ summary: 'Actualizar los detalles de una planilla de aportes' })
  @ApiResponse({ status: 200, description: 'Detalles actualizados con éxito' })
  @ApiResponse({ status: 400, description: 'Error al actualizar los detalles' })
  async actualizarDetallesPlanilla(
    @Param('id_planilla') id_planilla: number,
    @Body() body,
  ) {
    try {
      return await this.planillasAportesService.actualizarDetallesPlanilla(
        id_planilla,
        body.trabajadores,
      );
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // 4.- OBTENER HISTORIAL DE TABLA PLANILLAS DE APORTES ------------------------------------------------------

  @Get('historial/:cod_patronal')
  @ApiOperation({ summary: 'Obtener el historial de planillas de aportes por código patronal' })
  @ApiParam({ name: 'cod_patronal', description: 'Código patronal de la empresa', type: String })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', type: Number })
  @ApiQuery({ name: 'limite', required: false, description: 'Límite de registros por página', type: Number })
  @ApiQuery({ name: 'busqueda', required: false, description: 'Término de búsqueda', type: String })
  @ApiQuery({ name: 'mes', required: false, description: 'Mes de la planilla (1-12)', type: String })
  @ApiQuery({ name: 'anio', required: false, description: 'Año de la planilla', type: String })
  @ApiResponse({ status: 200, description: 'Historial obtenido con éxito' })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos' })
  @ApiResponse({ status: 500, description: 'Error al obtener el historial' })
  async obtenerHistorial(
    @Param('cod_patronal') cod_patronal: string,
    @Query('pagina') pagina: number = 1,
    @Query('limite') limite: number = 10,
    @Query('busqueda') busqueda: string = '',
    @Query('mes') mes?: string,
    @Query('anio') anio?: string,
  ) {
    try {
      return await this.planillasAportesService.obtenerHistorial(
        cod_patronal,
        pagina,
        limite,
        busqueda,
        mes,
        anio,
      );
    } catch (error) {
      throw new HttpException(
        {
          status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
          error: error.message || 'Error al obtener el historial de planillas',
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

    // 4.1 - OBTENER HISTORIAL DE TABLA PLANILLAS DE APORTES ADMINISTRADOR ------------------------------------------------------

    @Get('historialAdmin')
    @ApiOperation({ summary: 'Obtener el historial de planillas de aportes para administradores' })
    @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', type: Number })
    @ApiQuery({ name: 'limite', required: false, description: 'Límite de registros por página', type: Number })
    @ApiQuery({ name: 'busqueda', required: false, description: 'Término de búsqueda', type: String })
    @ApiQuery({ name: 'mes', required: false, description: 'Mes de la planilla (1-12)', type: String })
    @ApiQuery({ name: 'anio', required: false, description: 'Año de la planilla', type: String })
    @ApiQuery({ name: 'estado', required: false, description: 'Estado de la planilla (0 = borrador, 1 = presentando, 2 = aprobado)', type: Number })
    @ApiResponse({ status: 200, description: 'Historial obtenido con éxito' })
    @ApiResponse({ status: 400, description: 'Parámetros inválidos' })
    @ApiResponse({ status: 500, description: 'Error al obtener el historial' })
    async obtenerHistorialAdmin(
      @Query('pagina') pagina: number = 1,
      @Query('limite') limite: number = 10,
      @Query('busqueda') busqueda: string = '',
      @Query('mes') mes?: string,
      @Query('anio') anio?: string,
      @Query('estado') estado?: string,
    ) {
      try {
        const estadoNumber = estado !== undefined ? Number(estado) : undefined; 
        return await this.planillasAportesService.obtenerHistorialAdmin(
          pagina,
          limite,
          busqueda,
          mes,
          anio,
          estadoNumber,
        );
      } catch (error) {
        throw new HttpException(
          {
            status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
            error: error.message || 'Error al obtener el historial de planillas',
          },
          error.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }

  // 5.- OBTENER HISTORIAL DE TABLA PLANILLAS DE APORTES CUANDO ESTADO = 1 (presentadas) --------------------------------------------------------------

  @Get('historial')
  @ApiOperation({ summary: 'Obtener el historial de planillas de aportes presentadas (estado = 1)' })
  @ApiQuery({ name: 'mes', required: false, description: 'Mes de la planilla (1-12)', type: Number })
  @ApiQuery({ name: 'gestion', required: false, description: 'Año de la planilla', type: Number })
  @ApiResponse({ status: 200, description: 'Historial obtenido con éxito' })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos' })
  @ApiResponse({ status: 500, description: 'Error al obtener el historial' })
  async obtenerTodoHistorial(
    @Query('mes') mes?: number,
    @Query('gestion') gestion?: number,
  ) {
    try {
      return await this.planillasAportesService.obtenerTodoHistorial(mes, gestion);
    } catch (error) {
      throw new HttpException(
        {
          status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
          error: error.message || 'Error al obtener el historial de planillas',
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // 6.- OBTENER HISTORIAL PLANILLA DE APORTES-------------------------------------------

  @Get('historial-completo')
  @ApiOperation({ summary: 'Obtener el historial completo de planillas de aportes (sin filtro de estado)' })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', type: Number })
  @ApiQuery({ name: 'limite', required: false, description: 'Límite de registros por página', type: Number })
  @ApiQuery({ name: 'busqueda', required: false, description: 'Término de búsqueda', type: String })
  @ApiResponse({ status: 200, description: 'Historial obtenido con éxito' })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos' })
  @ApiResponse({ status: 500, description: 'Error al obtener el historial' })
  async obtenerTodo(
    @Query('pagina') pagina: number = 1,
    @Query('limite') limite: number = 10,
    @Query('busqueda') busqueda: string = '',
  ) {
    try {
      return await this.planillasAportesService.obtenerTodo(
        pagina,
        limite,
        busqueda,
      );
    } catch (error) {
      throw new HttpException(
        {
          status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
          error: error.message || 'Error al obtener el historial de planillas completo',
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // 7 .- OBTENER PLANILLA DE APORTES (ASINCRONO SIN PAGINACION) -----------------------------------------------------
  @Get(':id_planilla')
  @ApiOperation({ summary: 'Obtener una planilla de aportes por su ID' })
  @ApiParam({ name: 'id_planilla', description: 'ID de la planilla', type: Number })
  @ApiResponse({ status: 200, description: 'Planilla obtenida con éxito' })
  @ApiResponse({ status: 400, description: 'La planilla no existe o parámetros inválidos' })
  @ApiResponse({ status: 500, description: 'Error al obtener la planilla' })
  async obtenerPlanilla(@Param('id_planilla') id_planilla: number) {
    try {
      return await this.planillasAportesService.obtenerPlanilla(id_planilla);
    } catch (error) {
      throw new HttpException(
        {
          status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
          error: error.message || 'Error al obtener la planilla',
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // 8.- OBTENER DETALLES DE PLANILLA DE APORTES POR ID DE PLANILLA (TIENE PAGINACION Y BUSQUEDA)-------------

  @Get('detalles/:id_planilla')
  @ApiQuery({
    name: 'busqueda',
    required: false,
    type: String,
    description: 'Término de búsqueda (opcional)',
  })
  async obtenerDetalles(
    @Param('id_planilla') id_planilla: number,
    @Query('pagina') pagina: number = 1,
    @Query('limite') limite: number = 10,
    @Query('busqueda') busqueda: string = '',
  ) {
    try {
      return await this.planillasAportesService.obtenerDetalles(
        id_planilla,
        pagina,
        limite,
        busqueda,
      );
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Error al obtener los detalles de la planilla',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

// 9.- OBSERVAR DETALLES DE PLANILLA DE APORTES POR REGIONAL -------------------------------------------------------------------------------------------------------
  @Get('detalles/:id_planilla/:regional')
  async obtenerDetallesPorRegional(
    @Param('id_planilla') id_planilla: number,
    @Param('regional') regional: string,
  ) {
    return this.planillasAportesService.obtenerDetallesPorRegional(
      id_planilla,
      regional,
    );
  }

  // 10.- OBTENER PLANILLAS PENDIENTES O PRESENTADAS ESTADO = 1 -----------------------------------------------------
  @Get('pendientes')
  async obtenerPlanillasPendientes() {
    return this.planillasAportesService.obtenerPlanillasPendientes();
  }

  // 11 .- ACTUALIZAR EL ESTADO DE UNA PLANILLA A PRESENTADO O PENDIENTE = 1 -------------------------------------
  @Put('estado/pendiente/:id_planilla')
  @ApiOperation({ summary: 'Presentar una planilla (cambiar a estado Pendiente)' })
  @ApiParam({ name: 'id_planilla', description: 'ID de la planilla', type: Number })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fecha_declarada: { type: 'string', description: 'Fecha de declaración (opcional)', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Planilla presentada con éxito' })
  @ApiResponse({ status: 400, description: 'Error al presentar planilla' })
  async actualizarEstadoAPendiente(
    @Param('id_planilla') id_planilla: number,
    @Body('fecha_declarada') fecha_declarada?: string,
  ) {
    return await this.planillasAportesService.actualizarEstadoAPendiente(id_planilla, fecha_declarada);
  }

  // 12 .- ACTUALIZAR METODO PARA APROBAR U OBSERVAR LA PLANILLA (ESTADO 2 o 3) -------------------------------------
  @Put('estado/:id_planilla')
  async actualizarEstadoPlanilla(
    @Param('id_planilla') id_planilla: number,
    @Body() body,
  ) {
    return this.planillasAportesService.actualizarEstadoPlanilla(
      id_planilla,
      body.estado,
      body.observaciones,
    );
  }

  // 13.-  ELIMINAR DETALLES DE UNA PLANILLA DE APORTES -----------------------------------------------------
  @Delete('detalles/:id_planilla')
  async eliminarDetallesPlanilla(@Param('id_planilla') id_planilla: number) {
    try {
      return await this.planillasAportesService.eliminarDetallesPlanilla(
        id_planilla,
      );
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // 14 .- OBTENER PLANILLAS DE APORTES OBSERVADAS (ESTADO = 3) -----------------------------------------------------
  @Get('observadas/:cod_patronal')
  @ApiOperation({ summary: 'Obtener planillas observadas (estado = 3) por código patronal' })
  @ApiParam({ name: 'cod_patronal', description: 'Código patronal de la empresa', type: String })
  @ApiResponse({ status: 200, description: 'Planillas observadas obtenidas con éxito' })
  @ApiResponse({ status: 400, description: 'Código patronal inválido o error al obtener las planillas' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async obtenerPlanillasObservadas(
    @Param('cod_patronal') cod_patronal: string,
  ) {
    try {
      return await this.planillasAportesService.obtenerPlanillasObservadas(cod_patronal);
    } catch (error) {
      throw new HttpException(
        {
          status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
          error: error.message || 'Error al obtener las planillas observadas',
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // 15 .- MANDAR CORREGIDA PLANILLA DE APORTES OBSERVADA A ADMINSTRADOR CBES CUANDO (ESTADO = 3)- ---------------------
  @Put('corregir/:id_planilla')
  async corregirPlanilla(
    @Param('id_planilla') id_planilla: number,
    @Body() body,
  ) {
    return this.planillasAportesService.corregirPlanilla(id_planilla, body);
  }

  // Nuevo endpoint para hacer la comparacion para obtener altas y bajas

  @Get('comparar/:cod_patronal/:gestion/:mesAnterior/:mesActual')
  async compararPlanillas(
    @Param('cod_patronal') cod_patronal: string,
    @Param('gestion') gestion: string,
    @Param('mesAnterior') mesAnterior: string,
    @Param('mesActual') mesActual: string,
  ) {
    return await this.planillasAportesService.compararPlanillas(
      cod_patronal,
      mesAnterior,
      gestion,
      mesActual,
    );
  }

  // Nuevo endpoint para generar el reporte de bajas
  @Get('reporte-bajas/:id_planilla/:cod_patronal')
  async generarReporteBajas(
    @Param('id_planilla') id_planilla: number,
    @Param('cod_patronal') cod_patronal: string,
  ): Promise<StreamableFile> {
    try {
      // Llamar al servicio para generar el reporte de bajas
      const fileBuffer = await this.planillasAportesService.generarReporteBajas(
        id_planilla,
        cod_patronal,
      );

      // Verificar que el reporte se haya generado correctamente
      if (!fileBuffer) {
        throw new Error('No se pudo generar el reporte.');
      }

      return fileBuffer;
    } catch (error) {
      throw new BadRequestException({
        message: 'Error al generar el reporte de bajas',
        details: error.message,
      });
    }
  }

  // Nuevo endpoint para generar el reporte en PDF usando Carbone
  @Get('reporte-planilla/:id_planilla')
  async generarReportePlanilla(
    @Param('id_planilla') id_planilla: number,
  ): Promise<StreamableFile> {
    try {
      // Llamamos al servicio que genera el PDF con los datos formateados
      const fileBuffer =
        await this.planillasAportesService.generarReportePlanillaPorRegional(
          id_planilla,
        );

      // Verificamos si se generó correctamente
      if (!fileBuffer) {
        throw new Error('No se pudo generar el reporte.');
      }

      // Retornamos el PDF como StreamableFile
      return fileBuffer;
    } catch (error) {
      throw new BadRequestException({
        message: 'Error al generar el reporte de planilla por regional',
        details: error.message,
      });
    }
  }

  // 20.-  Nuevo endpoint para obtener los datos de la planilla por regional

  @Get('datos-planilla/:id_planilla')
  async obtenerDatosPlanilla(
    @Param('id_planilla') id_planilla: number,
  ): Promise<any> {
    try {
      const datos =
        await this.planillasAportesService.obtenerDatosPlanillaPorRegional(
          id_planilla,
        );

      if (!datos) {
        throw new Error('No se pudieron obtener los datos de la planilla.');
      }

      return {
        success: true,
        data: datos,
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        message: 'Error al obtener los datos de la planilla por regional',
        details: error.message,
      });
    }
  }

  // 22.-  Función para consultar la API del Banco Central y obtener el UFV de una fecha específica ---------------------
  @Get('ufv/:fecha')
  async getUfvForDate(@Param('fecha') fecha: string) {
    // Validar y convertir la fecha
    const date = new Date(fecha);
    if (isNaN(date.getTime())) {
      throw new BadRequestException('Fecha inválida. Use el formato YYYY-MM-DD (e.g., 2025-01-09)');
    }

    const ufv = await this.planillasAportesService.getUfvForDate(date);
    return {
      fecha: fecha,
      ufv: ufv,
      mensaje: '✅ UFV consultado con éxito',
    };
  }

 // 23 .-  Función para calcular los aportes mensuales
 @Post('calcular/:id')
 @ApiOperation({ summary: 'Calcular y actualizar los aportes de una planilla' })
 @ApiParam({
   name: 'id',
   required: true,
   description: 'ID de la planilla de aportes',
   type: String,
 })
 @ApiResponse({ 
   status: 200, 
   description: 'Cálculo de aportes realizado con éxito',
   schema: {
     type: 'object',
     properties: {
       mensaje: { type: 'string' },
       planilla: {
         type: 'object',
         properties: {
           id_planilla_aportes: { type: 'number' },
           total_importe: { type: 'number' },
           aporte_porcentaje: { type: 'number' },
           ufv_dia_formal: { type: 'number' },
           ufv_dia_presentacion: { type: 'number' },
           fecha_declarada: { type: 'string', format: 'date-time' },
           fecha_pago: { type: 'string', format: 'date-time' },
           aporte_actualizado: { type: 'number' },
           monto_actualizado: { type: 'number' },
           multa_no_presentacion: { type: 'number' },
           dias_retraso: { type: 'number' },
           intereses: { type: 'number' },
           multa_sobre_intereses: { type: 'number' },
           total_a_cancelar_parcial: { type: 'number' },
           total_multas: { type: 'number' },
           total_tasa_interes: { type: 'number' },
           total_aportes_asuss: { type: 'number' },
           total_aportes_min_salud: { type: 'number' },
           total_a_cancelar: { type: 'number' },
         },
       },
     },
   },
 })
 @ApiResponse({ status: 400, description: 'Solicitud inválida' })
 async calcularAportes(@Param('id') id: string): Promise<any> {
   try {
     const planillaId = parseInt(id);
     if (isNaN(planillaId) || planillaId < 1) {
       throw new BadRequestException('El ID de la planilla debe ser un número positivo');
     }

     const planilla = await this.planillasAportesService.calcularAportes(planillaId);
     return {
       mensaje: '✅ Cálculo de aportes realizado con éxito',
       planilla,
     };
   } catch (error) {
     throw new HttpException(
       {
         status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
         error: error.message || 'Error al calcular los aportes',
       },
       error.status || HttpStatus.INTERNAL_SERVER_ERROR,
     );
   }
 }

 // calculo preliminar 

 @Post('calcular-preliminar')
 @ApiOperation({ summary: 'Calcular el total a cancelar preliminar para una planilla' })
 @ApiQuery({
   name: 'id',
   required: true,
   description: 'ID de la planilla de aportes',
   type: String,
 })
 @ApiBody({
   description: 'Cuerpo de la solicitud con la fecha de pago',
   schema: {
     type: 'object',
     properties: {
       fecha_pago: {
         type: 'string',
         format: 'date-time',
         description: 'Fecha de pago propuesta en formato ISO (ejemplo: 2024-12-25T17:03:00.000Z)',
         example: '2024-12-25T17:03:00.000Z',
       },
     },
     required: ['fecha_pago'],
   },
 })
 @ApiResponse({ 
   status: 200, 
   description: 'Total a cancelar calculado',
   schema: {
     type: 'object',
     properties: {
       total_importe: { type: 'number' },
       aporte_porcentaje: { type: 'number' },
       ufv_dia_formal: { type: 'number' },
       ufv_dia_presentacion: { type: 'number' },
       fecha_declarada: { type: 'string', format: 'date-time' },
       fecha_pago: { type: 'string', format: 'date-time' },
       aporte_actualizado: { type: 'number' },
       monto_actualizado: { type: 'number' },
       multa_no_presentacion: { type: 'number' },
       dias_retraso: { type: 'number' },
       intereses: { type: 'number' },
       multa_sobre_intereses: { type: 'number' },
       total_a_cancelar_parcial: { type: 'number' },
       total_multas: { type: 'number' },
       total_tasa_interes: { type: 'number' },
       total_aportes_asuss: { type: 'number' },
       total_aportes_min_salud: { type: 'number' },
       total_a_cancelar: { type: 'number' },
     },
   },
 })
 @ApiResponse({ status: 400, description: 'Solicitud inválida' })
 async calcularAportesPreliminar(
   @Query('id') id: string,
   @Body('fecha_pago') fechaPago: string,
 ): Promise<any> {
   try {
     // Validar el ID
     const idPlanilla = parseInt(id);
     if (isNaN(idPlanilla) || idPlanilla < 1) {
       throw new BadRequestException('El ID de la planilla debe ser un número positivo');
     }

     // Validar que fecha_pago no sea undefined o vacío
     if (!fechaPago) {
       throw new BadRequestException('El campo fecha_pago es obligatorio');
     }

     const fechaPagoDate = new Date(fechaPago);
     if (isNaN(fechaPagoDate.getTime())) {
       throw new BadRequestException(`Fecha de pago inválida: ${fechaPago}`);
     }

     return await this.planillasAportesService.calcularAportesPreliminar(idPlanilla, fechaPagoDate);
   } catch (error) {
     throw new HttpException(
       {
         status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
         error: error.message || 'Error al calcular los aportes preliminares',
       },
       error.status || HttpStatus.INTERNAL_SERVER_ERROR,
     );
   }
 }

 // 25.-  reporte

 @Get('reporte-aportes/:id_planilla')
 @ApiOperation({ summary: 'Generar reporte de aportes en PDF DS-08 para una planilla específica' })
 @ApiParam({ name: 'id_planilla', description: 'ID de la planilla', type: Number })
 @ApiResponse({ status: 200, description: 'Reporte generado con éxito', type: StreamableFile })
 @ApiResponse({ status: 400, description: 'ID de planilla inválido o error al generar el reporte' })
 @ApiResponse({ status: 500, description: 'Error interno del servidor' })
 async generarReporteAportes(
   @Param('id_planilla') id_planilla: number,
 ): Promise<StreamableFile> {
   try {
     return await this.planillasAportesService.generarReporteAportes(id_planilla);
   } catch (error) {
     throw new HttpException(
       {
         status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
         error: error.message || 'Error al generar el reporte de aportes',
       },
       error.status || HttpStatus.INTERNAL_SERVER_ERROR,
     );
   }
 }

 // 26 .- REPORTE DE DECLRACION DE APORTE Y MUESTRA REGIONALES 

 @Get('reporte-planilla-regional/:id_planilla')
@ApiOperation({ summary: 'Generar reporte PDF de planilla por regional' })
@ApiResponse({ status: 200, description: 'Reporte PDF generado exitosamente', type: StreamableFile })
@ApiResponse({ status: 400, description: 'Error al generar el reporte' })
async generarReportePlanillaPorRegional(
  @Param('id_planilla') id_planilla: number,
): Promise<StreamableFile> {
  try {
    // Llamamos al servicio que genera el PDF con los datos por regional
    const fileBuffer = await this.planillasAportesService.generarReportePlanillaPorRegional(
      id_planilla,
    );

    // Verificamos si se generó correctamente
    if (!fileBuffer) {
      throw new Error('No se pudo generar el reporte por regional.');
    }

    // Retornamos el PDF como StreamableFile
    return fileBuffer;
  } catch (error) {
    throw new BadRequestException({
      message: 'Error al generar el reporte de planilla por regional',
      details: error.message,
    });
  }
}

// 27 .- REPORTE

@Get('reporte-aportes-mes/:mes?/:gestion?')
@ApiOperation({ summary: 'Generar reporte PDF del historial de planillas presentadas' })
@ApiParam({ name: 'mes', description: 'Mes de las planillas (1-12, opcional)', type: Number, required: false })
@ApiParam({ name: 'gestion', description: 'Año de las planillas (opcional)', type: Number, required: false })
@ApiResponse({ status: 200, description: 'Reporte PDF generado exitosamente', type: StreamableFile })
@ApiResponse({ status: 400, description: 'Parámetros inválidos o error al generar el reporte' })
@ApiResponse({ status: 500, description: 'Error interno del servidor' })
async generarReporteHistorial(
  @Param('mes', new ParseIntPipe({ optional: true })) mes?: number,
  @Param('gestion', new ParseIntPipe({ optional: true })) gestion?: number,
): Promise<StreamableFile> {
  try {
    return await this.planillasAportesService.generarReporteHistorial(mes, gestion);
  } catch (error) {
    throw new HttpException(
      {
        status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
        error: error.message || 'Error al generar el reporte de historial de planillas',
      },
      error.status || HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

// 28 .- DESCARGAR PLANTILLA DE APORTES EN EXCEL -----------------------------------------------------

  @Get('descargar-plantilla')
  @ApiOperation({ summary: 'Descargar la plantilla Excel' })
  @ApiResponse({ status: 200, description: 'Archivo descargado con éxito' })
  @ApiResponse({ status: 404, description: 'Archivo no encontrado' })
  async descargarPlantilla(@Res() res: Response) {
   /*  const filePath = path.join(__dirname, '..', 'PLANTILLA.xlsx'); */
    const filePath = path.resolve('src/modules/planillas_aportes/templates/plantilla.xlsx',);
    console.log('Ruta del archivo:', filePath); 

    if (!fs.existsSync(filePath)) {
      throw new HttpException('Archivo PLANTILLA no encontrado', HttpStatus.NOT_FOUND);
    }

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="PLANTILLA.xlsx"',
    });

    // Crear un stream del archivo y enviarlo
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  }



}
