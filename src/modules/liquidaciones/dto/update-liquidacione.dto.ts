import { PartialType } from '@nestjs/mapped-types';
import { CreateLiquidacioneDto } from './create-liquidacione.dto';

export class UpdateLiquidacioneDto extends PartialType(CreateLiquidacioneDto) {}
