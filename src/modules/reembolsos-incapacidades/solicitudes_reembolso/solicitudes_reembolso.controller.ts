import { Controller, Get, Post, Body, Param, Put, ParseIntPipe, Query } from '@nestjs/common';
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
}