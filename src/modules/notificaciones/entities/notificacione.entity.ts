import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ schema: 'transversales', name: 'notificaciones' })
export class Notificacion {
  @PrimaryGeneratedColumn({ type: 'int4' })
  id_notificacion: number;

  @Column({ type: 'varchar', length: 100 })
  id_usuario_receptor: string;

  @Column({ type: 'varchar', length: 50 })
  tipo_notificacion: string;

  @Column({ type: 'varchar', length: 255 })
  empresa: string;

  @Column({ type: 'text' })
  mensaje: string;

  @Column({ type: 'bigint' })
  id_recurso: number;

  @Column({ type: 'varchar', length: 50 })
  tipo_recurso: string;

  @Column({ type: 'boolean', default: false })
  leido: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  fecha_creacion: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  usuario_creacion: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  nom_usuario: string;
}