// src/modules/notificaciones/notificaciones.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:4200', 'http://localhost:3000'], // Ajusta según tu frontend
    credentials: true,
  },
  namespace: 'notificaciones',
})
export class NotificacionesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('NotificacionesGateway');
  
  // Mapa para almacenar conexiones activas por usuario
  private usuariosConectados = new Map<string, Set<string>>();

  handleConnection(client: Socket) {
    this.logger.log(`Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
    
    // Remover cliente de todas las salas de usuario
    for (const [userId, socketIds] of this.usuariosConectados.entries()) {
      if (socketIds.has(client.id)) {
        socketIds.delete(client.id);
        if (socketIds.size === 0) {
          this.usuariosConectados.delete(userId);
        }
        break;
      }
    }
  }

  /**
   * Cliente se une a su sala de notificaciones personal
   */
  @SubscribeMessage('join_notifications')
  handleJoinNotifications(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string }
  ) {
    const { userId } = data;
    
    if (!userId) {
      client.emit('error', { message: 'User ID es requerido' });
      return;
    }

    // Unir cliente a su sala personal
    const userRoom = `user_${userId}`;
    client.join(userRoom);

    // Registrar conexión
    if (!this.usuariosConectados.has(userId)) {
      this.usuariosConectados.set(userId, new Set());
    }
    this.usuariosConectados.get(userId).add(client.id);

    this.logger.log(`Usuario ${userId} se unió a notificaciones (socket: ${client.id})`);
    
    // Confirmar conexión
    client.emit('notifications_joined', { 
      message: 'Conectado a notificaciones en tiempo real',
      userId 
    });
  }

  /**
   * Cliente se desconecta de notificaciones
   */
  @SubscribeMessage('leave_notifications')
  handleLeaveNotifications(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string }
  ) {
    const { userId } = data;
    const userRoom = `user_${userId}`;
    
    client.leave(userRoom);
    
    // Remover de usuarios conectados
    if (this.usuariosConectados.has(userId)) {
      this.usuariosConectados.get(userId).delete(client.id);
      if (this.usuariosConectados.get(userId).size === 0) {
        this.usuariosConectados.delete(userId);
      }
    }

    this.logger.log(`Usuario ${userId} salió de notificaciones (socket: ${client.id})`);
  }

  /**
   * Enviar notificación en tiempo real a un usuario específico
   */
  async enviarNotificacionEnTiempoReal(userId: string, notificacion: any): Promise<void> {
    const userRoom = `user_${userId}`;
    
    this.server.to(userRoom).emit('nueva_notificacion', {
      notificacion,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Notificación enviada a usuario ${userId}: ${notificacion.tipo_notificacion}`);
  }

  /**
   * Actualizar contador de notificaciones no leídas
   */
  async actualizarContadorNotificaciones(userId: string, contador: number): Promise<void> {
    const userRoom = `user_${userId}`;
    
    this.server.to(userRoom).emit('contador_notificaciones', {
      contador,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Contador actualizado para usuario ${userId}: ${contador} no leídas`);
  }

  /**
   * Notificar cuando una notificación es marcada como leída
   */
  async notificarNotificacionLeida(userId: string, notificacionId: number): Promise<void> {
    const userRoom = `user_${userId}`;
    
    this.server.to(userRoom).emit('notificacion_leida', {
      notificacionId,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Notificación ${notificacionId} marcada como leída para usuario ${userId}`);
  }

  /**
   * Enviar notificación broadcast a todos los usuarios de un tipo
   */
  async enviarNotificacionBroadcast(tipoUsuario: string, notificacion: any): Promise<void> {
    // Esta función se puede usar para notificaciones masivas si es necesario
    this.server.emit('notificacion_broadcast', {
      tipoUsuario,
      notificacion,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Notificación broadcast enviada a tipo de usuario: ${tipoUsuario}`);
  }

  /**
   * Obtener estadísticas de conexiones activas (para debugging)
   */
  getEstadisticasConexiones() {
    const stats = {
      usuariosConectados: this.usuariosConectados.size,
      conexionesActivas: Array.from(this.usuariosConectados.values())
        .reduce((total, socketSet) => total + socketSet.size, 0),
      detalleUsuarios: Array.from(this.usuariosConectados.entries()).map(([userId, sockets]) => ({
        userId,
        numeroConexiones: sockets.size,
      })),
    };

    return stats;
  }
}