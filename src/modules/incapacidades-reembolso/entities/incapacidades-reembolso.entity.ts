import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { IncapacidadesReembolsoDetalle } from './incapacidades-reembolso-detalle.entity';
import { Empresa } from '../../empresas/entities/empresa.entity';

@Entity({ schema: 'transversales', name: 'incapacidades_reembolso' })
export class IncapacidadesReembolso {
  @PrimaryGeneratedColumn()
  id_incapacidad_reembolso: number;

  @Column()
  cod_patronal: string;

  @Column({ type: 'date' })
  fecha_planilla: Date;

  @Column({ nullable: true })
  mes: string;

  @Column({ nullable: true })
  gestion: string;

  // Campos financieros totales
  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  total_reembolso: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  total_enfermedad_comun: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  total_maternidad: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  total_riesgo_profesional: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  total_enfermedad_profesional: number;

  @Column({ default: 0 })
  total_trabajadores: number;

  // Estados del flujo (igual que aportes)
  @Column({ type: 'smallint', default: 1 })
  estado: number; // 1=BORRADOR, 2=PRESENTADO, 3=APROBADO

  // Campos de auditoría y control
  @Column({ nullable: true })
  com_nro: number;

  @Column({ default: () => 'CURRENT_USER' })
  usuario_creacion: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  fecha_creacion: Date;

  @Column({ nullable: true })
  usuario_modificacion: string;

  @Column({ nullable: true })
  fecha_modificacion: Date;

  @Column({ nullable: true })
  nombre_creacion: string;

  // Fechas del proceso
  @Column({ type: 'date', nullable: true })
  fecha_incapacidad: Date;

  @Column({ nullable: true })
  fecha_presentacion: Date;

  @Column({ nullable: true })
  fecha_aprobacion: Date;

  @Column({ nullable: true })
  usuario_aprobacion: string;

  // Observaciones y notas
  @Column({ type: 'text', nullable: true })
  observaciones: string;

  // Relación con empresa
  @Column({ nullable: true })
  id_empresa: number;

  @ManyToOne(() => Empresa)
  @JoinColumn({ name: 'id_empresa' })
  empresa: Empresa;
  // Relación con detalles
  @OneToMany(() => IncapacidadesReembolsoDetalle, (detalle: IncapacidadesReembolsoDetalle) => detalle.incapacidadReembolso)
  detalles: IncapacidadesReembolsoDetalle[];
}