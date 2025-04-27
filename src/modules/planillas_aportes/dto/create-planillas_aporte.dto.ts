import { IsString, IsNumber, IsDateString, IsInt, IsOptional, Min, IsEnum } from 'class-validator';

export class CreatePlanillasAporteDto {
  @IsString()
  cod_patronal: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional() // Hacer opcional porque se calcula en el servicio
  total_importe?: number;

  @IsInt()
  @Min(0)
  @IsOptional() // Hacer opcional porque se calcula en el servicio
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

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  aporte_porcentaje?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  ufv_dia_formal?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  ufv_dia_presentacion?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  aporte_actualizado?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  monto_importe?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  multa_no_presentacion?: number;

  @IsInt()
  @IsOptional()
  dias_retraso?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  intereses?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  multa_sobre_intereses?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  total_a_cancelar?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  total_multas?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  total_tasa_interes?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  total_aportes_asuss?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  total_aportes_min_salud?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  total_a_cancelar_parcial?: number;

  @IsInt()
  @IsOptional()
  id_empresa?: number;
}