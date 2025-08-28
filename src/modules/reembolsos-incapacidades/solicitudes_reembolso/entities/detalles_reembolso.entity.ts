import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { SolicitudesReembolso } from './solicitudes_reembolso.entity';

@Entity({ schema: 'transversales', name: 'detalles_reembolso' })
export class DetallesReembolso {
  @PrimaryGeneratedColumn()
  id_detalle_reembolso: number;

  @Column()
  id_solicitud_reembolso: number;

  @Column({ type: 'integer', nullable: true })
  nro: number;

  @Column({ length: 20 })
  ci: string;

  @Column({ length: 255, nullable: true })
  apellido_paterno: string;

  @Column({ length: 255, nullable: true })
  apellido_materno: string;

  @Column({ length: 255, nullable: true })
  nombres: string;

  @Column({ length: 20, nullable: true })
  matricula: string;

  @Column({ length: 50 })
  tipo_incapacidad: string; // 'ENFERMEDAD_COMUN' | 'MATERNIDAD' | 'RIESGO_PROFESIONAL' | 'ENFERMEDAD_PROFESIONAL'

  @Column({ type: 'date' })
  fecha_inicio_baja: Date;

  @Column({ type: 'date' })
  fecha_fin_baja: Date;

  @Column({ type: 'integer' })
  dias_incapacidad: number;

  @Column({ type: 'integer' })
  dias_reembolso: number;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  salario: number;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  monto_dia: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  porcentaje_reembolso: number; // e.g., 75.00, 90.00

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  monto_reembolso: number;

  @Column({ type: 'integer', default: 0 })
  cotizaciones_previas_verificadas: number;

  @Column({ type: 'text', nullable: true })
  observaciones_afiliacion: string;

  @Column({ type: 'text', nullable: true })
  observaciones: string;

  @Column({ default: () => 'SESSION_USER' })
  usuario_creacion: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  fecha_creacion: Date;

  @Column({ nullable: true })
  usuario_modificacion: string;

  @Column({ type: 'timestamp', nullable: true })
  fecha_modificacion: Date;

  @ManyToOne(() => SolicitudesReembolso, (solicitud) => solicitud.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_solicitud_reembolso' })
  solicitud_reembolso: SolicitudesReembolso;
}