import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { PlanillasAporte } from './planillas_aporte.entity';

// 🚀 ÍNDICES AGREGADOS PARA RENDIMIENTO
@Entity({ schema: 'transversales', name: 'planilla_aportes_detalles' })
@Index('IDX_detalle_planilla_id', ['id_planilla_aportes'])
@Index('IDX_detalle_ci', ['ci'])
@Index('IDX_detalle_nro', ['nro'])
@Index('IDX_detalle_planilla_nro', ['id_planilla_aportes', 'nro'])
@Index('IDX_detalle_nombres', ['nombres', 'apellido_paterno'])
@Index('IDX_detalle_estado', ['asegurado_estado'])
export class PlanillaAportesDetalles {
  @PrimaryGeneratedColumn()
  id_planilla_aportes_detalles: number;

  @Column()
  id_planilla_aportes: number;

  @Column()
  nro: number;

  @Column()
  ci: string;

  @Column()
  apellido_paterno: string;

  @Column()
  apellido_materno: string;

  @Column()
  nombres: string;

  @Column()
  sexo: string;

  @Column()
  cargo: string;

  @Column({ type: 'date' })
  fecha_nac: Date;

  @Column({ type: 'date' })
  fecha_ingreso: Date;

  @Column({ type: 'date', nullable: true })
  fecha_retiro: Date;

  @Column()
  dias_pagados: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  haber_basico: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  bono_antiguedad: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  monto_horas_extra: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  monto_horas_extra_nocturnas: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  otros_bonos_pagos: number;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  salario: number;

  @Column()
  regional: string;

  @Column({ nullable: true })
  matricula: string; // ASE_MAT

  @Column({ nullable: true })
  tipo_afiliado: string; // ASE_COND_EST

  @Column({ type: 'text', nullable: true })
  observaciones_afiliacion: string; // Para almacenar mensajes de la API

  // NUEVOS CAMPOS AGREGADOS:
  @Column({ nullable: true })
  asegurado_tipo: string; // ASE_TIPO: (ACTIVO)(PASIVO)(EXT DE SEGURO)

  @Column({ nullable: true })
  asegurado_estado: string; // ASE_ESTADO: (VIGENTE)(BAJA)(CESANTIA)(FALLECIDO)(DER HABIENTE)

  @Column({ type: 'varchar', nullable: false, default: 'mensual' })
  tipo: 'Mensual' | 'Planilla Adicional' | 'Planilla Retroactivo';

  @ManyToOne(() => PlanillasAporte, planilla => planilla.detalles)
  @JoinColumn({ name: 'id_planilla_aportes' })
  planilla_aporte: PlanillasAporte;



  

}
