import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Empresa } from 'src/modules/empresas/entities/empresa.entity';
import { PlanillasAporte } from 'src/modules/planillas_aportes/entities/planillas_aporte.entity';
import { DetallesReembolso } from './detalles_reembolso.entity';

@Entity({ schema: 'transversales', name: 'solicitudes_reembolso' })
export class SolicitudesReembolso {
  @PrimaryGeneratedColumn()
  id_solicitud_reembolso: number;

  @Column()
  id_empresa: number;

  @Column({ length: 200 })
  cod_patronal: string;

  @Column()
  mes: string;

  @Column()
  gestion: string;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  total_reembolso: number;

  @Column({ type: 'integer', default: 0 })
  total_trabajadores: number;

  @Column({ type: 'smallint', default: 1 })
  estado: number; // 1: Pendiente, 2: Aprobada, 3: Rechazada, etc.

  @Column({ default: () => 'SESSION_USER' })
  usuario_creacion: string;

  @Column({ nullable: true })
  nombre_creacion: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  fecha_creacion: Date;

  @Column({ nullable: true })
  usuario_modificacion: string;

  @Column({ type: 'timestamp', nullable: true })
  fecha_modificacion: Date;

  @Column({ type: 'text', nullable: true })
  observaciones: string;

  @Column({ type: 'date', nullable: true })
  fecha_solicitud: Date;

  @Column({ type: 'date', nullable: true })
  fecha_aprobacion: Date;

  @Column({ type: 'varchar', length: 10, nullable: true })
  tipo_empresa: string; // 'PRIVADA' | 'ESTATAL'

  @Column({ type: 'text', nullable: true })
  documentos_adjuntos: string; // JSON o texto con lista de documentos

  @Column({ nullable: true })
  id_planilla_origen: number;

  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'id_empresa' })
  empresa: Empresa;

  @ManyToOne(() => PlanillasAporte, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'id_planilla_origen' })
  planilla_origen: PlanillasAporte;

  @OneToMany(() => DetallesReembolso, (detalle) => detalle.solicitud_reembolso)
  detalles: DetallesReembolso[];
}