import { IsString, IsNumber, IsInt, IsOptional, Min, IsEnum, MaxLength, IsDateString, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateDetalleReembolsoDto, TipoIncapacidad } from './create-detalles_reembolso.dto';

export enum TipoEmpresa {
  PA = 'PA',
  AP = 'AP',
  AV = 'AV',
  VA = 'VA',
}

export class CreateSolicitudesReembolsoDto {
  @IsInt()
  @IsOptional()
  id_empresa?: number;

  @IsString()
  @MaxLength(200)
  cod_patronal: string;

  @IsString()
  mes: string;

  @IsString()
  gestion: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @IsOptional()
  total_reembolso?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  total_trabajadores?: number;

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
  usuario_modificacion?: string;

  @IsDateString()
  @IsOptional()
  fecha_modificacion?: string;

  @IsString()
  @IsOptional()
  observaciones?: string;

  @IsDateString()
  @IsOptional()
  fecha_solicitud?: string;

  @IsDateString()
  @IsOptional()
  fecha_aprobacion?: string;

  @IsEnum(TipoEmpresa)
  @IsOptional()
  tipo_empresa?: TipoEmpresa;

  @IsString()
  @IsOptional()
  documentos_adjuntos?: string;

  @IsInt()
  @IsOptional()
  id_planilla_origen?: number;


  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDetalleReembolsoDto)
  @IsOptional()
  detalles?: CreateDetalleReembolsoDto[];
}