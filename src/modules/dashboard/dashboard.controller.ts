import { 
  Controller, 
  Get, 
  Query, 
  Headers,
  UseGuards,
  HttpStatus 
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiQuery,
  ApiBearerAuth 
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { ResponseUtil } from '../../core/utility/response-util';

@ApiTags('Dashboard Aportes')
@Controller('dashboard')
// @UseGuards(JwtAuthGuard) // Descomenta si usas autenticación
// @ApiBearerAuth() // Descomenta si usas autenticación
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // ===============================================================
  // DASHBOARD COMPLETO
  // ===============================================================

  @Get()
  @ApiOperation({ 
    summary: 'Obtener dashboard completo de aportes',
    description: 'Retorna todas las métricas, tendencias, rankings y alertas del dashboard en una sola llamada.'
  })
  @ApiQuery({ 
    name: 'mes', 
    required: false, 
    description: 'Mes a consultar (formato: 01-12). Por defecto: mes actual',
    example: '08'
  })
  @ApiQuery({ 
    name: 'gestion', 
    required: false, 
    description: 'Año a consultar. Por defecto: año actual',
    example: '2024'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Dashboard obtenido exitosamente',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'number', example: 200 },
        message: { type: 'string', example: 'Dashboard obtenido exitosamente' },
        data: {
          type: 'object',
          properties: {
            metricas: {
              type: 'object',
              properties: {
                totalPlanillas: { type: 'number', example: 150 },
                totalTrabajadores: { type: 'number', example: 5420 },
                totalAportes: { type: 'number', example: 2450000.50 },
                totalMultas: { type: 'number', example: 125000.00 },
                totalIntereses: { type: 'number', example: 45000.25 },
                planillasPendientes: { type: 'number', example: 25 },
                planillasProcesadas: { type: 'number', example: 120 },
                planillasPagadas: { type: 'number', example: 5 },
                diasRetrasoPromedio: { type: 'number', example: 12.5 }
              }
            },
            tendencias: {
              type: 'object',
              properties: {
                aportes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      periodo: { type: 'string', example: '2024-08' },
                      valor: { type: 'number', example: 2450000.50 }
                    }
                  }
                },
                trabajadores: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      periodo: { type: 'string', example: '2024-08' },
                      valor: { type: 'number', example: 5420 }
                    }
                  }
                }
              }
            },
            topEmpresas: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  nombreEmpresa: { type: 'string', example: 'EMPRESA MINERA ABC' },
                  codigoPatronal: { type: 'string', example: '1234567-8' },
                  totalAportes: { type: 'number', example: 500000.00 },
                  totalTrabajadores: { type: 'number', example: 250 },
                  estadoCumplimiento: { type: 'string', example: 'EXCELENTE' },
                  promedioDiasRetraso: { type: 'number', example: 2.5 }
                }
              }
            },
            alertas: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number', example: 123 },
                  tipo: { type: 'string', example: 'RETRASO_ALTO' },
                  descripcion: { type: 'string', example: 'Planilla con retraso alto de 20 días' },
                  prioridad: { type: 'string', example: 'MEDIA' },
                  empresa: { type: 'string', example: 'EMPRESA XYZ' },
                  monto: { type: 'number', example: 75000.00 },
                  diasRetraso: { type: 'number', example: 20 }
                }
              }
            },
            distribucionEstados: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  estado: { type: 'number', example: 1 },
                  descripcion: { type: 'string', example: 'PENDIENTE' },
                  cantidad: { type: 'number', example: 25 },
                  montoTotal: { type: 'number', example: 850000.00 }
                }
              }
            },
            comparativas: {
              type: 'object',
              properties: {
                planillas: {
                  type: 'object',
                  properties: {
                    actual: { type: 'number', example: 150 },
                    anterior: { type: 'number', example: 142 },
                    variacion: { type: 'number', example: 5.63 }
                  }
                },
                trabajadores: {
                  type: 'object',
                  properties: {
                    actual: { type: 'number', example: 5420 },
                    anterior: { type: 'number', example: 5280 },
                    variacion: { type: 'number', example: 2.65 }
                  }
                },
                aportes: {
                  type: 'object',
                  properties: {
                    actual: { type: 'number', example: 2450000.50 },
                    anterior: { type: 'number', example: 2320000.00 },
                    variacion: { type: 'number', example: 5.60 }
                  }
                }
              }
            },
            ultimaActualizacion: { type: 'string', format: 'date-time' }
          }
        }
      }
    }
  })
  async getDashboardCompleto(
    @Query('mes') mes?: string,
    @Query('gestion') gestion?: string,
    @Headers('usuario') usuario: string = 'SYSTEM'
  ) {
    try {
      const dashboardData = await this.dashboardService.getDashboardCompleto(mes, gestion);
      
      return ResponseUtil.success(
        dashboardData,
        'Dashboard obtenido exitosamente',
      );
    } catch (error) {
      return ResponseUtil.error(
        'Error al obtener el dashboard',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ===============================================================
  // MÉTRICAS PRINCIPALES
  // ===============================================================

  @Get('metricas')
  @ApiOperation({ 
    summary: 'Obtener métricas principales del dashboard',
    description: 'Retorna KPIs principales como total de planillas, trabajadores, aportes, etc.'
  })
  @ApiQuery({ name: 'mes', required: false, description: 'Mes a consultar (01-12)' })
  @ApiQuery({ name: 'gestion', required: false, description: 'Año a consultar' })
  @ApiResponse({ 
    status: 200, 
    description: 'Métricas obtenidas exitosamente',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'number', example: 200 },
        message: { type: 'string', example: 'Métricas obtenidas exitosamente' },
        data: {
          type: 'object',
          properties: {
            totalPlanillas: { type: 'number', example: 150 },
            totalTrabajadores: { type: 'number', example: 5420 },
            totalAportes: { type: 'number', example: 2450000.50 },
            totalMultas: { type: 'number', example: 125000.00 },
            totalIntereses: { type: 'number', example: 45000.25 },
            planillasPendientes: { type: 'number', example: 25 },
            planillasProcesadas: { type: 'number', example: 120 },
            planillasPagadas: { type: 'number', example: 5 },
            diasRetrasoPromedio: { type: 'number', example: 12.5 }
          }
        }
      }
    }
  })
  async getMetricas(
    @Query('mes') mes?: string,
    @Query('gestion') gestion?: string
  ) {
    try {
      const metricas = await this.dashboardService.getSummaryMetrics(mes, gestion);
      
      return ResponseUtil.success(
        metricas,
        'Métricas obtenidas exitosamente',
        
      );
    } catch (error) {
      return ResponseUtil.error(
        'Error al obtener las métricas',
        HttpStatus.INTERNAL_SERVER_ERROR,
        
      );
    }
  }

  // ===============================================================
  // TENDENCIAS MENSUALES
  // ===============================================================

  @Get('tendencias/aportes')
  @ApiOperation({ 
    summary: 'Obtener tendencias de aportes mensuales',
    description: 'Retorna datos históricos de aportes para gráficos de tendencias.'
  })
  @ApiQuery({ name: 'gestion', required: false, description: 'Año base para el cálculo' })
  @ApiQuery({ name: 'meses', required: false, description: 'Cantidad de meses hacia atrás', example: 12 })
  @ApiResponse({ 
    status: 200, 
    description: 'Tendencias de aportes obtenidas exitosamente',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'number', example: 200 },
        message: { type: 'string', example: 'Tendencias de aportes obtenidas exitosamente' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              periodo: { type: 'string', example: '2024-08' },
              valor: { type: 'number', example: 2450000.50 }
            }
          }
        }
      }
    }
  })
  async getTendenciasAportes(
    @Query('gestion') gestion?: string,
    @Query('meses') meses?: string
  ) {
    try {
      const mesesAtras = meses ? parseInt(meses) : 12;
      const tendencias = await this.dashboardService.getTendenciasMensuales(
        gestion || new Date().getFullYear().toString(), 
        mesesAtras
      );
      
      return ResponseUtil.success(
        tendencias,
        'Tendencias de aportes obtenidas exitosamente',
        
      );
    } catch (error) {
      return ResponseUtil.error(
        'Error al obtener tendencias de aportes',
        HttpStatus.INTERNAL_SERVER_ERROR,
        
      );
    }
  }

  @Get('tendencias/trabajadores')
  @ApiOperation({ 
    summary: 'Obtener tendencias de trabajadores mensuales',
    description: 'Retorna datos históricos del número de trabajadores para gráficos de tendencias.'
  })
  @ApiQuery({ name: 'gestion', required: false, description: 'Año base para el cálculo' })
  @ApiQuery({ name: 'meses', required: false, description: 'Cantidad de meses hacia atrás', example: 12 })
  @ApiResponse({ 
    status: 200, 
    description: 'Tendencias de trabajadores obtenidas exitosamente',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'number', example: 200 },
        message: { type: 'string', example: 'Tendencias de trabajadores obtenidas exitosamente' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              periodo: { type: 'string', example: '2024-08' },
              valor: { type: 'number', example: 5420 }
            }
          }
        }
      }
    }
  })
  async getTendenciasTrabajadores(
    @Query('gestion') gestion?: string,
    @Query('meses') meses?: string
  ) {
    try {
      const mesesAtras = meses ? parseInt(meses) : 12;
      const tendencias = await this.dashboardService.getTendenciasTrabajadores(
        gestion || new Date().getFullYear().toString(), 
        mesesAtras
      );
      
      return ResponseUtil.success(
        tendencias,
        'Tendencias de trabajadores obtenidas exitosamente',
        
      );
    } catch (error) {
      return ResponseUtil.error(
        'Error al obtener tendencias de trabajadores',
        HttpStatus.INTERNAL_SERVER_ERROR,
        
      );
    }
  }

  // ===============================================================
  // RANKING DE EMPRESAS
  // ===============================================================

  @Get('empresas/ranking')
  @ApiOperation({ 
    summary: 'Obtener ranking de empresas por aportes',
    description: 'Retorna las empresas con mayores aportes y su estado de cumplimiento.'
  })
  @ApiQuery({ name: 'mes', required: false, description: 'Mes a consultar' })
  @ApiQuery({ name: 'gestion', required: false, description: 'Año a consultar' })
  @ApiQuery({ name: 'limit', required: false, description: 'Cantidad de empresas a retornar', example: 10 })
  @ApiResponse({ 
    status: 200, 
    description: 'Ranking de empresas obtenido exitosamente',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'number', example: 200 },
        message: { type: 'string', example: 'Ranking de empresas obtenido exitosamente' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nombreEmpresa: { type: 'string', example: 'EMPRESA MINERA ABC' },
              codigoPatronal: { type: 'string', example: '1234567-8' },
              totalAportes: { type: 'number', example: 500000.00 },
              totalTrabajadores: { type: 'number', example: 250 },
              estadoCumplimiento: { type: 'string', example: 'EXCELENTE' },
              promedioDiasRetraso: { type: 'number', example: 2.5 }
            }
          }
        }
      }
    }
  })
  async getRankingEmpresas(
    @Query('mes') mes?: string,
    @Query('gestion') gestion?: string,
    @Query('limit') limit?: string
  ) {
    try {
      const limitNum = limit ? parseInt(limit) : 10;
      const ranking = await this.dashboardService.getTopEmpresas(mes, gestion, limitNum);
      
      return ResponseUtil.success(
        ranking,
        'Ranking de empresas obtenido exitosamente',
        
      );
    } catch (error) {
      return ResponseUtil.error(
        'Error al obtener ranking de empresas',
        HttpStatus.INTERNAL_SERVER_ERROR,
        
      );
    }
  }

  // ===============================================================
  // ALERTAS Y NOTIFICACIONES
  // ===============================================================

  @Get('alertas')
  @ApiOperation({ 
    summary: 'Obtener alertas del dashboard',
    description: 'Retorna alertas de retrasos, multas altas y planillas vencidas.'
  })
  @ApiQuery({ name: 'limit', required: false, description: 'Cantidad de alertas a retornar', example: 20 })
  @ApiResponse({ 
    status: 200, 
    description: 'Alertas obtenidas exitosamente',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'number', example: 200 },
        message: { type: 'string', example: 'Alertas obtenidas exitosamente' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number', example: 123 },
              tipo: { type: 'string', example: 'RETRASO_ALTO' },
              descripcion: { type: 'string', example: 'Planilla con retraso alto de 20 días' },
              prioridad: { type: 'string', example: 'MEDIA' },
              empresa: { type: 'string', example: 'EMPRESA XYZ' },
              monto: { type: 'number', example: 75000.00 },
              diasRetraso: { type: 'number', example: 20 }
            }
          }
        }
      }
    }
  })
  async getAlertas(@Query('limit') limit?: string) {
    try {
      const limitNum = limit ? parseInt(limit) : 20;
      const alertas = await this.dashboardService.getAlertas(limitNum);
      
      return ResponseUtil.success(
        alertas,
        'Alertas obtenidas exitosamente',
        
      );
    } catch (error) {
      return ResponseUtil.error(
        'Error al obtener alertas',
        HttpStatus.INTERNAL_SERVER_ERROR,
        
      );
    }
  }

  // ===============================================================
  // DISTRIBUCIÓN POR ESTADOS
  // ===============================================================

  @Get('distribucion/estados')
  @ApiOperation({ 
    summary: 'Obtener distribución de planillas por estado',
    description: 'Retorna la cantidad y montos de planillas agrupadas por estado (Pendiente, Procesada, Pagada).'
  })
  @ApiQuery({ name: 'mes', required: false, description: 'Mes a consultar' })
  @ApiQuery({ name: 'gestion', required: false, description: 'Año a consultar' })
  @ApiResponse({ 
    status: 200, 
    description: 'Distribución por estados obtenida exitosamente',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'number', example: 200 },
        message: { type: 'string', example: 'Distribución por estados obtenida exitosamente' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              estado: { type: 'number', example: 1 },
              descripcion: { type: 'string', example: 'PENDIENTE' },
              cantidad: { type: 'number', example: 25 },
              montoTotal: { type: 'number', example: 850000.00 }
            }
          }
        }
      }
    }
  })
  async getDistribucionEstados(
    @Query('mes') mes?: string,
    @Query('gestion') gestion?: string
  ) {
    try {
      const distribucion = await this.dashboardService.getDistribucionEstados(mes, gestion);
      
      return ResponseUtil.success(
        distribucion,
        'Distribución por estados obtenida exitosamente',
        
      );
    } catch (error) {
      return ResponseUtil.error(
        'Error al obtener distribución por estados',
        HttpStatus.INTERNAL_SERVER_ERROR,
        
      );
    }
  }

  // ===============================================================
  // COMPARATIVAS MENSUALES
  // ===============================================================

  @Get('comparativas')
  @ApiOperation({ 
    summary: 'Obtener comparativas del mes actual vs anterior',
    description: 'Retorna comparación de métricas entre mes actual y anterior con variaciones porcentuales.'
  })
  @ApiQuery({ name: 'mes', required: false, description: 'Mes a consultar' })
  @ApiQuery({ name: 'gestion', required: false, description: 'Año a consultar' })
  @ApiResponse({ 
    status: 200, 
    description: 'Comparativas mensuales obtenidas exitosamente',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'number', example: 200 },
        message: { type: 'string', example: 'Comparativas mensuales obtenidas exitosamente' },
        data: {
          type: 'object',
          properties: {
            planillas: {
              type: 'object',
              properties: {
                actual: { type: 'number', example: 150 },
                anterior: { type: 'number', example: 142 },
                variacion: { type: 'number', example: 5.63 }
              }
            },
            trabajadores: {
              type: 'object',
              properties: {
                actual: { type: 'number', example: 5420 },
                anterior: { type: 'number', example: 5280 },
                variacion: { type: 'number', example: 2.65 }
              }
            },
            aportes: {
              type: 'object',
              properties: {
                actual: { type: 'number', example: 2450000.50 },
                anterior: { type: 'number', example: 2320000.00 },
                variacion: { type: 'number', example: 5.60 }
              }
            }
          }
        }
      }
    }
  })
  async getComparativasMensuales(
    @Query('mes') mes?: string,
    @Query('gestion') gestion?: string
  ) {
    try {
      const comparativas = await this.dashboardService.getComparativasMensuales(mes, gestion);
      
      return ResponseUtil.success(
        comparativas,
        'Comparativas mensuales obtenidas exitosamente',
        
      );
    } catch (error) {
      return ResponseUtil.error(
        'Error al obtener comparativas mensuales',
        HttpStatus.INTERNAL_SERVER_ERROR,
        
      );
    }
  }

  // ===============================================================
  // ENDPOINT DE SALUD DEL DASHBOARD
  // ===============================================================

  @Get('health')
  @ApiOperation({ 
    summary: 'Verificar estado del dashboard',
    description: 'Endpoint para verificar que el servicio de dashboard esté funcionando correctamente.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Dashboard funcionando correctamente',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'number', example: 200 },
        message: { type: 'string', example: 'Dashboard funcionando correctamente' },
        data: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'OK' },
            timestamp: { type: 'string', format: 'date-time' },
            service: { type: 'string', example: 'Dashboard Aportes' },
            version: { type: 'string', example: '1.0.0' }
          }
        }
      }
    }
  })
  async getHealthCheck() {
    try {
      const timestamp = new Date();
      
      return ResponseUtil.success(
        {
          status: 'OK',
          timestamp,
          service: 'Dashboard Aportes',
          version: '1.0.0'
        },
        'Dashboard funcionando correctamente',
        
      );
    } catch (error) {
      return ResponseUtil.error(
        'Error en el servicio de dashboard',
        HttpStatus.INTERNAL_SERVER_ERROR,
        
      );
    }
  }
}