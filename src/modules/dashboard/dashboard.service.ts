import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

// Importar entidades desde sus módulos existentes
import { PlanillasAporte } from '../planillas_aportes/entities/planillas_aporte.entity';
import { Empresa } from '../empresas/entities/empresa.entity';
import { PagoAporte } from '../pagos-aportes/entities/pagos-aporte.entity';

// Importar interfaces locales
import { 
  DashboardSummary,
  DashboardChartData,
  DashboardEmpresaRanking,
  DashboardAlert,
  DashboardEstadoDistribucion,
  DashboardComparativa,
  DashboardCompleto
} from './entities/dashboard.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(PlanillasAporte)
    private readonly planillasRepository: Repository<PlanillasAporte>,
    
    @InjectRepository(Empresa)
    private readonly empresasRepository: Repository<Empresa>,
    
    @InjectRepository(PagoAporte)
    private readonly pagosRepository: Repository<PagoAporte>,
    
    private readonly dataSource: DataSource,
  ) {}

  // ===============================================================
  // MÉTRICAS PRINCIPALES DEL DASHBOARD
  // ===============================================================

  async getSummaryMetrics(mes?: string, gestion?: string): Promise<DashboardSummary> {
    try {
      const currentDate = new Date();
      const targetMes = mes || (currentDate.getMonth() + 1).toString().padStart(2, '0');
      const targetGestion = gestion || currentDate.getFullYear().toString();

      const query = `
        SELECT 
          COALESCE(COUNT(*), 0) as total_planillas,
          COALESCE(SUM(total_trabaj), 0) as total_trabajadores,
          COALESCE(SUM(total_importe), 0) as total_aportes,
          COALESCE(SUM(total_multas), 0) as total_multas,
          COALESCE(SUM(intereses), 0) as total_intereses,
          COALESCE(SUM(CASE WHEN estado = 1 THEN 1 ELSE 0 END), 0) as planillas_pendientes,
          COALESCE(SUM(CASE WHEN estado = 2 THEN 1 ELSE 0 END), 0) as planillas_procesadas,
          COALESCE(SUM(CASE WHEN estado = 3 THEN 1 ELSE 0 END), 0) as planillas_pagadas,
          COALESCE(AVG(NULLIF(dias_retraso, 0)), 0) as dias_retraso_promedio
        FROM transversales.planillas_aportes 
        WHERE mes = $1 AND gestion = $2
      `;

      const result = await this.dataSource.query(query, [targetMes, targetGestion]);
      
      return {
        totalPlanillas: parseInt(result[0]?.total_planillas || 0),
        totalTrabajadores: parseInt(result[0]?.total_trabajadores || 0),
        totalAportes: parseFloat(result[0]?.total_aportes || 0),
        totalMultas: parseFloat(result[0]?.total_multas || 0),
        totalIntereses: parseFloat(result[0]?.total_intereses || 0),
        planillasPendientes: parseInt(result[0]?.planillas_pendientes || 0),
        planillasProcesadas: parseInt(result[0]?.planillas_procesadas || 0),
        planillasPagadas: parseInt(result[0]?.planillas_pagadas || 0),
        diasRetrasoPromedio: parseFloat(result[0]?.dias_retraso_promedio || 0),
      };
    } catch (error) {
      console.error('Error obteniendo métricas del dashboard:', error);
      throw error;
    }
  }

  // ===============================================================
  // DATOS PARA GRÁFICOS DE TENDENCIAS
  // ===============================================================

  async getTendenciasMensuales(gestion: string, mesesAtras: number = 12): Promise<DashboardChartData[]> {
    try {
      const query = `
        SELECT 
          CONCAT(gestion, '-', LPAD(mes, 2, '0')) as periodo,
          mes,
          gestion,
          COALESCE(SUM(total_importe), 0) as valor
        FROM transversales.planillas_aportes 
        WHERE gestion >= $1 
        GROUP BY gestion, mes
        ORDER BY gestion DESC, mes DESC
        LIMIT $2
      `;

      const result = await this.dataSource.query(query, [
        (parseInt(gestion) - Math.floor(mesesAtras/12)).toString(),
        mesesAtras
      ]);

      return result.map(row => ({
        periodo: row.periodo,
        valor: parseFloat(row.valor || 0)
      }));
    } catch (error) {
      console.error('Error obteniendo tendencias mensuales:', error);
      throw error;
    }
  }

  async getTendenciasTrabajadores(gestion: string, mesesAtras: number = 12): Promise<DashboardChartData[]> {
    try {
      const query = `
        SELECT 
          CONCAT(gestion, '-', LPAD(mes, 2, '0')) as periodo,
          COALESCE(SUM(total_trabaj), 0) as valor
        FROM transversales.planillas_aportes 
        WHERE gestion >= $1 
        GROUP BY gestion, mes
        ORDER BY gestion DESC, mes DESC
        LIMIT $2
      `;

      const result = await this.dataSource.query(query, [
        (parseInt(gestion) - Math.floor(mesesAtras/12)).toString(),
        mesesAtras
      ]);

      return result.map(row => ({
        periodo: row.periodo,
        valor: parseInt(row.valor || 0)
      }));
    } catch (error) {
      console.error('Error obteniendo tendencias de trabajadores:', error);
      throw error;
    }
  }

  // ===============================================================
  // RANKING DE EMPRESAS
  // ===============================================================

  async getTopEmpresas(mes?: string, gestion?: string, limit: number = 10): Promise<DashboardEmpresaRanking[]> {
    try {
      const currentDate = new Date();
      const targetMes = mes || (currentDate.getMonth() + 1).toString().padStart(2, '0');
      const targetGestion = gestion || currentDate.getFullYear().toString();

      const query = `
        SELECT 
          e.emp_nom as nombre_empresa,
          p.cod_patronal as codigo_patronal,
          COALESCE(SUM(p.total_importe), 0) as total_aportes,
          COALESCE(SUM(p.total_trabaj), 0) as total_trabajadores,
          COALESCE(AVG(NULLIF(p.dias_retraso, 0)), 0) as promedio_dias_retraso,
          CASE 
            WHEN AVG(NULLIF(p.dias_retraso, 0)) IS NULL OR AVG(NULLIF(p.dias_retraso, 0)) = 0 THEN 'EXCELENTE'
            WHEN AVG(NULLIF(p.dias_retraso, 0)) <= 5 THEN 'BUENO'
            WHEN AVG(NULLIF(p.dias_retraso, 0)) <= 15 THEN 'REGULAR'
            ELSE 'MALO'
          END as estado_cumplimiento
        FROM transversales.planillas_aportes p
        LEFT JOIN transversales.empresa e ON p.id_empresa = e.id_empresa
        WHERE p.mes = $1 AND p.gestion = $2
        GROUP BY e.emp_nom, p.cod_patronal
        ORDER BY total_aportes DESC
        LIMIT $3
      `;

      const result = await this.dataSource.query(query, [targetMes, targetGestion, limit]);

      return result.map(row => ({
        nombreEmpresa: row.nombre_empresa || 'Empresa sin nombre',
        codigoPatronal: row.codigo_patronal,
        totalAportes: parseFloat(row.total_aportes || 0),
        totalTrabajadores: parseInt(row.total_trabajadores || 0),
        estadoCumplimiento: row.estado_cumplimiento,
        promedioDiasRetraso: parseFloat(row.promedio_dias_retraso || 0),
      }));
    } catch (error) {
      console.error('Error obteniendo ranking de empresas:', error);
      throw error;
    }
  }

  // ===============================================================
  // ALERTAS DEL DASHBOARD
  // ===============================================================

  async getAlertas(limit: number = 20): Promise<DashboardAlert[]> {
    try {
      const query = `
        SELECT 
          p.id_planilla_aportes as id,
          CASE 
            WHEN p.dias_retraso > 30 THEN 'RETRASO_CRITICO'
            WHEN p.dias_retraso > 15 THEN 'RETRASO_ALTO'
            WHEN p.total_multas > 10000 THEN 'MULTA_ALTA'
            WHEN p.estado = 1 AND p.fecha_planilla < CURRENT_DATE - INTERVAL '15 days' THEN 'PLANILLA_VENCIDA'
            ELSE 'NORMAL'
          END as tipo_alerta,
          CASE 
            WHEN p.dias_retraso > 30 THEN CONCAT('Planilla con retraso crítico de ', p.dias_retraso, ' días')
            WHEN p.dias_retraso > 15 THEN CONCAT('Planilla con retraso alto de ', p.dias_retraso, ' días')
            WHEN p.total_multas > 10000 THEN CONCAT('Multa elevada de Bs. ', p.total_multas)
            WHEN p.estado = 1 AND p.fecha_planilla < CURRENT_DATE - INTERVAL '15 days' THEN 'Planilla pendiente hace más de 15 días'
            ELSE 'Sin alertas'
          END as descripcion,
          CASE 
            WHEN p.dias_retraso > 30 OR p.total_multas > 20000 THEN 'ALTA'
            WHEN p.dias_retraso > 15 OR p.total_multas > 10000 THEN 'MEDIA'
            ELSE 'BAJA'
          END as prioridad,
          COALESCE(e.emp_nom, 'Empresa sin nombre') as empresa,
          p.cod_patronal,
          COALESCE(p.total_a_cancelar, p.total_importe) as monto,
          COALESCE(p.dias_retraso, 0) as dias_retraso,
          p.fecha_creacion as fecha
        FROM transversales.planillas_aportes p
        LEFT JOIN transversales.empresa e ON p.id_empresa = e.id_empresa
        WHERE (
          p.dias_retraso > 15 
          OR p.total_multas > 10000 
          OR (p.estado = 1 AND p.fecha_planilla < CURRENT_DATE - INTERVAL '15 days')
        )
        ORDER BY 
          CASE 
            WHEN p.dias_retraso > 30 OR p.total_multas > 20000 THEN 1
            WHEN p.dias_retraso > 15 OR p.total_multas > 10000 THEN 2
            ELSE 3
          END,
          p.dias_retraso DESC,
          p.total_multas DESC
        LIMIT $1
      `;

      const result = await this.dataSource.query(query, [limit]);

      return result.map(row => ({
        id: row.id,
        tipo: row.tipo_alerta,
        descripcion: row.descripcion,
        prioridad: row.prioridad,
        empresa: row.empresa,
        monto: parseFloat(row.monto || 0),
        diasRetraso: parseInt(row.dias_retraso || 0),
        fecha: row.fecha,
      }));
    } catch (error) {
      console.error('Error obteniendo alertas:', error);
      throw error;
    }
  }

  // ===============================================================
  // DISTRIBUCIÓN POR ESTADO
  // ===============================================================

  async getDistribucionEstados(mes?: string, gestion?: string): Promise<DashboardEstadoDistribucion[]> {
    try {
      const currentDate = new Date();
      const targetMes = mes || (currentDate.getMonth() + 1).toString().padStart(2, '0');
      const targetGestion = gestion || currentDate.getFullYear().toString();

      const query = `
        SELECT 
          estado,
          CASE 
            WHEN estado = 1 THEN 'PENDIENTE'
            WHEN estado = 2 THEN 'PROCESADA'
            WHEN estado = 3 THEN 'PAGADA'
            WHEN estado = 4 THEN 'ANULADA'
            ELSE 'DESCONOCIDO'
          END as estado_descripcion,
          COUNT(*) as cantidad,
          COALESCE(SUM(total_importe), 0) as monto_total
        FROM transversales.planillas_aportes 
        WHERE mes = $1 AND gestion = $2
        GROUP BY estado
        ORDER BY estado
      `;

      const result = await this.dataSource.query(query, [targetMes, targetGestion]);

      return result.map(row => ({
        estado: row.estado,
        descripcion: row.estado_descripcion,
        cantidad: parseInt(row.cantidad),
        montoTotal: parseFloat(row.monto_total || 0),
      }));
    } catch (error) {
      console.error('Error obteniendo distribución por estados:', error);
      throw error;
    }
  }

  // ===============================================================
  // MÉTRICAS COMPARATIVAS (MES ACTUAL VS ANTERIOR)
  // ===============================================================

  async getComparativasMensuales(mes?: string, gestion?: string): Promise<DashboardComparativa> {
    try {
      const currentDate = new Date();
      const targetMes = mes || (currentDate.getMonth() + 1).toString().padStart(2, '0');
      const targetGestion = gestion || currentDate.getFullYear().toString();

      // Calcular mes anterior
      const mesAnterior = targetMes === '01' ? '12' : (parseInt(targetMes) - 1).toString().padStart(2, '0');
      const gestionAnterior = targetMes === '01' ? (parseInt(targetGestion) - 1).toString() : targetGestion;

      const query = `
        WITH mes_actual AS (
          SELECT 
            COUNT(*) as planillas,
            COALESCE(SUM(total_trabaj), 0) as trabajadores,
            COALESCE(SUM(total_importe), 0) as aportes
          FROM transversales.planillas_aportes 
          WHERE mes = $1 AND gestion = $2
        ),
        mes_anterior AS (
          SELECT 
            COUNT(*) as planillas,
            COALESCE(SUM(total_trabaj), 0) as trabajadores,
            COALESCE(SUM(total_importe), 0) as aportes
          FROM transversales.planillas_aportes 
          WHERE mes = $3 AND gestion = $4
        )
        SELECT 
          ma.planillas as planillas_actual,
          man.planillas as planillas_anterior,
          ma.trabajadores as trabajadores_actual,
          man.trabajadores as trabajadores_anterior,
          ma.aportes as aportes_actual,
          man.aportes as aportes_anterior
        FROM mes_actual ma, mes_anterior man
      `;

      const result = await this.dataSource.query(query, [targetMes, targetGestion, mesAnterior, gestionAnterior]);

      if (result.length === 0) {
        return {
          planillas: { actual: 0, anterior: 0, variacion: 0 },
          trabajadores: { actual: 0, anterior: 0, variacion: 0 },
          aportes: { actual: 0, anterior: 0, variacion: 0 },
        };
      }

      const data = result[0];
      
      return {
        planillas: {
          actual: parseInt(data.planillas_actual || 0),
          anterior: parseInt(data.planillas_anterior || 0),
          variacion: this.calcularVariacion(data.planillas_actual, data.planillas_anterior),
        },
        trabajadores: {
          actual: parseInt(data.trabajadores_actual || 0),
          anterior: parseInt(data.trabajadores_anterior || 0),
          variacion: this.calcularVariacion(data.trabajadores_actual, data.trabajadores_anterior),
        },
        aportes: {
          actual: parseFloat(data.aportes_actual || 0),
          anterior: parseFloat(data.aportes_anterior || 0),
          variacion: this.calcularVariacion(data.aportes_actual, data.aportes_anterior),
        },
      };
    } catch (error) {
      console.error('Error obteniendo comparativas mensuales:', error);
      throw error;
    }
  }

  // ===============================================================
  // MÉTODOS AUXILIARES
  // ===============================================================

  private calcularVariacion(actual: number, anterior: number): number {
    if (!anterior || anterior === 0) {
      return actual > 0 ? 100 : 0;
    }
    return parseFloat((((actual - anterior) / anterior) * 100).toFixed(2));
  }

  // ===============================================================
  // RESUMEN COMPLETO DEL DASHBOARD
  // ===============================================================

  async getDashboardCompleto(mes?: string, gestion?: string): Promise<DashboardCompleto> {
    try {
      const [
        metricas,
        tendenciasAportes,
        tendenciasTrabajadores,
        topEmpresas,
        alertas,
        distribucion,
        comparativas
      ] = await Promise.all([
        this.getSummaryMetrics(mes, gestion),
        this.getTendenciasMensuales(gestion || new Date().getFullYear().toString(), 6),
        this.getTendenciasTrabajadores(gestion || new Date().getFullYear().toString(), 6),
        this.getTopEmpresas(mes, gestion, 5),
        this.getAlertas(10),
        this.getDistribucionEstados(mes, gestion),
        this.getComparativasMensuales(mes, gestion),
      ]);

      return {
        metricas,
        tendencias: {
          aportes: tendenciasAportes,
          trabajadores: tendenciasTrabajadores,
        },
        topEmpresas,
        alertas,
        distribucionEstados: distribucion,
        comparativas,
        ultimaActualizacion: new Date(),
      };
    } catch (error) {
      console.error('Error obteniendo dashboard completo:', error);
      throw error;
    }
  }
}