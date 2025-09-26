import { Controller, Get, Post, Query, Param, Body, BadRequestException, ParseIntPipe } from '@nestjs/common';
import { NotificacionesService } from './notificaciones.service';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { UpdateNotificacioneDto } from './dto/update-notificacione.dto';

@ApiTags('Notificaciones')
@ApiBearerAuth('JWT-auth') 
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
    @Query('leido') leido?: string, 
    @Query('pagina') pagina: number = 1,
    @Query('limite') limite: number = 10,
  ) {
    try {

      let leidoBoolean: boolean | undefined = undefined;
      if (leido !== undefined && leido !== '') {
        leidoBoolean = leido === 'true';
      }
      const paginaNum = Number(pagina) || 1;
      const limiteNum = Number(limite) || 10;

      if (paginaNum < 1 || limiteNum < 1) {
        throw new BadRequestException('La página y el límite deben ser números positivos');
      }

      const resultado = await this.notificacionesService.obtenerNotificaciones(
        id_usuario, 
        leidoBoolean, 
        paginaNum, 
        limiteNum
      );

      return {
        notificaciones: resultado.notificaciones,
        total: resultado.total,
        totalNotificaciones: resultado.total,
        pagina: paginaNum,
        limite: limiteNum,
        totalPaginas: Math.ceil(resultado.total / limiteNum)
      };
    } catch (error) {
      throw new BadRequestException(`Error al obtener notificaciones: ${error.message}`);
    }
  }

  @Post('marcar-leida/:id_notificacion')
  @ApiOperation({ summary: 'Marcar una notificación como leída' })
  @ApiParam({ name: 'id_notificacion', description: 'ID de la notificación', type: Number })
  @ApiResponse({ status: 200, description: 'Notificación marcada como leída' })
  @ApiResponse({ status: 400, description: 'Error al marcar notificación' })
  async marcarComoLeida(
    @Param('id_notificacion', ParseIntPipe) id_notificacion: number,
    @Body() updateDto?: UpdateNotificacioneDto, // Hacer opcional
  ) {
    try {
      // Si no se proporciona el body, usar valores por defecto
      const dto = updateDto || { leido: true };
      
      await this.notificacionesService.marcarComoLeida(id_notificacion, dto);
      
      return { 
        mensaje: 'Notificación marcada como leída',
        id_notificacion,
        success: true 
      };
    } catch (error) {
      throw new BadRequestException(`Error al marcar notificación como leída: ${error.message}`);
    }
  }

  @Get('contador/:id_usuario')
  @ApiOperation({ summary: 'Obtener contador de notificaciones no leídas' })
  @ApiParam({ name: 'id_usuario', description: 'ID del usuario receptor', type: String })
  @ApiResponse({ status: 200, description: 'Contador obtenido con éxito' })
  async obtenerContadorNoLeidas(@Param('id_usuario') id_usuario: string) {
    try {
      const contador = await this.notificacionesService.obtenerContadorNoLeidas(id_usuario);
      return { 
        contador,
        id_usuario 
      };
    } catch (error) {
      throw new BadRequestException(`Error al obtener contador: ${error.message}`);
    }
  }

  @Post('marcar-todas-leidas/:id_usuario')
  @ApiOperation({ summary: 'Marcar todas las notificaciones como leídas' })
  @ApiParam({ name: 'id_usuario', description: 'ID del usuario receptor', type: String })
  @ApiResponse({ status: 200, description: 'Todas las notificaciones marcadas como leídas' })
  async marcarTodasComoLeidas(@Param('id_usuario') id_usuario: string) {
    try {
      await this.notificacionesService.marcarTodasComoLeidas(id_usuario);
      return { 
        mensaje: 'Todas las notificaciones han sido marcadas como leídas',
        id_usuario 
      };
    } catch (error) {
      throw new BadRequestException(`Error al marcar todas como leídas: ${error.message}`);
    }
  }
}