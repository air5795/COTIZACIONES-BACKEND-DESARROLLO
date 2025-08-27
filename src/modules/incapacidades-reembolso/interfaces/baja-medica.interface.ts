export interface BajaMedicaExterna {
    ASE_MAT: string;
    ESP_NOM: string;
    MEDI_NOM: string;
    COMPROBANTE: number;
    DIAS_IMPEDIMENTO: number;
    DIA_DESDE: string;
    DIA_HASTA: string;
    FECHA_INCORPORACION: string;
    HORA_INCORPORACION: string;
    TIPO_BAJA: string;
    FECHA_REGISTRO: string;
  }
  
  export interface BajaMedicaResponse {
    ok: boolean;
    bajasDB: BajaMedicaExterna[];
  }