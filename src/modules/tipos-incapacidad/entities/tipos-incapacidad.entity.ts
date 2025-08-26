import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { IncapacidadesReembolsoDetalle } from '../../incapacidades-reembolso/entities/incapacidades-reembolso-detalle.entity';

@Entity({ schema: 'transversales', name: 'tipos_incapacidad' })
export class TiposIncapacidad {
  @PrimaryGeneratedColumn()
  id_tipo_incapacidad: number;

  @Column({ unique: true })
  codigo: string;

  @Column()
  nombre: string;

  @Column({ nullable: true })
  descripcion: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  porcentaje_reembolso: number;

  @Column({ default: 0 })
  dias_carencia: number;

  @Column({ default: 2 })
  cotizaciones_minimas: number;

  @Column({ default: false })
  requiere_denuncia_accidente: boolean;

  @Column({ default: true })
  activo: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  fecha_creacion: Date;

  @Column({ default: () => 'CURRENT_USER' })
  usuario_creacion: string;

  // Relación con detalles de incapacidades
  @OneToMany(() => IncapacidadesReembolsoDetalle, (detalle: IncapacidadesReembolsoDetalle) => detalle.tipoIncapacidad)
  detallesIncapacidad: IncapacidadesReembolsoDetalle[];
}