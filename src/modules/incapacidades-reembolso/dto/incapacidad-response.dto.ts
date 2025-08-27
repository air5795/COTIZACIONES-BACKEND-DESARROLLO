export class IncapacidadResponseDto {
    id_incapacidad_reembolso: number;
    cod_patronal: string;
    fecha_planilla: Date;
    mes: string;
    gestion: string;
    estado: number;
    total_reembolso: number;
    total_trabajadores: number;
    
    // Totales por tipo
    total_enfermedad_comun: number;
    total_maternidad: number;
    total_riesgo_profesional: number;
    total_enfermedad_profesional: number;
    
    // Metadatos
    fecha_creacion: Date;
    usuario_creacion: string;
    observaciones?: string;
  }