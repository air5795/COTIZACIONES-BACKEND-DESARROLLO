import { Controller, Get, Post, Body, Param, Put, ParseIntPipe, Query, Patch, Delete } from '@nestjs/common';
import { ReembolsosIncapacidadesService } from './solicitudes_reembolso.service';
import { CreateSolicitudesReembolsoDto } from './dto/create-solicitudes_reembolso.dto';
import { UpdateSolicitudesReembolsoDto } from './dto/update-solicitudes_reembolso.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';

@ApiTags('Reembolsos de Incapacidades')
@Controller('reembolsos-incapacidades')
export class ReembolsosIncapacidadesController {
  constructor(private readonly service: ReembolsosIncapacidadesService) {}

  //1.- CREAR SOLICITUD MENSUAL DE REEMBOLSO ----------------------------------------------------------------------------------------
  @Post()
  @ApiOperation({ summary: '1.- Crear una nueva solicitud de reembolso mensual' })
  @ApiResponse({ status: 201, description: 'Solicitud mensual creada con éxito' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o empresa no encontrada' })
  async create(@Body() createDto: CreateSolicitudesReembolsoDto) {
    return this.service.crearSolictudMensual(createDto);
  }

  //2.- OBTENER SOLICITUD POR ID ----------------------------------------------------------------------------------------------------
  @Get(':id')
  @ApiOperation({ summary: '2.- Obtener una solicitud por id_solicitud_reembolso' })
  @ApiParam({ name: 'id', description: 'ID de la solicitud', type: Number })
  @ApiResponse({ status: 200, description: 'Solicitud encontrada' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.obtenerSolicitudPorId(id);
  }

  //3.- OBTENER TODAS LAS SOLICITUDES POR CODIGO PATRONAL CON PAGINACIÓN Y FILTROS -------------------------------------------------------------------------
  @Get('cod-patronal/:cod_patronal')
  @ApiOperation({ summary: '3.- Obtener todas las solicitudes por código patronal con paginación y filtros' })
  @ApiParam({ name: 'cod_patronal', description: 'Código patronal de la empresa', type: String })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página (por defecto: 1)', type: Number })
  @ApiQuery({ name: 'limite', required: false, description: 'Límite de resultados por página (por defecto: 10)', type: Number })
  @ApiQuery({ name: 'busqueda', required: false, description: 'Término de búsqueda en todos los campos', type: String })
  @ApiQuery({ name: 'mes', required: false, description: 'Mes de la solicitud (1-12)', type: String })
  @ApiQuery({ name: 'anio', required: false, description: 'Año de la solicitud', type: String })
  @ApiResponse({ status: 200, description: 'Lista de solicitudes obtenida con éxito' })
  @ApiResponse({ status: 400, description: 'Empresa no encontrada o parámetros inválidos' })
  async findAllByCodPatronal(
    @Param('cod_patronal') cod_patronal: string,
    @Query('pagina') pagina: number = 1,
    @Query('limite') limite: number = 10,
    @Query('busqueda') busqueda: string = '',
    @Query('mes') mes?: string,
    @Query('anio') anio?: string,
  ) {
    return this.service.obtenerSolicitudesPorCodPatronal(
      cod_patronal,
      pagina,
      limite,
      busqueda,
      mes,
      anio
    );
  }

  //4.- CREAR DETALLE DE REEMBOLSO ----------------------------------------------------------------------------------------
@Post('detalles')
@ApiOperation({ summary: '4.- Crear un detalle de reembolso (trabajador)' })
@ApiResponse({ status: 201, description: 'Detalle creado con éxito' })
async crearDetalle(@Body() createDetalleDto: any) {
  return this.service.crearDetalle(createDetalleDto);
}

//5.- OBTENER DETALLES POR ID DE SOLICITUD ----------------------------------------------------------------------------------------
@Get(':id/detalles')
@ApiOperation({ summary: '5.- Obtener todos los detalles de una solicitud' })
@ApiParam({ name: 'id', description: 'ID de la solicitud', type: Number })
async obtenerDetallesPorSolicitud(@Param('id', ParseIntPipe) id: number) {
  return this.service.obtenerDetallesPorSolicitud(id);
}

//6.- ELIMINAR DETALLE ----------------------------------------------------------------------------------------
@Delete('detalles/:idDetalle')
@ApiOperation({ summary: '6.- Eliminar un detalle de reembolso' })
@ApiParam({ name: 'idDetalle', description: 'ID del detalle', type: Number })
async eliminarDetalle(@Param('idDetalle', ParseIntPipe) idDetalle: number) {
  return this.service.eliminarDetalle(idDetalle);
}

//7.- ACTUALIZAR TOTALES DE SOLICITUD ----------------------------------------------------------------------------------------
@Patch(':id/totales')
@ApiOperation({ summary: '7.- Actualizar totales de una solicitud' })
@ApiParam({ name: 'id', description: 'ID de la solicitud', type: Number })
async actualizarTotales(@Param('id', ParseIntPipe) id: number, @Body() totales: any) {
  return this.service.actualizarTotales(id, totales);
}

//8.- CALCULAR REEMBOLSO CON DATOS REALES ----------------------------------------------------------------------------------------
@Post('calcular-reembolso')
@ApiOperation({ summary: '8.- Calcular reembolso con datos de planillas de aportes' })
@ApiResponse({ status: 200, description: 'Cálculo realizado exitosamente' })
async calcularReembolso(@Body() calcularDto: {
  matricula: string;
  cod_patronal: string;
  mes: string;
  gestion: string;
  baja_medica: any;
  usuario_calculo?: string;
}) {
  return this.service.calcularReembolsoConDatosReales(calcularDto);
}
}