// src/modules/notificaciones/notificaciones.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notificacion } from './entities/notificacione.entity';
import { CreateNotificacioneDto } from './dto/create-notificacione.dto';
import { UpdateNotificacioneDto } from './dto/update-notificacione.dto';

@Injectable()
export class NotificacionesService {
  constructor(
    @InjectRepository(Notificacion)
    public notificacionesRepo: Repository<Notificacion>,
  ) {}

  async crearNotificacion(dto: CreateNotificacioneDto): Promise<Notificacion> {
    try {
      const notificacion = this.notificacionesRepo.create({
        ...dto,
        leido: false,
      });
      return await this.notificacionesRepo.save(notificacion);
    } catch (error) {
      throw new BadRequestException(`Error al crear notificación: ${error.message}`);
    }
  }

  async obtenerNotificaciones(
    id_usuario_receptor: string,
    leido?: boolean,
    pagina: number = 1,
    limite: number = 10,
  ): Promise<{ notificaciones: Notificacion[]; total: number }> {
    try {
      const skip = (pagina - 1) * limite;
      const query = this.notificacionesRepo
        .createQueryBuilder('notificacion')
        .where('notificacion.id_usuario_receptor = :id_usuario_receptor', { id_usuario_receptor })
        .orderBy('notificacion.fecha_creacion', 'DESC')
        .skip(skip)
        .take(limite);

      if (leido !== undefined) {
        query.andWhere('notificacion.leido = :leido', { leido });
      }

      const [notificaciones, total] = await query.getManyAndCount();
      return { notificaciones, total };
    } catch (error) {
      throw new BadRequestException(`Error al obtener notificaciones: ${error.message}`);
    }
  }

  async marcarComoLeida(id_notificacion: number, dto: UpdateNotificacioneDto): Promise<void> {
    try {
      await this.notificacionesRepo.update(id_notificacion, dto);
    } catch (error) {
      throw new BadRequestException(`Error al marcar notificación como leída: ${error.message}`);
    }
  }

  async obtenerContadorNoLeidas(id_usuario_receptor: string): Promise<number> {
    try {
      return await this.notificacionesRepo.count({
        where: {
          id_usuario_receptor,
          leido: false,
        },
      });
    } catch (error) {
      throw new BadRequestException(`Error al obtener contador: ${error.message}`);
    }
  }

  async marcarTodasComoLeidas(id_usuario_receptor: string): Promise<void> {
    try {
      await this.notificacionesRepo.update(
        { id_usuario_receptor, leido: false },
        { leido: true }
      );
    } catch (error) {
      throw new BadRequestException(`Error al marcar todas como leídas: ${error.message}`);
    }
  }
}