export class CreateIncapacidadDetalleDto {
    id_incapacidad_reembolso: number;
    ci: string;
    matricula?: string;
    apellido_paterno: string;
    apellido_materno: string;
    nombres: string;
    nombre_completo: string;
    
    // Datos de la baja médica (del servicio externo)
    comprobante?: number;
    especialidad?: string;
    medico?: string;
    /* tipo_baja_original?: string; */
    
    id_tipo_incapacidad: number;
    fecha_baja_medica_inicio: Date;
    fecha_baja_medica_fin: Date;
    dias_incapacidad_inicial: number;
    
    // Estos se calcularán automáticamente, pero pueden venir del frontend
    fecha_cotizacion_del: Date;
    fecha_cotizacion_al: Date;
    salario_total?: number; // Si no viene, se busca en planillas_aportes
    observaciones?: string;
  }
  