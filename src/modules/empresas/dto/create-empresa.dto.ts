import { IsString, IsInt, IsOptional, IsNumber, IsDateString } from 'class-validator';

export class CreateEmpresaDto {
  @IsInt()
  emp_cod: number;

  @IsString()
  emp_reg: string;

  @IsString()
  cod_patronal: string;

  @IsString()
  emp_nom: string;

  @IsString()
  @IsOptional()
  emp_legal?: string;

  @IsString()
  @IsOptional()
  emp_activ?: string;

  @IsInt()
  @IsOptional()
  emp_ntrab?: number;

  @IsString()
  @IsOptional()
  emp_calle?: string;

  @IsString()
  @IsOptional()
  emp_num?: string;

  @IsString()
  @IsOptional()
  emp_telf?: string;

  @IsString()
  @IsOptional()
  emp_zona?: string;

  @IsString()
  @IsOptional()
  emp_localidad?: string;

  @IsDateString()
  @IsOptional()
  emp_fini_act?: string;

  @IsString()
  @IsOptional()
  emp_lug?: string;

  @IsDateString()
  @IsOptional()
  emp_fec?: string;

  @IsString()
  @IsOptional()
  emp_usu?: string;

  @IsString()
  emp_estado: string;

  @IsDateString()
  @IsOptional()
  emp_fec_baja?: string;

  @IsString()
  @IsOptional()
  emp_obs?: string;

  @IsString()
  @IsOptional()
  tipo?: string;

  @IsString()
  @IsOptional()
  emp_nom_corto?: string;

  @IsNumber()
  @IsOptional()
  emp_nit?: number;

  @IsString()
  @IsOptional()
  emp_matricula?: string;

  @IsDateString()
  @IsOptional()
  fecha_registro?: string;

  @IsDateString()
  @IsOptional()
  fecha_modificacion?: string;

  @IsString()
  @IsOptional()
  usuario_registro?: string;

  @IsString()
  @IsOptional()
  usuario_modificacion?: string;

  @IsString()
  @IsOptional()
  emp_cod_entidad?: string;
}