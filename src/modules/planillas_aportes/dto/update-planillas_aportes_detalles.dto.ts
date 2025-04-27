import { IsString, IsDateString, IsOptional } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { CreatePlanillaAportesDetallesDto } from './create-planillas_aportes_detalles.dto';

export class UpdatePlanillaAportesDetallesDto extends PartialType(CreatePlanillaAportesDetallesDto) {
  @IsString()
  @IsOptional()
  usuario_modificacion?: string;

  @IsDateString()
  @IsOptional()
  fecha_modificacion?: string;
}