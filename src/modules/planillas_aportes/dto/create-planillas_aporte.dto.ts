import { IsString, IsNumber, IsDateString, IsInt, IsOptional, Min, IsEnum } from 'class-validator';

export class CreatePlanillasAporteDto {
  @IsString()
  cod_patronal: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @IsOptional() 
  total_importe?: number;

  @IsInt()
  @Min(0)
  @IsOptional() 
  total_trabaj?: number;

  @IsString()
  mes: string;

  @IsString()
  gestion: string;

  @IsString()
  @IsOptional()
  tipo_planilla?: string;

  @IsInt()
  @IsOptional()
  estado?: number;

  @IsString()
  @IsOptional()
  usuario_creacion?: string;

  @IsString()
  @IsOptional()
  nombre_creacion?: string;

  @IsDateString()
  @IsOptional()
  fecha_creacion?: string;

  @IsString()
  @IsOptional()
  observaciones?: string;

  @IsDateString()
  @IsOptional()
  fecha_planilla?: string;

  @IsDateString()
  @IsOptional()
  fecha_declarada?: string;

  @IsDateString()
  @IsOptional()
  fecha_pago?: string;

  @IsDateString()
  @IsOptional()
  fecha_liquidacion?: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  aporte_porcentaje?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  ufv_dia_formal?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  ufv_dia_presentacion?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  aporte_actualizado?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  monto_importe?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  multa_no_presentacion?: number;

  @IsInt()
  @IsOptional()
  dias_retraso?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  intereses?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  multa_sobre_intereses?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  total_a_cancelar?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  total_multas?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  total_tasa_interes?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  total_aportes_asuss?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  total_aportes_min_salud?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  total_a_cancelar_parcial?: number;

  @IsInt()
  @IsOptional()
  id_empresa?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  total_deducciones?: number;

  @IsOptional()
  aplica_descuento_min_salud?: boolean;

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  otros_descuentos?: number;

  @IsString()
  @IsOptional()
  motivo_otros_descuentos?: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  excedente?: number;

  @IsString()
  @IsOptional()
  motivo_excedente?: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  cotizacion_tasa: number;

  @IsOptional()
  @IsInt()
  id_planilla_origen?: number;

  @IsString()
  @IsOptional()
  tipo?: 'mensual' | 'planilla_adicional ' | 'retroactivo';


}