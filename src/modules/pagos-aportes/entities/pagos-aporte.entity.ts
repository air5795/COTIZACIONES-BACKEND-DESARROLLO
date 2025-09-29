// REEMPLAZAR COMPLETAMENTE en: src/modules/pagos-aportes/entities/pagos-aporte.entity.ts

import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { PlanillasAporte } from '../../planillas_aportes/entities/planillas_aporte.entity'; 

@Entity({ schema: 'transversales', name: 'pagos_aportes_mensuales' })
export class PagoAporte {
  // CAMBIO: Ahora es PrimaryGeneratedColumn en lugar de PrimaryColumn
  @PrimaryGeneratedColumn()
  id: number;

  // CAMBIO: Ahora es Column normal, no PrimaryColumn
  @Column()
  id_planilla_aportes: number;

  @Column({ type: 'timestamp' })
  fecha_pago: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  monto_pagado: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  monto_demasia: number;

  @Column({ nullable: true })
  metodo_pago: string;

  @Column({ nullable: true })
  comprobante_pago: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  total_a_cancelar: number;

  @Column({ nullable: true })
  foto_comprobante: string;

  @Column({ default: 1 })
  estado: number;

  @Column({ default: 1 })
  estado_envio: number;

  @Column({ default: () => 'CURRENT_USER' })
  usuario_creacion: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  fecha_creacion: Date;

  @Column({ nullable: true })
  usuario_modificacion: string;

  @Column({ type: 'timestamp', nullable: true })
  fecha_modificacion: Date;

  @Column({ nullable: true })
  observaciones: string;

  @Column({ type: 'integer', generated: 'increment', unique: true, nullable: true })
  numero_recibo: number;

  // Relación con la tabla planillas_aportes
  @ManyToOne(() => PlanillasAporte, (planilla) => planilla.id_planilla_aportes, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'id_planilla_aportes' })
  planilla: PlanillasAporte;
}