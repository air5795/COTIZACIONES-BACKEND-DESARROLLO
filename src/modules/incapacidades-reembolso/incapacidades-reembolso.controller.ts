import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Headers,
  UseGuards,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { IncapacidadesReembolsoService } from './incapacidades-reembolso.service';
import { CreateIncapacidadesReembolsoDto } from './dto/create-incapacidades-reembolso.dto';
import { UpdateIncapacidadesReembolsoDto } from './dto/update-incapacidades-reembolso.dto';
import { CreateIncapacidadDetalleDto } from './dto/create-incapacidad-detalle.dto';
import { PaginationQueryDto } from '../../core/utility/pagination-query.dto';

@ApiTags('Incapacidades Reembolso')
@Controller('incapacidades-reembolso')
export class IncapacidadesReembolsoController {
  constructor(private readonly incapacidadesService: IncapacidadesReembolsoService) {}

  // =====================================================
  // ENDPOINTS PLANILLA CABECERA
  // =====================================================

  @Post()
  @ApiOperation({ summary: 'Crear nueva planilla de incapacidades' })
  @ApiResponse({ status: 201, description: 'Planilla creada exitosamente' })
  create(
    @Body() createDto: CreateIncapacidadesReembolsoDto,
    @Headers('usuario') usuario: string = 'SYSTEM',
  ) {
    return this.incapacidadesService.create(createDto, usuario);
  }

  @Get()
  @ApiOperation({ summary: 'Listar planillas de incapacidades con paginación' })
  @ApiQuery({ name: 'limit', required: false, description: 'Límite de registros por página' })
  @ApiQuery({ name: 'offset', required: false, description: 'Página actual' })
  findAll(@Query() paginationQuery: PaginationQueryDto) {
    return this.incapacidadesService.findAll(paginationQuery);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener planilla por ID con detalles' })
  findOne(@Param('id') id: string) {
    return this.incapacidadesService.findOne(+id);
  }

  @Get('empresa/:codPatronal/periodo/:fecha')
  @ApiOperation({ summary: 'Obtener planilla por empresa y período' })
  findByEmpresaAndPeriodo(
    @Param('codPatronal') codPatronal: string,
    @Param('fecha') fecha: string,
  ) {
    return this.incapacidadesService.findByEmpresaAndPeriodo(codPatronal, new Date(fecha));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar planilla (solo en estado BORRADOR)' })
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateIncapacidadesReembolsoDto,
    @Headers('usuario') usuario: string = 'SYSTEM',
  ) {
    return this.incapacidadesService.update(+id, updateDto, usuario);
  }

  @Patch(':id/presentar')
  @ApiOperation({ summary: 'Presentar planilla (BORRADOR → PRESENTADO)' })
  presentar(
    @Param('id') id: string,
    @Headers('usuario') usuario: string = 'SYSTEM',
  ) {
    return this.incapacidadesService.presentar(+id, usuario);
  }

  @Patch(':id/aprobar')
  @ApiOperation({ summary: 'Aprobar planilla (PRESENTADO → APROBADO)' })
  aprobar(
    @Param('id') id: string,
    @Headers('usuario') usuario: string = 'SYSTEM',
  ) {
    return this.incapacidadesService.aprobar(+id, usuario);
  }

  // =====================================================
  // ENDPOINTS GESTIÓN DE TRABAJADORES
  // =====================================================

  @Post('trabajadores')
  @ApiOperation({ summary: 'Agregar trabajador a planilla de incapacidades' })
  @ApiResponse({ status: 201, description: 'Trabajador agregado exitosamente' })
  agregarTrabajador(
    @Body() createDto: CreateIncapacidadDetalleDto,
    @Headers('usuario') usuario: string = 'SYSTEM',
  ) {
    return this.incapacidadesService.agregarTrabajador(createDto, usuario);
  }

  @Get('trabajadores/:idDetalle')
  @ApiOperation({ summary: 'Obtener detalle de trabajador específico' })
  obtenerDetalleTrabajador(@Param('idDetalle') idDetalle: string) {
    // Implementar en service
    return { message: `Detalle del trabajador ${idDetalle}` };
  }

  @Patch('trabajadores/:idDetalle')
  @ApiOperation({ summary: 'Actualizar datos del trabajador en planilla' })
  actualizarTrabajador(
    @Param('idDetalle') idDetalle: string,
    @Body() updateDto: any,
    @Headers('usuario') usuario: string = 'SYSTEM',
  ) {
    // Implementar en service
    return { message: `Actualizar trabajador ${idDetalle}` };
  }

  @Delete('trabajadores/:idDetalle')
  @ApiOperation({ summary: 'Eliminar trabajador de planilla' })
  eliminarTrabajador(
    @Param('idDetalle') idDetalle: string,
    @Headers('usuario') usuario: string = 'SYSTEM',
  ) {
    // Implementar en service
    return { message: `Eliminar trabajador ${idDetalle}` };
  }

  // =====================================================
  // ENDPOINTS CONSULTAS EXTERNAS
  // =====================================================



  @Get('trabajadores/buscar/:matricula')
  @ApiOperation({ summary: 'Buscar datos del trabajador en planillas de aportes' })
  buscarTrabajadorEnAportes(@Param('matricula') matricula: string) {
    // Implementar en service - buscar trabajador en planillas_aportes
    return { message: `Buscar trabajador ${matricula}` };
  }

  // =====================================================
  // ENDPOINTS REPORTES Y DOCUMENTOS
  // =====================================================

  @Get(':id/cuadro-reembolso')
  @ApiOperation({ summary: 'Generar cuadro oficial de reembolso (PDF)' })
  @ApiResponse({
    status: 200,
    description: 'PDF del cuadro de reembolso',
    headers: {
      'Content-Type': { description: 'application/pdf' },
      'Content-Disposition': { description: 'attachment; filename=cuadro-reembolso.pdf' },
    },
  })
  async generarCuadroReembolso(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    try {
      // Implementar generación de PDF
      // const pdfBuffer = await this.incapacidadesService.generarCuadroReembolsoPdf(+id);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=cuadro-reembolso-${id}.pdf`);
      
      // res.send(pdfBuffer);
      res.send('PDF en desarrollo');
    } catch (error) {
      res.status(500).json({ error: 'Error al generar PDF' });
    }
  }

  @Get(':id/resumen')
  @ApiOperation({ summary: 'Obtener resumen de la planilla por tipos de incapacidad' })
  obtenerResumenPlanilla(@Param('id') id: string) {
    // Implementar en service - resumen agrupado por tipos
    return { message: `Resumen de planilla ${id}` };
  }

  @Get('reportes/por-empresa/:codPatronal')
  @ApiOperation({ summary: 'Reporte histórico de incapacidades por empresa' })
  @ApiQuery({ name: 'fechaInicio', required: true })
  @ApiQuery({ name: 'fechaFin', required: true })
  reportePorEmpresa(
    @Param('codPatronal') codPatronal: string,
    @Query('fechaInicio') fechaInicio: string,
    @Query('fechaFin') fechaFin: string,
  ) {
    // Implementar en service
    return { 
      message: `Reporte empresa ${codPatronal} desde ${fechaInicio} hasta ${fechaFin}` 
    };
  }

  @Get('reportes/por-tipo/:tipoIncapacidad')
  @ApiOperation({ summary: 'Reporte por tipo de incapacidad' })
  @ApiQuery({ name: 'fechaInicio', required: true })
  @ApiQuery({ name: 'fechaFin', required: true })
  reportePorTipo(
    @Param('tipoIncapacidad') tipoIncapacidad: string,
    @Query('fechaInicio') fechaInicio: string,
    @Query('fechaFin') fechaFin: string,
  ) {
    // Implementar en service
    return { 
      message: `Reporte tipo ${tipoIncapacidad} desde ${fechaInicio} hasta ${fechaFin}` 
    };
  }

  // =====================================================
  // ENDPOINTS VALIDACIONES
  // =====================================================

  @Get('validaciones/trabajador/:matricula/cotizaciones')
  @ApiOperation({ summary: 'Validar cotizaciones previas del trabajador' })
  @ApiQuery({ name: 'fechaReferencia', required: true })
  @ApiQuery({ name: 'tipoIncapacidad', required: true })
  validarCotizacionesTrabajador(
    @Param('matricula') matricula: string,
    @Query('fechaReferencia') fechaReferencia: string,
    @Query('tipoIncapacidad') tipoIncapacidad: string,
  ) {
    // Implementar en service
    return { 
      message: `Validar cotizaciones ${matricula} tipo ${tipoIncapacidad} fecha ${fechaReferencia}` 
    };
  }

  @Get('validaciones/planilla/:id/requisitos')
  @ApiOperation({ summary: 'Validar que la planilla cumple requisitos para presentación' })
  validarRequisitosPresentacion(@Param('id') id: string) {
    // Implementar en service
    return { message: `Validar requisitos planilla ${id}` };
  }

  // =====================================================
  // ENDPOINTS UTILITARIOS
  // =====================================================

  @Get('calcular/monto-estimado')
  @ApiOperation({ summary: 'Calcular monto estimado de reembolso' })
  @ApiQuery({ name: 'salario', required: true })
  @ApiQuery({ name: 'diasIncapacidad', required: true })
  @ApiQuery({ name: 'tipoIncapacidad', required: true })
  calcularMontoEstimado(
    @Query('salario') salario: string,
    @Query('diasIncapacidad') diasIncapacidad: string,
    @Query('tipoIncapacidad') tipoIncapacidad: string,
  ) {
    // Implementar cálculo sin persistir
    const salarioNum = parseFloat(salario);
    const diasNum = parseInt(diasIncapacidad);
    
    return { 
      salario: salarioNum,
      dias: diasNum,
      tipo: tipoIncapacidad,
      montoEstimado: 0, // Calcular según reglas
      message: 'Cálculo estimado' 
    };
  }

  // =====================================================
  // ENDPOINTS ADMINISTRATIVOS
  // =====================================================

  @Get('admin/estados/resumen')
  @ApiOperation({ summary: 'Resumen de planillas por estado' })
  resumenPorEstados() {
    // Implementar en service
    return {
      borrador: 0,
      presentado: 0,
      aprobado: 0,
      total: 0,
    };
  }

  @Get('admin/estadisticas/mensuales')
  @ApiOperation({ summary: 'Estadísticas mensuales de reembolsos' })
  @ApiQuery({ name: 'año', required: true })
  estadisticasMensuales(@Query('año') año: string) {
    // Implementar en service
    return { 
      año: año,
      meses: [],
      totalAnual: 0,
    };
  }
  








}