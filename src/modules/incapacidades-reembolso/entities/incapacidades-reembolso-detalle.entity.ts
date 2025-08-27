import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { IncapacidadesReembolso } from './incapacidades-reembolso.entity';
import { TiposIncapacidad } from '../../tipos-incapacidad/entities/tipos-incapacidad.entity';
import { PlanillaAportesDetalles } from '../../planillas_aportes/entities/planillas_aportes_detalles.entity';
import { IncapacidadesDocumento } from './incapacidades-documento.entity';

@Entity({ schema: 'transversales', name: 'incapacidades_reembolso_detalles' })
export class IncapacidadesReembolsoDetalle {
  @PrimaryGeneratedColumn()
  id_incapacidad_detalle: number;

  @Column()
  id_incapacidad_reembolso: number;

  // Numeración secuencial
  @Column({ nullable: true })
  nro: number;

  // Datos del trabajador (desde el servicio externo o planillas aportes)
  @Column()
  ci: string;

  @Column({ nullable: true })
  matricula: string; // ASE_MAT del servicio

  @Column()
  apellido_paterno: string;

  @Column()
  apellido_materno: string;

  @Column()
  nombres: string;

  @Column()
  nombre_completo: string;

  // Datos adicionales del trabajador
  @Column({ nullable: true })
  sexo: string;

  @Column({ nullable: true })
  cargo: string;

  @Column({ nullable: true })
  regional: string;

  // DATOS DE LA BAJA MÉDICA (del servicio externo) - COMENTADAS TEMPORALMENTE
  // @Column({ nullable: true })
  // comprobante: number; // COMPROBANTE del servicio

  // @Column({ nullable: true })
  // especialidad: string; // ESP_NOM del servicio

  // @Column({ nullable: true })
  // medico: string; // MEDI_NOM del servicio

  // @Column({ nullable: true })
  // tipo_baja_original: string; // TIPO_BAJA del servicio

  // Tipo de incapacidad (referencia a tabla de tipos)
  @Column()
  id_tipo_incapacidad: number;

  // Fechas de baja médica (del servicio externo)
  @Column({ type: 'date' })
  fecha_baja_medica_inicio: Date; // DIA_DESDE

  @Column({ type: 'date' })
  fecha_baja_medica_fin: Date; // DIA_HASTA

  @Column()
  dias_incapacidad_inicial: number; // DIAS_IMPEDIMENTO

  // @Column({ type: 'date', nullable: true })
  // fecha_incorporacion: Date; // FECHA_INCORPORACION

  // @Column({ type: 'time', nullable: true })
  // hora_incorporacion: string; // HORA_INCORPORACION

  // @Column({ type: 'timestamp', nullable: true })
  // fecha_registro_baja: Date; // FECHA_REGISTRO del servicio

  // Fechas de cotización (período a reembolsar en este mes)
  @Column({ type: 'date' })
  fecha_cotizacion_del: Date; // calculado según el mes de la planilla

  @Column({ type: 'date' })
  fecha_cotizacion_al: Date;  // calculado según el mes de la planilla

  @Column()
  dias_mes: number;          // días calendarios en el período

  @Column()
  dias_cbes: number;         // días que reembolsa CBES (descontando carencia)

  // CÁLCULOS FINANCIEROS (calculados automáticamente)
  @Column({ type: 'decimal', precision: 18, scale: 6 })
  salario_total: number;     // desde planilla de aportes

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  salario_dia: number;       // salario_total / 30

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  subtotal_salario: number;  // salario_dia * dias_cbes

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  porcentaje_reembolso: number; // desde tipos_incapacidad

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  monto_reembolso: number;   // subtotal_salario * porcentaje / 100

  // Control de validaciones
  @Column({ default: 0 })
  cotizaciones_previas: number;

  @Column({ default: false })
  cumple_requisitos: boolean;

  // Referencia a planilla de aportes origen
  @Column({ nullable: true })
  id_planilla_detalle_origen: number;

  // Campos de auditoría
  @Column({ default: 'ACTIVO' })
  estado: string;

  @Column({ type: 'text', nullable: true })
  observaciones: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  fecha_registro: Date;

  @Column({ default: () => 'CURRENT_USER' })
  usuario_registro: string;

  @Column({ nullable: true })
  usuario_modificacion: string;

  @Column({ nullable: true })
  fecha_modificacion: Date;

  // Relaciones
  @ManyToOne(() => IncapacidadesReembolso, incapacidad => incapacidad.detalles)
  @JoinColumn({ name: 'id_incapacidad_reembolso' })
  incapacidadReembolso: IncapacidadesReembolso;

  @ManyToOne(() => TiposIncapacidad, tipo => tipo.detallesIncapacidad)
  @JoinColumn({ name: 'id_tipo_incapacidad' })
  tipoIncapacidad: TiposIncapacidad;

  @ManyToOne(() => PlanillaAportesDetalles)
  @JoinColumn({ name: 'id_planilla_detalle_origen' })
  planillaDetalleOrigen: PlanillaAportesDetalles;

  @OneToMany(() => IncapacidadesDocumento, documento => documento.incapacidadDetalle)
  documentos: IncapacidadesDocumento[];
}