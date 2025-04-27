import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { PlanillasAporte } from 'src/modules/planillas_aportes/entities/planillas_aporte.entity';

@Entity({ schema: 'transversales', name: 'empresa' })
export class Empresa {
  @PrimaryGeneratedColumn()
  id_empresa: number;

  @Column()
  emp_cod: number;

  @Column()
  emp_reg: string;

  @Column()
  cod_patronal: string;

  @Column()
  emp_nom: string;

  @Column({ nullable: true })
  emp_legal?: string;

  @Column({ type: 'text', nullable: true })
  emp_activ?: string;

  @Column({ nullable: true })
  emp_ntrab?: number;

  @Column({ nullable: true })
  emp_calle?: string;

  @Column({ nullable: true })
  emp_num?: string;

  @Column({ nullable: true })
  emp_telf?: string;

  @Column({ nullable: true })
  emp_zona?: string;

  @Column({ nullable: true })
  emp_localidad?: string;

  @Column({ type: 'timestamp', nullable: true })
  emp_fini_act?: Date;

  @Column({ nullable: true })
  emp_lug?: string;

  @Column({ type: 'timestamp', nullable: true })
  emp_fec?: Date;

  @Column({ nullable: true })
  emp_usu?: string;

  @Column()
  emp_estado: string;

  @Column({ type: 'timestamp', nullable: true })
  emp_fec_baja?: Date;

  @Column({ type: 'text', nullable: true })
  emp_obs?: string;

  @Column({ nullable: true })
  tipo?: string;

  @Column({ nullable: true })
  emp_nom_corto?: string;

  @Column({ nullable: true })
  emp_nit?: number;

  @Column({ nullable: true })
  emp_matricula?: string;

  @Column({ type: 'timestamp', nullable: true })
  fecha_registro?: Date;

  @Column({ type: 'timestamp', nullable: true })
  fecha_modificacion?: Date;

  @Column({ nullable: true })
  usuario_registro?: string;

  @Column({ nullable: true })
  usuario_modificacion?: string;

  @Column({ nullable: true })
  emp_cod_entidad?: string;

  @OneToMany(() => PlanillasAporte, (planilla) => planilla.empresa)
  planillasAportes: PlanillasAporte[];
}