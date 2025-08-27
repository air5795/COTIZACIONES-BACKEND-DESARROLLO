export class CreateTiposIncapacidadDto {
    codigo: string;
    nombre: string;
    descripcion?: string;
    porcentaje_reembolso: number;
    dias_carencia?: number;
    cotizaciones_minimas?: number;
    requiere_denuncia_accidente?: boolean;
    activo?: boolean;
  }