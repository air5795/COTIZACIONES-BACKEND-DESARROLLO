// ===============================================================
// INTERFACES PARA EL DASHBOARD DE APORTES
// ===============================================================
// Este archivo solo contiene interfaces, las entidades se importan desde sus módulos correspondientes

export interface DashboardSummary {
    totalPlanillas: number;
    totalTrabajadores: number;
    totalAportes: number;
    totalMultas: number;
    totalIntereses: number;
    planillasPendientes: number;
    planillasProcesadas: number;
    planillasPagadas: number;
    diasRetrasoPromedio: number;
  }
  
  export interface DashboardChartData {
    periodo: string;
    valor: number;
    variacion?: number;
  }
  
  export interface DashboardEmpresaRanking {
    nombreEmpresa: string;
    codigoPatronal: string;
    totalAportes: number;
    totalTrabajadores: number;
    estadoCumplimiento: string;
    promedioDiasRetraso: number;
  }
  
  export interface DashboardAlert {
    id: number;
    tipo: string;
    descripcion: string;
    prioridad: string;
    empresa: string;
    monto: number;
    diasRetraso: number;
    fecha: Date;
  }
  
  export interface DashboardEstadoDistribucion {
    estado: number;
    descripcion: string;
    cantidad: number;
    montoTotal: number;
  }
  
  export interface DashboardComparativa {
    planillas: {
      actual: number;
      anterior: number;
      variacion: number;
    };
    trabajadores: {
      actual: number;
      anterior: number;
      variacion: number;
    };
    aportes: {
      actual: number;
      anterior: number;
      variacion: number;
    };
  }
  
  export interface DashboardCompleto {
    metricas: DashboardSummary;
    tendencias: {
      aportes: DashboardChartData[];
      trabajadores: DashboardChartData[];
    };
    topEmpresas: DashboardEmpresaRanking[];
    alertas: DashboardAlert[];
    distribucionEstados: DashboardEstadoDistribucion[];
    comparativas: DashboardComparativa;
    ultimaActualizacion: Date;
  }