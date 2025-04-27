import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateNotificacioneDto {
  @ApiProperty({ description: 'Indica si la notificación ha sido leída' })
  @IsBoolean()
  leido: boolean;
}