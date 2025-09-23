import { IsString, IsOptional, IsNumber, IsInt, Min, Max } from 'class-validator';

export class CreateRecursoDto {
  @IsString()
  titulo: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsString()
  nombre_archivo: string;

  @IsString()
  ruta_archivo: string;

  @IsOptional()
  @IsNumber()
  tamaño_archivo?: number;

  @IsOptional()
  @IsString()
  tipo_mime?: string;

  @IsOptional()
  @IsString()
  extension?: string;

  @IsOptional()
  @IsString()
  categoria?: string = 'general';

  @IsOptional()
  @IsString()
  version?: string = '1.0';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1)
  estado?: number = 1;

  @IsOptional()
  @IsString()
  usuario_creacion?: string;

  @IsOptional()
  @IsInt()
  orden_visualizacion?: number = 0;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1)
  es_publico?: number = 1;

  @IsOptional()
  @IsString()
  tipo_usuario?: string = 'todos';

  
}