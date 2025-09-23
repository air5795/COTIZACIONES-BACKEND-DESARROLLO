import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { DevengadosService } from './devengados.service';

@Controller('devengados')
export class DevengadosController {
  constructor(private readonly devengadosService: DevengadosService) {}

  /**
   * 📋 GET /devengados
   * Obtener lista de liquidaciones devengadas con filtros
   * Solo para administradores
   */
  @Get()
  async obtenerLiquidacionesDevengadas(@Query() query: any) {
    const filtros = {
      fechaDesde: query.fechaDesde || null,
      fechaHasta: query.fechaHasta || null,
      codPatronal: query.codPatronal || null,
      empresa: query.empresa || null,
      mes: query.mes || null,
      gestion: query.gestion || null,
    };

    return await this.devengadosService.obtenerLiquidacionesDevengadas(filtros);
  }

  /**
   * 📄 GET /devengados/:id/detalle
   * Obtener detalle específico de liquidación devengada
   * Formato para vista de reporte
   */
  @Get(':id/detalle')
  async obtenerDetalleLiquidacionDevengada(@Param('id') id: string) {
    return await this.devengadosService.obtenerDetalleLiquidacionDevengada(+id);
  }

  /**
   * 📈 GET /devengados/estadisticas
   * Obtener estadísticas generales de liquidaciones devengadas
   */
  @Get('estadisticas')
  async obtenerEstadisticasDevengadas() {
    return await this.devengadosService.obtenerEstadisticasDevengadas();
  }
}