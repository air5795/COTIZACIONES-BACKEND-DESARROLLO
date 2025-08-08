import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';

export class CreateNotificacioneDto {
  @ApiProperty({ description: 'ID del usuario receptor de la notificación' })
  @IsString()
  @IsNotEmpty()
  id_usuario_receptor: string;

  @ApiProperty({ 
    description: 'Tipo de notificación', 
    enum: ['PLANILLA_PRESENTADA', 'PLANILLA_APROBADA', 'PLANILLA_OBSERVADA', 'PLANILLA_CORREGIDA'] 
  })
  @IsEnum(['PLANILLA_PRESENTADA', 'PLANILLA_APROBADA', 'PLANILLA_OBSERVADA', 'PLANILLA_CORREGIDA'])
  tipo_notificacion: string;

  @ApiProperty({ description: 'Mensaje de la notificación' })
  @IsString()
  @IsNotEmpty()
  mensaje: string;

  @ApiProperty({ description: 'Nombre de empresa' })
  @IsString()
  @IsNotEmpty()
  empresa: string;

  @ApiProperty({ description: 'ID del recurso relacionado' })
  @IsInt()
  @IsNotEmpty()
  id_recurso: number;

  @ApiProperty({ description: 'Tipo de recurso', example: 'PLANILLA_APORTES' })
  @IsString()
  @IsNotEmpty()
  tipo_recurso: string;

  @ApiProperty({ description: 'Usuario que crea la notificación', required: false })
  @IsString()
  @IsOptional()
  usuario_creacion?: string;

  @ApiProperty({ description: 'Nombre completo del usuario que crea la notificación', required: false })
  @IsString()
  @IsOptional()
  nom_usuario?: string;
}