// src/modules/reembolsos-incapacidades/solicitudes_reembolso/dto/update-detalles_reembolso.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateDetalleReembolsoDto } from './create-detalles_reembolso.dto';

export class UpdateDetalleReembolsoDto extends PartialType(CreateDetalleReembolsoDto) {}