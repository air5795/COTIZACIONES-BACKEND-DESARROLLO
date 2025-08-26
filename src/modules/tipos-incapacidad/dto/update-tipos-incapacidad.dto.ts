import { PartialType } from '@nestjs/mapped-types';
import { CreateTiposIncapacidadDto } from './create-tipos-incapacidad.dto';

export class UpdateTiposIncapacidadDto extends PartialType(CreateTiposIncapacidadDto) {}
