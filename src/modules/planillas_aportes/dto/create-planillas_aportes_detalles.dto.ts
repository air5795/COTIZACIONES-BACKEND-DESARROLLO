import { IsString, IsNumber, IsDateString, IsInt, IsOptional, Min } from 'class-validator';

export class CreatePlanillaAportesDetallesDto {
  @IsInt()
  id_planilla_aportes: number;

  @IsInt()
  @IsOptional()
  nro?: number;

  @IsString()
  @IsOptional()
  ci?: string;

  @IsString()
  @IsOptional()
  apellido_paterno?: string;

  @IsString()
  @IsOptional()
  apellido_materno?: string;

  @IsString()
  @IsOptional()
  nombres?: string;

  @IsString()
  @IsOptional()
  sexo?: string;

  @IsString()
  @IsOptional()
  cargo?: string;

  @IsDateString()
  @IsOptional()
  fecha_nac?: string;

  @IsDateString()
  @IsOptional()
  fecha_ingreso?: string;

  @IsDateString()
  @IsOptional()
  fecha_retiro?: string;

  @IsInt()
  @IsOptional()
  dias_pagados?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @IsOptional()
  salario?: number;

  @IsString()
  @IsOptional()
  regional?: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @IsOptional()
  haber_basico?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @IsOptional()
  bono_antiguedad?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @IsOptional()
  monto_horas_extra?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @IsOptional()
  monto_horas_extra_nocturnas?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @IsOptional()
  otros_bonos_pagos?: number;

  @IsString()
  @IsOptional()
  usuario_creacion?: string;

  @IsDateString()
  @IsOptional()
  fecha_creacion?: string;


  




}