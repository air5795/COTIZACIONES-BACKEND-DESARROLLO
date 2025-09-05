import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, JoinColumn, Index } from 'typeorm';
import { PlanillaAportesDetalles } from './planillas_aportes_detalles.entity';
import { PagoAporte } from 'src/modules/pagos-aportes/entities/pagos-aporte.entity';
import { Empresa } from 'src/modules/empresas/entities/empresa.entity';

// 🚀 ÍNDICES AGREGADOS PARA RENDIMIENTO
@Entity({ schema: 'transversales', name: 'planillas_aportes' })
@Index('IDX_planilla_cod_patronal', ['cod_patronal'])
@Index('IDX_planilla_fecha_tipo', ['cod_patronal', 'fecha_planilla', 'tipo_planilla'])
@Index('IDX_planilla_estado', ['estado'])
@Index('IDX_planilla_mes_gestion', ['mes', 'gestion'])
@Index('IDX_planilla_fecha_planilla', ['fecha_planilla'])
@Index('IDX_planilla_origen', ['id_planilla_origen'])
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

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  total_importe: number;

  @Column()
  total_trabaj: number;

  @Column({ default: 1 })
  estado: number;

  @Column({ default: () => 'CURRENT_USER' })
  usuario_creacion: string;

  @Column()
  nombre_creacion: string;

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

  @Column({ nullable: true })
  fecha_liquidacion: Date;

  @Column({ nullable: true })
  fecha_presentacion_oficial: Date;

  @Column({ nullable: true })
  fecha_deposito_presentacion: Date;

  @Column({ nullable: true })
  fecha_verificacion_afiliacion: Date;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  aporte_porcentaje: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  ufv_dia_formal: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  ufv_dia_presentacion: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  aporte_actualizado: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  monto_actualizado: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  multa_no_presentacion: number;

  @Column({ type: 'integer', nullable: true })
  dias_retraso: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  intereses: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  multa_sobre_intereses: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  total_a_cancelar_parcial: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  total_a_cancelar: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  total_multas: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  total_tasa_interes: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  total_aportes_asuss: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  total_aportes_min_salud: number;

  @Column({ nullable: true })
  id_empresa: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  total_deducciones: number;

  @Column({ default: false })
  aplica_descuento_min_salud: boolean;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  otros_descuentos: number;

  @Column({ type: 'text', nullable: true })
  motivo_otros_descuentos: string;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  excedente: number;

  @Column({ type: 'text', nullable: true })
  motivo_excedente: string;

    @Column({ type: 'text', nullable: true })
  valido_cotizacion: string;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  cotizacion_tasa: number;

  @Column({ nullable: true })
  id_planilla_origen?: number;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  cotizacion_tasa_real?: number; // Monto real desembolsado por TGN (solo empresas públicas)

  

  @OneToMany(() => PagoAporte, (pago) => pago.planilla)
  pagos: PagoAporte[];

  @ManyToOne(() => Empresa, (empresa) => empresa.planillasAportes, { nullable: true })
  @JoinColumn({ name: 'id_empresa' })
  empresa: Empresa;

  @ManyToOne(() => PlanillasAporte, { nullable: true })
  @JoinColumn({ name: 'id_planilla_origen' })
  planillaOrigen?: PlanillasAporte;

  @OneToMany(() => PlanillasAporte, (p) => p.planillaOrigen)
  planillasAdicionales?: PlanillasAporte[];

  @OneToMany(() => PlanillaAportesDetalles, detalle => detalle.planilla_aporte)
  detalles: PlanillaAportesDetalles[];

  

}