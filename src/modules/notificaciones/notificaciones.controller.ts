import { Controller, Get, Post, Query, Param, Body, BadRequestException } from '@nestjs/common';
import { NotificacionesService } from './notificaciones.service';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { UpdateNotificacioneDto } from './dto/update-notificacione.dto';

@ApiTags('Notificaciones')
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private notificacionesService: NotificacionesService) {}

  @Get(':id_usuario')
  @ApiOperation({ summary: 'Obtener notificaciones de un usuario' })
  @ApiParam({ name: 'id_usuario', description: 'ID del usuario receptor', type: String })
  @ApiQuery({ name: 'leido', required: false, description: 'Filtrar por leídas/no leídas', type: Boolean })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', type: Number })
  @ApiQuery({ name: 'limite', required: false, description: 'Límite de registros', type: Number })
  @ApiResponse({ status: 200, description: 'Notificaciones obtenidas con éxito' })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos' })
  async obtenerNotificaciones(
    @Param('id_usuario') id_usuario: string,
    @Query('leido') leido: boolean,
    @Query('pagina') pagina: number = 1,
    @Query('limite') limite: number = 10,
  ) {
    return await this.notificacionesService.obtenerNotificaciones(id_usuario, leido, pagina, limite);
  }

  @Post('marcar-leida/:id_notificacion')
  @ApiOperation({ summary: 'Marcar una notificación como leída' })
  @ApiParam({ name: 'id_notificacion', description: 'ID de la notificación', type: Number })
  @ApiResponse({ status: 200, description: 'Notificación marcada como leída' })
  @ApiResponse({ status: 400, description: 'Error al marcar notificación' })
  async marcarComoLeida(
    @Param('id_notificacion') id_notificacion: number,
    @Body() updateDto: UpdateNotificacioneDto,
  ) {
    await this.notificacionesService.marcarComoLeida(id_notificacion, updateDto);
    return { mensaje: 'Notificación marcada como leída' };
  }
}