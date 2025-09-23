import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ schema: 'transversales', name: 'recursos' })
@Index('IDX_recursos_categoria', ['categoria'])
@Index('IDX_recursos_estado', ['estado'])
@Index('IDX_recursos_es_publico', ['es_publico'])
@Index('IDX_recursos_orden', ['orden_visualizacion'])
export class Recurso {
  @PrimaryGeneratedColumn()
  id_recurso: number;

  @Column({ type: 'varchar', length: 255 })
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string;

  @Column({ type: 'varchar', length: 255 })
  nombre_archivo: string;

  @Column({ type: 'varchar', length: 500 })
  ruta_archivo: string;

  @Column({ type: 'bigint', nullable: true })
  tamaño_archivo: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tipo_mime: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  extension: string;

  @Column({ type: 'varchar', length: 50, default: 'general' })
  categoria: string;

  @Column({ type: 'varchar', length: 50, default: '1.0' })
  version: string;

  @Column({ type: 'smallint', default: 1 })
  estado: number; // 1=activo, 0=inactivo

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  fecha_creacion: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  fecha_actualizacion: Date;

  @Column({ type: 'varchar', length: 255, default: () => 'SESSION_USER' })
  usuario_creacion: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  usuario_actualizacion: string;

  @Column({ type: 'integer', default: 0 })
  orden_visualizacion: number;

  @Column({ type: 'integer', default: 0 })
  descargas_count: number;

  @Column({ type: 'smallint', default: 1 })
  es_publico: number; // 1=público, 0=solo admin

  @Column({ type: 'varchar', length: 50, default: 'todos' })
  tipo_usuario: string;
}