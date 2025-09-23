import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString } from 'class-validator';
import { CreateRecursoDto } from './create-recurso.dto';

export class UpdateRecursoDto extends PartialType(CreateRecursoDto) {
  @IsOptional()
  @IsString()
  usuario_actualizacion?: string;
}