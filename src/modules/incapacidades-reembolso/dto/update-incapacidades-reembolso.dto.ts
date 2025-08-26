import { PartialType } from '@nestjs/mapped-types';
import { CreateIncapacidadesReembolsoDto } from './create-incapacidades-reembolso.dto';

export class UpdateIncapacidadesReembolsoDto extends PartialType(CreateIncapacidadesReembolsoDto) {}
