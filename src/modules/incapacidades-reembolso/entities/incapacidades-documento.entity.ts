import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { IncapacidadesReembolsoDetalle } from './incapacidades-reembolso-detalle.entity';

@Entity({ schema: 'transversales', name: 'incapacidades_documentos' })
export class IncapacidadesDocumento {
  @PrimaryGeneratedColumn()
  id_documento: number;

  @Column()
  id_incapacidad_detalle: number;

  @Column()
  tipo_documento: string; // 'CERTIFICADO_MEDICO', 'DENUNCIA_ACCIDENTE', 'FORMULARIO_C31', 'PLANILLA_SALARIOS'

  @Column()
  nombre_archivo: string;

  @Column()
  ruta_archivo: string;

  @Column({ type: 'bigint', nullable: true })
  tamaño_archivo: number;

  @Column({ nullable: true })
  tipo_mime: string;

  // Auditoría
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  fecha_subida: Date;

  @Column({ default: () => 'CURRENT_USER' })
  usuario_subida: string;

  // Relación
  @ManyToOne(() => IncapacidadesReembolsoDetalle, detalle => detalle.documentos)
  @JoinColumn({ name: 'id_incapacidad_detalle' })
  incapacidadDetalle: IncapacidadesReembolsoDetalle;
}