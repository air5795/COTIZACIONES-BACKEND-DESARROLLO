import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { PlanillaAportesDetalles } from './planillas_aportes_detalles.entity';
import { PagoAporte } from 'src/modules/pagos-aportes/entities/pagos-aporte.entity';
import { Empresa } from 'src/modules/empresas/entities/empresa.entity';


@Entity({ schema: 'transversales', name: 'planillas_aportes' })
export class PlanillasAporte {
  @PrimaryGeneratedColumn()
  id_planilla_aportes: number;

  @Column()
  com_nro: number;

  @Column()
  cod_patronal: string;

  @Column()
  mes: string;

  @Column()
  tipo_planilla: string;

  @Column()
  gestion: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total_importe: number;

  @Column()
  total_trabaj: number;

  @Column({ default: 1 })
  estado: number;

  @Column({ default: () => 'CURRENT_USER' })
  usuario_creacion: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  fecha_creacion: Date;

  @Column({ nullable: true })
  observaciones: string;

  @Column({ nullable: true })
  fecha_planilla: Date;

  @Column({ nullable: true })
  fecha_declarada: Date;

  @Column({ nullable: true })
  fecha_pago: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  aporte_porcentaje: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  ufv_dia_formal: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  ufv_dia_presentacion: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  aporte_actualizado: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  monto_actualizado: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  multa_no_presentacion: number;

  @Column({ type: 'integer', nullable: true })
  dias_retraso: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  intereses: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  multa_sobre_intereses: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  total_a_cancelar_parcial: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  total_a_cancelar: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  total_multas: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  total_tasa_interes: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  total_aportes_asuss: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  total_aportes_min_salud: number;

  @Column({ nullable: true })
  id_empresa: number; 

  @OneToMany(() => PagoAporte, (pago) => pago.planilla)
  pagos: PagoAporte[];

  @ManyToOne(() => Empresa, (empresa) => empresa.planillasAportes, { nullable: true })
  @JoinColumn({ name: 'id_empresa' })
  empresa: Empresa;


}