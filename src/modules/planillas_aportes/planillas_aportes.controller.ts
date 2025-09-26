import { Controller, Post, Get,StreamableFile, UseInterceptors, UploadedFile, BadRequestException, Body, Param, Put, HttpException, HttpStatus, Res, Delete, Query, ParseIntPipe, Sse, Patch, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { PlanillasAportesService } from './planillas_aportes.service';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { query, Response } from 'express';
import { CreatePlanillasAporteDto } from './dto/create-planillas_aporte.dto';
import * as fs from 'fs';
import * as path from 'path';
import { Observable } from 'rxjs';


@ApiTags('Planillas Aportes')
@ApiBearerAuth('JWT-auth') 
@Controller('planillas_aportes')
export class PlanillasAportesController {
  constructor(
    private readonly planillasAportesService: PlanillasAportesService,
  ) {}

  //* DESCARGAR PLANTILLA DE EXCEL PARA PLANILLAS DE APORTES -----------------------------------------------------

  @Get('descargar-plantilla')
  @ApiTags('Reportes')
  @ApiOperation({ summary: 'Descargar la plantilla Excel para aportes' })
  @ApiResponse({ status: 200, description: 'Plantilla descargada con éxito', type: StreamableFile })
  @ApiResponse({ status: 400, description: 'Error al descargar la plantilla' })
  async descargarPlantilla(@Res({ passthrough: true }) res): Promise<StreamableFile> {
    try {
      const file = await this.planillasAportesService.descargarPlantilla();
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="plantilla-extendida.xlsx"',
      });
      return file;
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  //* DESCARGAR PLANTILLA DE EXCEL PARA PLANILLAS DE APORTES (version corta) -----------------------------------------------------
  
  @Get('descargar-plantilla-corta')
  @ApiTags('Reportes')
  @ApiOperation({ summary: 'Descargar la plantilla Excel para aportes' })
  @ApiResponse({ status: 200, description: 'Plantilla descargada con éxito', type: StreamableFile })
  @ApiResponse({ status: 400, description: 'Error al descargar la plantilla' })
  async descargarPlantillaCorta(@Res({ passthrough: true }) res): Promise<StreamableFile> {
    try {
      const file = await this.planillasAportesService.descargarPlantillaCorta();
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="plantilla-corta.xlsx"',
      });
      return file;
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

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
      // 🚀 LÍMITE DE TAMAÑO DE ARCHIVO AGREGADO
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB máximo
      },
    }),
  )

  // 2.-  Endpoint para subir un archivo Excel con la planilla de aportes---------------------------------------------------
  @ApiOperation({ summary: 'Subir un archivo Excel con la planilla de aportes' })
  @ApiResponse({ status: 201, description: 'Planilla guardada con éxito' })
  @ApiResponse({ status: 400, description: 'Error al procesar el archivo o datos inválidos' })
  @ApiResponse({ status: 408, description: 'Timeout - El procesamiento está tomando más tiempo del esperado' })
  @ApiBody({ type: CreatePlanillasAporteDto })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() createPlanillaDto: CreatePlanillasAporteDto,
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');

    console.log(`📁 Procesando archivo: ${file.originalname} (${file.size} bytes)`);
    
    try {
      const inicioTiempo = Date.now();
      
      const data = this.planillasAportesService.procesarExcel(file.path);
      
      console.log(`📊 Archivo procesado: ${data.length} registros encontrados`);
      
      // 🚀 VALIDACIÓN DE TAMAÑO DE DATOS
      if (data.length > 30000) {
        throw new BadRequestException(`El archivo contiene ${data.length} registros. El máximo permitido es 30,000.`);
      }
      
      if (data.length === 0) {
        throw new BadRequestException('El archivo no contiene registros válidos.');
      }
      
      const resultado = await this.planillasAportesService.guardarPlanilla(
        data,
        createPlanillaDto,
      );
      
      const tiempoTotal = Date.now() - inicioTiempo;
      const tiempoEnMinutos = (tiempoTotal / 60000).toFixed(1);
      
      console.log(`✅ Planilla guardada exitosamente en ${tiempoEnMinutos} minutos`);
      
      return {
        ...resultado,
        tiempoEjecucion: `${tiempoEnMinutos} minutos`,
        timestamp: new Date().toISOString(),
      };
      
    } catch (error) {
      console.error(`❌ Error al procesar archivo ${file.originalname}:`, error.message);
      
      // 🧹 LIMPIAR ARCHIVO EN CASO DE ERROR
      try {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          console.log(`🗑️ Archivo temporal eliminado: ${file.path}`);
        }
      } catch (cleanupError) {
        console.error('Error al limpiar archivo:', cleanupError.message);
      }
      
      throw error;
    } finally {
      // 🧹 LIMPIAR ARCHIVO DESPUÉS DEL PROCESAMIENTO EXITOSO
      try {
        if (file && file.path && fs.existsSync(file.path)) {
          // Esperar un poco antes de eliminar para asegurar que no esté en uso
          setTimeout(() => {
            try {
              fs.unlinkSync(file.path);
              console.log(`🗑️ Archivo temporal limpiado: ${file.path}`);
            } catch (err) {
              console.warn('No se pudo eliminar archivo temporal:', err.message);
            }
          }, 1000);
        }
      } catch (cleanupError) {
        console.warn('Error en limpieza final:', cleanupError.message);
      }
    }
  }

  // 3.- Endpoint para actualizar los detalles de una planilla de aportes-----------------------------------------------------

  @Put('detalles/:id_planilla')
  @ApiOperation({ 
    summary: 'Actualizar los detalles de una planilla de aportes',
    description: 'Reemplaza todos los detalles existentes de una planilla con nuevos datos. Soporta hasta 30,000 registros con procesamiento optimizado en lotes.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Detalles actualizados con éxito',
    schema: {
      type: 'object',
      properties: {
        mensaje: { type: 'string', example: '✅ Detalles de la planilla actualizados con éxito' },
        id_planilla: { type: 'number', example: 123 },
        total_importe: { type: 'number', example: 150000.50 },
        total_trabajadores: { type: 'number', example: 250 },
        estadisticas: {
          type: 'object',
          properties: {
            registros_procesados: { type: 'number', example: 250 },
            trabajadores_unicos: { type: 'number', example: 250 },
            lotes_procesados: { type: 'number', example: 1 },
            total_importe: { type: 'number', example: 150000.50 }
          }
        },
        tiempoEjecucion: { type: 'string', example: '2.3 minutos' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Error al actualizar los detalles' })
  @ApiResponse({ status: 404, description: 'La planilla no existe' })
  @ApiResponse({ status: 408, description: 'Timeout - La actualización está tomando más tiempo del esperado' })
  @ApiBody({ 
    description: 'Datos de trabajadores y configuración opcional de planilla',
    schema: {
      type: 'object',
      properties: {
        trabajadores: {
          type: 'array',
          description: 'Array de trabajadores con sus datos',
          minItems: 1,
          maxItems: 30000,
          items: {
            type: 'object',
            properties: {
              'Número documento de identidad': { type: 'string', example: '12345678' },
              'Apellido Paterno': { type: 'string', example: 'PÉREZ' },
              'Apellido Materno': { type: 'string', example: 'LÓPEZ' },
              'Nombres': { type: 'string', example: 'JUAN CARLOS' },
              'Sexo (M/F)': { type: 'string', example: 'M' },
              'Cargo': { type: 'string', example: 'TÉCNICO' },
              'Fecha de nacimiento': { type: 'string', example: '01/01/1980' },
              'Fecha de ingreso': { type: 'string', example: '01/01/2020' },
              'Días pagados': { type: 'number', example: 30 },
              'Haber Básico': { type: 'number', example: 3000 },
              'Bono de antigüedad': { type: 'number', example: 500 },
              'Monto horas extra': { type: 'number', example: 200 },
              'Monto horas extra nocturnas': { type: 'number', example: 100 },
              'Otros bonos y pagos': { type: 'number', example: 150 },
              'regional': { type: 'string', example: 'LA PAZ' }
            },
            required: ['Número documento de identidad', 'Nombres', 'Haber Básico']
          }
        },
        planilla: {
          type: 'object',
          description: 'Configuración opcional de la planilla (solo si se necesita actualizar metadatos)',
          allOf: [{ $ref: '#/components/schemas/CreatePlanillasAporteDto' }]
        }
      },
      required: ['trabajadores']
    }
  })
  async actualizarDetallesPlanilla(
    @Param('id_planilla', ParseIntPipe) id_planilla: number,
    @Body() body: { trabajadores: any[]; planilla?: CreatePlanillasAporteDto },
  ) {
    // ✅ VALIDACIONES INICIALES
    if (!body.trabajadores || !Array.isArray(body.trabajadores)) {
      throw new BadRequestException('El campo "trabajadores" es requerido y debe ser un array');
    }

    if (body.trabajadores.length === 0) {
      throw new BadRequestException('El array de trabajadores no puede estar vacío');
    }

    if (body.trabajadores.length > 30000) {
      throw new BadRequestException(`Se enviaron ${body.trabajadores.length} registros. El máximo permitido es 30,000.`);
    }

    console.log(`🔄 Iniciando actualización de detalles para planilla ${id_planilla}:`);
    console.log(`   📊 Registros recibidos: ${body.trabajadores.length}`);
    console.log(`   ⚙️ Configuración adicional: ${body.planilla ? 'Sí' : 'No'}`);

    try {
      const inicioTiempo = Date.now();
      
      const resultado = await this.planillasAportesService.actualizarDetallesPlanilla(
        id_planilla,
        body.trabajadores,
        body.planilla,
      );
      
      const tiempoTotal = Date.now() - inicioTiempo;
      const tiempoEnMinutos = (tiempoTotal / 60000).toFixed(1);
      
      console.log(`✅ Actualización completada exitosamente en ${tiempoEnMinutos} minutos`);
      console.log(`   📈 Registros procesados: ${resultado.estadisticas?.registros_procesados || 0}`);
      console.log(`   👥 Trabajadores únicos: ${resultado.estadisticas?.trabajadores_unicos || 0}`);
      console.log(`   💰 Total importe: ${resultado.total_importe || 0}`);

      return {
        ...resultado,
        tiempoEjecucion: `${tiempoEnMinutos} minutos`,
        timestamp: new Date().toISOString(),
      };
      
    } catch (error) {
      console.error(`❌ Error al actualizar detalles de planilla ${id_planilla}:`, error.message);
      
      // 🔍 CATEGORIZAR ERRORES PARA MEJOR RESPUESTA
      if (error instanceof NotFoundException) {
        throw new HttpException(
          {
            status: HttpStatus.NOT_FOUND,
            error: error.message,
            codigo: 'PLANILLA_NO_ENCONTRADA'
          },
          HttpStatus.NOT_FOUND,
        );
      }
      
      if (error instanceof BadRequestException) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: error.message,
            codigo: 'DATOS_INVALIDOS'
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      
      // Error genérico del servidor
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Error interno al actualizar los detalles de la planilla',
          detalle: error.message,
          codigo: 'ERROR_INTERNO'
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
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
  @ApiOperation({ summary: '(6) Obtener el historial completo de planillas de aportes (sin filtro de estado)' })
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
  @ApiOperation({ summary: '(7) Obtener una planilla de aportes por su ID' })
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
  @ApiOperation({ summary: '(8) Obtener detalles de la planilla' })
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
        usuario_procesador: { type: 'string', description: 'Usuario que presenta la planilla' },
        nom_usuario: { type: 'string', description: 'Nombre completo del usuario' }
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Planilla presentada con éxito' })
  @ApiResponse({ status: 400, description: 'Error al presentar planilla' })
  async actualizarEstadoAPendiente(
    @Param('id_planilla') id_planilla: number,
    @Body() body: {
      fecha_declarada?: string;
      usuario_procesador?: string;
      nom_usuario?: string;
    }
  ) {
    return await this.planillasAportesService.actualizarEstadoAPendiente(
      id_planilla, 
      body.fecha_declarada,
      body.usuario_procesador,
      body.nom_usuario
    );
  }

  // 12 .- ACTUALIZAR METODO PARA APROBAR U OBSERVAR LA PLANILLA (ESTADO 2 o 3) -------------------------------------

@Put('estado/:id_planilla')
@ApiOperation({ summary: 'Actualizar estado de planilla (aprobar/observar)' })
@ApiParam({ name: 'id_planilla', description: 'ID de la planilla', type: Number })
@ApiBody({
  description: 'Datos para actualizar el estado',
  schema: {
    type: 'object',
    properties: {
      estado: { type: 'number', enum: [2, 3], description: '2 = Aprobado, 3 = Observado' },
      observaciones: { type: 'string', description: 'Observaciones (requerido si estado = 3)' },
      usuario_procesador: { type: 'string', description: 'Usuario que procesa la planilla' },
      nom_usuario: { type: 'string', description: 'Nombre completo del procesador' }
    },
    required: ['estado']
  }
})
@ApiResponse({ status: 200, description: 'Estado actualizado correctamente' })
@ApiResponse({ status: 400, description: 'Error en la validación' })
async actualizarEstadoPlanilla(
  @Param('id_planilla') id_planilla: number,
  @Body() body: {
    estado: number;
    observaciones?: string;
    usuario_procesador?: string;
    nom_usuario?: string;
  },
) {
  console.log('🔧 Datos recibidos en el controlador:', body);
  
  return this.planillasAportesService.actualizarEstadoPlanilla(
    id_planilla,
    body.estado,
    body.observaciones,
    body.usuario_procesador,
    body.nom_usuario
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
    @ApiOperation({ summary: 'Corregir planilla observada' })
    @ApiParam({ name: 'id_planilla', description: 'ID de la planilla', type: Number })
    @ApiBody({
      description: 'Datos de corrección de la planilla',
      schema: {
        type: 'object',
        properties: {
          trabajadores: {
            type: 'array',
            description: 'Lista de trabajadores corregidos',
            items: { type: 'object' }
          },
          fecha_planilla: { type: 'string', description: 'Fecha de la planilla (opcional)', format: 'date' },
          usuario_procesador: { type: 'string', description: 'Usuario que corrige la planilla' },
          nom_usuario: { type: 'string', description: 'Nombre completo del usuario que corrige' }
        },
        required: ['trabajadores']
      }
    })
    @ApiResponse({ status: 200, description: 'Planilla corregida exitosamente' })
    @ApiResponse({ status: 400, description: 'Error al corregir planilla' })
    async corregirPlanilla(
      @Param('id_planilla') id_planilla: number,
      @Body() body: {
        trabajadores: any[];
        fecha_planilla?: string;
        usuario_procesador?: string;
        nom_usuario?: string;
      },
    ) {
      return this.planillasAportesService.corregirPlanilla(id_planilla, body);
    }

  // 17 .- endpoint para hacer la comparacion para obtener altas y bajas

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

 // ! nuevos controladores paara la liquidacion ------------------------------------------------------------------------

 /* =========================================================================== */
/* CONTROLADORES ESPECÍFICOS PARA EMPRESAS PRIVADAS                          */
/* =========================================================================== */

// 🏢 EMPRESAS PRIVADAS: Recalcular liquidación con nueva fecha
@Post('privada/:id/recalcular-fecha')
@ApiOperation({ summary: 'Recalcular liquidación para empresa privada con nueva fecha' })
@ApiParam({ name: 'id', description: 'ID de la planilla', type: Number })
@ApiBody({
  description: 'Nueva fecha de pago',
  schema: {
    type: 'object',
    properties: {
      fechaPago: { type: 'string', format: 'date-time', description: 'Nueva fecha de pago' }
    },
    required: ['fechaPago']
  }
})
@ApiResponse({ status: 200, description: 'Liquidación recalculada para empresa privada' })
@ApiResponse({ status: 400, description: 'Error en la solicitud' })
async recalcularLiquidacionPrivada(
  @Param('id') id: number,
  @Body() body: { fechaPago: string }
) {
  try {
    const fechaPago = new Date(body.fechaPago);
    
    if (isNaN(fechaPago.getTime())) {
      throw new BadRequestException('Fecha de pago inválida');
    }

    console.log('🏢 Controller: Recalculando liquidación empresa PRIVADA');
    
    const resultado = await this.planillasAportesService.recalcularLiquidacionPrivada(id, fechaPago);
    
    return {
      mensaje: 'Liquidación de empresa privada recalculada exitosamente',
      ...resultado
    };
  } catch (error) {
    throw new HttpException(
      {
        status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
        error: error.message || 'Error al recalcular liquidación de empresa privada',
      },
      error.status || HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

/* =========================================================================== */
/* CONTROLADORES ESPECÍFICOS PARA EMPRESAS PÚBLICAS                          */
/* =========================================================================== */

// 🏛️ EMPRESAS PÚBLICAS: Actualizar con nuevo monto TGN real
@Post('publica/:id/actualizar-tgn')
@ApiOperation({ summary: 'Actualizar empresa pública con nuevo monto TGN real' })
@ApiParam({ name: 'id', description: 'ID de la planilla', type: Number })
@ApiBody({
  description: 'Nueva fecha de pago y monto TGN real',
  schema: {
    type: 'object',
    properties: {
      fechaPago: { type: 'string', format: 'date-time', description: 'Fecha real de pago' },
      nuevoMontoTGN: { type: 'number', description: 'Monto TGN real pagado' }
    },
    required: ['fechaPago', 'nuevoMontoTGN']
  }
})
@ApiResponse({ status: 200, description: 'Empresa pública actualizada con nuevo TGN' })
@ApiResponse({ status: 400, description: 'Error en la solicitud' })
async actualizarEmpresaPublicaConTGN(
  @Param('id') id: number,
  @Body() body: { fechaPago: string; nuevoMontoTGN: number }
) {
  try {
    const fechaPago = new Date(body.fechaPago);
    const nuevoMontoTGN = body.nuevoMontoTGN;
    
    if (isNaN(fechaPago.getTime())) {
      throw new BadRequestException('Fecha de pago inválida');
    }
    
    if (!nuevoMontoTGN || nuevoMontoTGN <= 0) {
      throw new BadRequestException('El monto TGN debe ser mayor a 0');
    }

    console.log('🏛️ Controller: Actualizando empresa PÚBLICA con nuevo TGN:', nuevoMontoTGN);
    
    const resultado = await this.planillasAportesService.actualizarConNuevoMontoTGN(id, fechaPago, nuevoMontoTGN);
    
    const valorAnterior = resultado.cotizacion_teorica || 0;
    
    return {
      mensaje: "Liquidación recalculada con cotización real del TGN",
      cotizacion_teorica: valorAnterior.toString(),
      cotizacion_real: resultado.aporte_porcentaje,
      diferencia: resultado.aporte_porcentaje - valorAnterior,
      ...resultado
    };
  } catch (error) {
    throw new HttpException(
      {
        status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
        error: error.message || 'Error al actualizar empresa pública con nuevo TGN',
      },
      error.status || HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

// 🏛️ EMPRESAS PÚBLICAS: Recalcular liquidación normal (sin nuevo TGN)
@Post('publica/:id/recalcular-fecha')
@ApiOperation({ summary: 'Recalcular liquidación para empresa pública con nueva fecha (sin nuevo TGN)' })
@ApiParam({ name: 'id', description: 'ID de la planilla', type: Number })
@ApiBody({
  description: 'Nueva fecha de pago',
  schema: {
    type: 'object',
    properties: {
      fechaPago: { type: 'string', format: 'date-time', description: 'Nueva fecha de pago' }
    },
    required: ['fechaPago']
  }
})
@ApiResponse({ status: 200, description: 'Liquidación recalculada para empresa pública' })
@ApiResponse({ status: 400, description: 'Error en la solicitud' })
async recalcularLiquidacionPublica(
  @Param('id') id: number,
  @Body() body: { fechaPago: string }
) {
  try {
    const fechaPago = new Date(body.fechaPago);
    
    if (isNaN(fechaPago.getTime())) {
      throw new BadRequestException('Fecha de pago inválida');
    }

    console.log('🏛️ Controller: Recalculando liquidación empresa PÚBLICA sin nuevo TGN');
    
    const resultado = await this.planillasAportesService.recalcularLiquidacionPublica(id, fechaPago);
    
    return {
      mensaje: 'Liquidación de empresa pública recalculada exitosamente',
      ...resultado
    };
  } catch (error) {
    throw new HttpException(
      {
        status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
        error: error.message || 'Error al recalcular liquidación de empresa pública',
      },
      error.status || HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}


@Get(':id/liquidacion')
async obtenerLiquidacion(@Param('id') id: number) {
  return await this.planillasAportesService.obtenerLiquidacion(id);
}


@Post(':id/validar-planilla')
@ApiOperation({ summary: 'Validar planilla con nombre del administrador' })
@ApiParam({ name: 'id', type: 'number', description: 'ID de la planilla' })
@ApiBody({
  schema: {
    type: 'object',
    properties: {
      nombreAdministrador: { type: 'string', description: 'Nombre completo del administrador' }
    },
    required: ['nombreAdministrador']
  }
})
async validarPlanilla(
  @Param('id') id: number,
  @Body('nombreAdministrador') nombreAdministrador: string
): Promise<any> {
  try {
    if (!nombreAdministrador || nombreAdministrador.trim() === '') {
      throw new BadRequestException('El nombre del administrador es obligatorio');
    }

    return await this.planillasAportesService.validarPlanilla(id, nombreAdministrador.trim());
  } catch (error) {
    throw new HttpException(
      {
        status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
        error: error.message || 'Error al validar la planilla',
      },
      error.status || HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}



//!---------------------------------------------------------------------------------------------------------------------------
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

// 28 .- CRUCE AFLILIADOS -----------------------------------------------------
// 28 .- VERIFICAR AFILIACIÓN DE DETALLES - ENDPOINT ACTUALIZADO
@Post('verificar-afiliacion/:id_planilla')
@ApiOperation({ 
  summary: 'Verificación completa de afiliaciones con detección de faltantes',
  description: 'Obtiene todos los asegurados del número patronal, verifica los trabajadores de la planilla y detecta quiénes faltan (excluyendo trabajadores dados de BAJA). Procesa por lotes para mejorar rendimiento.'
})
@ApiParam({ 
  name: 'id_planilla', 
  description: 'ID de la planilla de aportes', 
  type: Number,
  example: 123
})
@ApiResponse({ 
  status: 200, 
  description: 'Verificación completa exitosa',
  schema: {
    type: 'object',
    properties: {
      mensaje: {
        type: 'string',
        example: 'Verificación completa finalizada. Se actualizaron 150 detalles. Se encontraron 5 trabajadores faltantes en la planilla.'
      },
      detallesActualizados: {
        type: 'number',
        example: 150
      },
      estadisticas: {
        type: 'object',
        properties: {
          total_procesados: { type: 'number', example: 150 },
          encontrados_vigentes: { type: 'number', example: 145 },
          encontrados_no_vigentes: { type: 'number', example: 3 },
          total_api_asegurados: { type: 'number', example: 155 },
          trabajadores_faltantes: { type: 'number', example: 5 },
          trabajadores_excluidos_baja: { type: 'number', example: 2 }
        }
      },
      trabajadoresFaltantes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ci: { type: 'string', example: '1234567-LP' },
            nombres: { type: 'string', example: 'JUAN CARLOS' },
            apellido_paterno: { type: 'string', example: 'PEREZ' },
            apellido_materno: { type: 'string', example: 'LOPEZ' },
            matricula: { type: 'string', example: '12-3456 ABC' },
            cargo: { type: 'string', example: 'TÉCNICO' },
            estado: { type: 'string', example: 'VIGENTE' }
          }
        }
      },
      tiempoEjecucion: { type: 'string', example: '3.2 minutos' }
    }
  }
})
@ApiResponse({ 
  status: 400, 
  description: 'Error en la verificación',
  schema: {
    type: 'object',
    properties: {
      statusCode: { type: 'number', example: 400 },
      message: { type: 'string', example: 'El ID de la planilla debe ser un número positivo' },
      error: { type: 'string', example: 'Bad Request' }
    }
  }
})
async verificarAfiliacionDetalles(@Param('id_planilla', ParseIntPipe) id_planilla: number) {
  try {
    const inicioTiempo = Date.now();
    
    console.log(`🚀 Iniciando verificación COMPLETA de afiliaciones para planilla ${id_planilla}`);
    
    const resultado = await this.planillasAportesService.verificarAfiliacionDetalles(id_planilla);
    
    const tiempoTranscurrido = Date.now() - inicioTiempo;
    const tiempoEnMinutos = (tiempoTranscurrido / 60000).toFixed(1);
    
    console.log(`✅ Verificación completa finalizada en ${tiempoEnMinutos} minutos`);
    console.log(`📊 Resumen: ${resultado.detallesActualizados} actualizados, ${resultado.trabajadoresFaltantes.length} faltantes`);
    
    return {
      ...resultado,
      tiempoEjecucion: `${tiempoEnMinutos} minutos`,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`❌ Error en verificación completa de afiliaciones para planilla ${id_planilla}:`, error);
    
    if (error instanceof BadRequestException) {
      throw error;
    } else if (error instanceof NotFoundException) {
      throw error;
    } else {
      throw new BadRequestException(
        `Error interno al verificar afiliaciones: ${error.message || 'Error desconocido'}`
      );
    }
  }
}

// ENDPOINT ADICIONAL: Ver trabajadores faltantes
@Get('trabajadores-faltantes/:id_planilla')
@ApiOperation({ 
  summary: 'Obtener solo la lista de trabajadores faltantes',
  description: 'Devuelve únicamente los trabajadores que están en la API pero no en la planilla (excluyendo BAJA)'
})
@ApiParam({ name: 'id_planilla', description: 'ID de la planilla de aportes', type: Number })
@ApiResponse({ status: 200, description: 'Lista de trabajadores faltantes' })
async obtenerTrabajadoresFaltantes(@Param('id_planilla', ParseIntPipe) id_planilla: number) {
  try {
    // Reutilizar la lógica del servicio principal pero solo devolver faltantes
    const resultado = await this.planillasAportesService.verificarAfiliacionDetalles(id_planilla);
    
    return {
      mensaje: `Se encontraron ${resultado.trabajadoresFaltantes.length} trabajadores faltantes`,
      total_faltantes: resultado.trabajadoresFaltantes.length,
      trabajadores_faltantes: resultado.trabajadoresFaltantes,
      estadisticas_resumen: {
        total_api_asegurados: resultado.estadisticas.total_api_asegurados,
        total_planilla: resultado.estadisticas.total_procesados,
        vigentes_api: resultado.estadisticas.total_api_vigentes,
        excluidos_baja: resultado.estadisticas.trabajadores_excluidos_baja
      }
    };
  } catch (error) {
    throw new BadRequestException(`Error al obtener trabajadores faltantes: ${error.message}`);
  }
}

  // 29 .- 

@Put('validar-liquidacion/:id')
async validarLiquidacion(
  @Param('id') id: number,
  @Body() payload: { fecha_pago?: string; valido_cotizacion?: string }
) {
  return await this.planillasAportesService.validarLiquidacion(id, payload);
}




// 30 .- REPORTE AFILIACIONES VIGENTE NO VIGENTES 

/* @Get('reporte-afiliacion/:id_planilla')
@ApiOperation({ summary: 'Generar reporte PDF de afiliación por planilla' })
@ApiParam({ name: 'id_planilla', description: 'ID de la planilla', type: Number })
@ApiResponse({ status: 200, description: 'Reporte PDF generado exitosamente', type: StreamableFile })
@ApiResponse({ status: 400, description: 'Error al generar el reporte' })
async generarReporteAfiliacion(
  @Param('id_planilla', ParseIntPipe) id_planilla: number,
): Promise<StreamableFile> {
  try {
    const fileBuffer = await this.planillasAportesService.generarReporteAfiliacion(id_planilla);
    if (!fileBuffer) {
      throw new BadRequestException('No se pudo generar el reporte de afiliación.');
    }
    return fileBuffer;
  } catch (error) {
    throw new BadRequestException({
      message: 'Error al generar el reporte de afiliación',
      details: error.message,
    });
  }
} */

// 31.- REPORTE DE DETALLES DE PLANILLA EN EXCEL 

@Get('reporte-detalles-excel/:id_planilla')
@ApiOperation({ summary: 'Generar reporte Excel de detalles de una planilla' })
@ApiParam({ name: 'id_planilla', description: 'ID de la planilla', type: Number })
@ApiResponse({ status: 200, description: 'Reporte Excel generado exitosamente', type: StreamableFile })
@ApiResponse({ status: 400, description: 'Error al generar el reporte' })
async generarReporteDetallesExcel(
  @Param('id_planilla', ParseIntPipe) id_planilla: number,
): Promise<StreamableFile> {
  try {
    const fileBuffer = await this.planillasAportesService.generarReporteDetallesExcel(id_planilla);
    if (!fileBuffer) {
      throw new BadRequestException('No se pudo generar el reporte de detalles.');
    }
    return fileBuffer;
  } catch (error) {
    throw new BadRequestException({
      message: 'Error al generar el reporte de detalles',
      details: error.message,
    });
  }
}

// 32.- VERIFICAR SI LOS CI ESTÁN EN AFILIACIONES (VERIFICACIÓN SIMPLE - OPTIMIZADA)
@Post('verificar-ci-simple/:id_planilla')
@ApiOperation({ 
  summary: 'Verificar si los CIs de una planilla tienen registro en el sistema de afiliaciones', 
  description: `Consulta si cada CI tiene registro en afiliaciones. 
  ENCONTRADOS: Incluye estados VIGENTE, BAJA, y otros (cualquier registro existente en el sistema).
  NO ENCONTRADOS: Solo cuando el sistema responde "No existe datos del Asegurado".
  NOTA: Los asegurados con estado BAJA SÍ se consideran encontrados porque existen en el sistema.
  Devuelve únicamente los NO encontrados en el array de resultados.` 
})
@ApiParam({ name: 'id_planilla', description: 'ID de la planilla', type: Number })
@ApiResponse({ 
  status: 200, 
  description: 'Verificación completada con éxito',
  schema: {
    type: 'object',
    properties: {
      mensaje: { type: 'string' },
      resumen: {
        type: 'object',
        properties: {
          total_consultados: { type: 'number' },
          consultas_exitosas: { type: 'number' },
          consultas_con_error: { type: 'number' },
          encontrados_en_afiliaciones: { type: 'number', description: 'Incluye VIGENTE, BAJA y otros estados' },
          no_encontrados_en_afiliaciones: { type: 'number', description: 'Solo los que no existen en el sistema' },
          porcentaje_encontrados: { type: 'string' }
        }
      },
      resultados: {
        type: 'array',
        description: 'Array con solo los CIs que NO existen en el sistema de afiliaciones',
        items: {
          type: 'object',
          properties: {
            ci: { type: 'string' },
            nombre_completo: { type: 'string' },
            encontrado_en_afiliaciones: { type: 'boolean', enum: [false] },
            estado_consulta: { type: 'string' },
            mensaje: { type: 'string' },
            mensaje_api: { type: 'string', description: 'Mensaje original del API de afiliaciones' }
          }
        }
      }
    }
  }
})
@ApiResponse({ status: 400, description: 'Error al verificar CIs' })
@ApiResponse({ status: 408, description: 'Timeout - La verificación está en progreso, revisar logs del servidor' })
async verificarCiEnAfiliaciones(@Param('id_planilla', ParseIntPipe) id_planilla: number) {
  try {
    return await this.planillasAportesService.verificarCiEnAfiliaciones(id_planilla);
  } catch (error) {
    throw new BadRequestException(error.message);
  }
}

// 33.- GENERAR REPORTE PDF DE VERIFICACIÓN DE AFILIACIONES
@Get('reporte-verificacion-afiliaciones/:id_planilla')
@ApiOperation({ 
  summary: 'Generar reporte PDF de verificación de afiliaciones', 
  description: 'Genera un reporte completo con los CIs que NO fueron encontrados en el sistema de afiliaciones' 
})
@ApiParam({ name: 'id_planilla', description: 'ID de la planilla', type: Number })
@ApiResponse({ 
  status: 200, 
  description: 'Reporte PDF generado exitosamente', 
  type: StreamableFile 
})
@ApiResponse({ status: 400, description: 'Error al generar el reporte' })
async generarReporteVerificacionAfiliaciones(@Param('id_planilla', ParseIntPipe) id_planilla: number): Promise<StreamableFile> {
  try {
    const fileBuffer = await this.planillasAportesService.generarReporteVerificacionAfiliaciones(id_planilla);
    if (!fileBuffer) {
      throw new BadRequestException('No se pudo generar el reporte de verificación.');
    }
    return fileBuffer;
  } catch (error) {
    throw new BadRequestException({
      message: 'Error al generar el reporte de verificación de afiliaciones',
      details: error.message,
    });
  }
}






//  

@Get('resumen/:id_planilla')
@ApiOperation({ summary: 'Obtener resumen de planilla mensual con adicionales' })
@ApiParam({ name: 'id_planilla', description: 'ID de la planilla mensual', type: Number })
@ApiResponse({ status: 200, description: 'Resumen obtenido con éxito' })
@ApiResponse({ status: 404, description: 'No se encontró la planilla mensual' })
@ApiResponse({ status: 500, description: 'Error del servidor' })
async obtenerResumenPlanillaMensual(@Param('id_planilla') id_planilla: number) {
  try {
    return await this.planillasAportesService.obtenerResumenConAdicionales(id_planilla);
  } catch (error) {
    throw new HttpException(
      {
        status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
        error: error.message || 'Error al obtener el resumen de la planilla',
      },
      error.status || HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

//

// Agregar este nuevo endpoint en tu planillas_aportes.controller.ts

// 31.- OBTENER DATOS DE VERIFICACIÓN GUARDADOS
@Get('datos-verificacion/:id_planilla')
@ApiOperation({ summary: 'Obtener datos de verificación guardados para una planilla' })
@ApiParam({ name: 'id_planilla', description: 'ID de la planilla', type: Number })
@ApiResponse({ status: 200, description: 'Datos de verificación obtenidos con éxito' })
@ApiResponse({ status: 404, description: 'No se encontraron datos de verificación' })
@ApiResponse({ status: 400, description: 'Error al obtener los datos' })
async obtenerDatosVerificacionGuardados(
  @Param('id_planilla', ParseIntPipe) id_planilla: number,
) {
  try {
    return await this.planillasAportesService.obtenerDatosVerificacionGuardados(id_planilla);
  } catch (error) {
    throw new HttpException(
      {
        status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
        error: error.message || 'Error al obtener datos de verificación',
      },
      error.status || HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}



//  ELIMINAR PLANILLA COMPLETA (CABECERA + DETALLES) SOLO SI ESTÁ EN ESTADO BORRADOR (0) -------
@Delete(':id_planilla')
@ApiOperation({ 
  summary: 'Eliminar planilla completa (solo si está en estado BORRADOR)',
  description: 'Elimina tanto la cabecera como todos los detalles de la planilla. Solo permitido para planillas en estado BORRADOR (0)'
})
@ApiParam({ 
  name: 'id_planilla', 
  description: 'ID de la planilla a eliminar', 
  type: Number 
})
@ApiBody({
  description: 'Usuario que realiza la eliminación (opcional)',
  schema: {
    type: 'object',
    properties: {
      usuario_eliminacion: { 
        type: 'string', 
        description: 'Usuario que realiza la eliminación',
        example: 'admin@empresa.com'
      }
    }
  },
  required: false
})
@ApiResponse({ 
  status: 200, 
  description: 'Planilla eliminada correctamente'
})
@ApiResponse({ 
  status: 400, 
  description: 'Error de validación - Planilla no está en estado BORRADOR o tiene pagos asociados'
})
@ApiResponse({ 
  status: 404, 
  description: 'Planilla no encontrada'
})
async eliminarPlanillaCompleta(
  @Param('id_planilla') id_planilla: number,
  @Body() body?: { usuario_eliminacion?: string }
) {
  try {
    const resultado = await this.planillasAportesService.eliminarPlanillaCompleta(
      id_planilla,
      body?.usuario_eliminacion
    );
    
    console.log(`🗑️ Planilla ${id_planilla} eliminada completamente por:`, body?.usuario_eliminacion || 'SISTEMA');
    
    return resultado;
  } catch (error) {
    console.error(`❌ Error al eliminar planilla ${id_planilla}:`, error.message);
    
    throw new HttpException(
      {
        status: error.status || HttpStatus.BAD_REQUEST,
        error: error.message,
      },
      error.status || HttpStatus.BAD_REQUEST,
    );
  }
}







}
