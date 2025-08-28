import { PartialType } from '@nestjs/mapped-types';
import { CreateSolicitudesReembolsoDto } from './create-solicitudes_reembolso.dto';

export class UpdateSolicitudesReembolsoDto extends PartialType(CreateSolicitudesReembolsoDto) {}