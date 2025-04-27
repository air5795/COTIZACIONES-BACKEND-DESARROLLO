import { IsString, IsNumber, IsDateString, IsInt, IsOptional, Min, IsEnum } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { CreatePlanillasAporteDto } from './create-planillas_aporte.dto';

export class UpdatePlanillasAporteDto extends PartialType(CreatePlanillasAporteDto) {
  @IsString()
  @IsOptional()
  usuario_modificacion?: string;

  @IsDateString()
  @IsOptional()
  fecha_modificacion?: string;
}