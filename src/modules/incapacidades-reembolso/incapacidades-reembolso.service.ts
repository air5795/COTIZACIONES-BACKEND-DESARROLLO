import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { IncapacidadesReembolso } from './entities/incapacidades-reembolso.entity';
import { IncapacidadesReembolsoDetalle } from './entities/incapacidades-reembolso-detalle.entity';
import { IncapacidadesDocumento } from './entities/incapacidades-documento.entity';
import { TiposIncapacidadService } from '../tipos-incapacidad/tipos-incapacidad.service';
import { CreateIncapacidadesReembolsoDto } from './dto/create-incapacidades-reembolso.dto';
import { UpdateIncapacidadesReembolsoDto } from './dto/update-incapacidades-reembolso.dto';
import { CreateIncapacidadDetalleDto } from './dto/create-incapacidad-detalle.dto';
import { PaginationQueryDto } from '../../core/utility/pagination-query.dto';
import { ResponseUtil } from '../../core/utility/response-util';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ExternalApiService } from '../api-client/service/external-api.service';

@Injectable()
export class IncapacidadesReembolsoService {
  constructor(
    @InjectRepository(IncapacidadesReembolso)
    private incapacidadesRepo: Repository<IncapacidadesReembolso>,
    @InjectRepository(IncapacidadesReembolsoDetalle)
    private detallesRepo: Repository<IncapacidadesReembolsoDetalle>,
    @InjectRepository(IncapacidadesDocumento)
    private documentosRepo: Repository<IncapacidadesDocumento>,
    private tiposService: TiposIncapacidadService,
    private dataSource: DataSource,
    private httpService: HttpService,
    private externalApiService: ExternalApiService,
  ) {}

  // =====================================================
  // CRUD PLANILLA CABECERA
  // =====================================================

  async create(createDto: CreateIncapacidadesReembolsoDto, usuarioCreacion: string = 'SYSTEM') {
    try {
      // Extraer mes y gestión de la fecha
      const fecha = new Date(createDto.fecha_planilla);
      const mesNumerico = (fecha.getMonth() + 1).toString().padStart(2, '0'); // 01, 02, 03...

      const planilla = this.incapacidadesRepo.create({
        ...createDto,
        mes: mesNumerico,
        gestion: fecha.getFullYear().toString(),
        estado: 0, // BORRADOR en tu sistema
        usuario_creacion: usuarioCreacion,
        nombre_creacion: usuarioCreacion,
      });

      const planillaSaved = await this.incapacidadesRepo.save(planilla);
      return ResponseUtil.success(planillaSaved, 'Planilla de incapacidades creada exitosamente');
    } catch (error) {
      if (error.code === '23505') { // unique constraint violation
        return ResponseUtil.error('Ya existe una planilla para este período y empresa');
      }
      throw new BadRequestException(`Error al crear planilla: ${error.message}`);
    }
  }

  async findAll(paginationQuery: PaginationQueryDto) {
    const { limit, offset } = paginationQuery;
    
    const [planillas, total] = await this.incapacidadesRepo.findAndCount({
      relations: ['empresa'],
      order: { fecha_creacion: 'DESC' },
      take: limit,
      skip: (offset - 1) * limit,
    });

    return ResponseUtil.success({
      data: planillas,
      count: total.toString(),
      page: offset,
      pageSize: limit,
    });
  }

  async findOne(id: number) {
    const planilla = await this.incapacidadesRepo.findOne({
      where: { id_incapacidad_reembolso: id },
      relations: ['empresa', 'detalles', 'detalles.tipoIncapacidad'],
    });

    if (!planilla) {
      throw new NotFoundException(`Planilla con ID ${id} no encontrada`);
    }

    return ResponseUtil.success(planilla);
  }

  async findByEmpresaAndPeriodo(codPatronal: string, fechaPlanilla: Date) {
    const planilla = await this.incapacidadesRepo.findOne({
      where: { 
        cod_patronal: codPatronal,
        fecha_planilla: fechaPlanilla,
      },
      relations: ['detalles', 'detalles.tipoIncapacidad'],
    });

    if (!planilla) {
      throw new NotFoundException('Planilla no encontrada para el período especificado');
    }

    return ResponseUtil.success(planilla);
  }

  async update(id: number, updateDto: UpdateIncapacidadesReembolsoDto, usuarioModificacion: string = 'SYSTEM') {
    const planilla = await this.incapacidadesRepo.findOne({
      where: { id_incapacidad_reembolso: id },
    });

    if (!planilla) {
      throw new NotFoundException(`Planilla con ID ${id} no encontrada`);
    }

    if (planilla.estado === 0) {
      throw new BadRequestException('Solo se pueden modificar planillas en estado BORRADOR');
    }

    await this.incapacidadesRepo.update(id, {
      ...updateDto,
      usuario_modificacion: usuarioModificacion,
      fecha_modificacion: new Date(),
    });

    return this.findOne(id);
  }

  async presentar(id: number, usuarioModificacion: string = 'SYSTEM') {
    const planilla = await this.incapacidadesRepo.findOne({
      where: { id_incapacidad_reembolso: id },
      relations: ['detalles'],
    });

    if (!planilla) {
      throw new NotFoundException(`Planilla con ID ${id} no encontrada`);
    }

    if (planilla.estado === 0) {
      throw new BadRequestException('Solo se pueden presentar planillas en estado BORRADOR');
    }

    if (!planilla.detalles || planilla.detalles.length === 0) {
      throw new BadRequestException('No se puede presentar una planilla sin trabajadores');
    }

    await this.incapacidadesRepo.update(id, {
      estado: 1, // PRESENTADO
      fecha_presentacion: new Date(),
      usuario_modificacion: usuarioModificacion,
      fecha_modificacion: new Date(),
    });

    return ResponseUtil.success({ message: 'Planilla presentada exitosamente' });
  }

  async aprobar(id: number, usuarioAprobacion: string = 'SYSTEM') {
    const planilla = await this.incapacidadesRepo.findOne({
      where: { id_incapacidad_reembolso: id },
    });

    if (!planilla) {
      throw new NotFoundException(`Planilla con ID ${id} no encontrada`);
    }

    if (planilla.estado !== 1) {
      throw new BadRequestException('Solo se pueden aprobar planillas en estado PRESENTADO');
    }

    await this.incapacidadesRepo.update(id, {
      estado: 2, // APROBADO
      fecha_aprobacion: new Date(),
      usuario_aprobacion: usuarioAprobacion,
      usuario_modificacion: usuarioAprobacion,
      fecha_modificacion: new Date(),
    });

    return ResponseUtil.success({ message: 'Planilla aprobada exitosamente' });
  }

  // =====================================================
  // GESTIÓN DE DETALLES (TRABAJADORES)
  // =====================================================

  async agregarTrabajador(createDto: CreateIncapacidadDetalleDto, usuarioCreacion: string = 'SYSTEM') {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
  
    try {
      // Verificar que la planilla existe y está en borrador
      const planilla = await this.incapacidadesRepo.findOne({
        where: { id_incapacidad_reembolso: createDto.id_incapacidad_reembolso },
      });
  
      if (!planilla) {
        throw new NotFoundException('Planilla no encontrada');
      }
  
      if (planilla.estado !== 0) {
        throw new BadRequestException('Solo se pueden agregar trabajadores a planillas en BORRADOR');
      }

      let datosBajaMedica = null;
  
      // Obtener configuración del tipo de incapacidad
      const tipoIncapacidad = await this.tiposService.findOne(createDto.id_tipo_incapacidad);
      if (!tipoIncapacidad) {
        throw new NotFoundException('Tipo de incapacidad no encontrado');
      }

      if (createDto.matricula) {
        try {
          const respuestaBajas = await this.externalApiService.buscarBajasMedicas(createDto.matricula);
          if (respuestaBajas.status && respuestaBajas.data && respuestaBajas.data.length > 0) {
            // Buscar la baja que coincida con las fechas proporcionadas
            datosBajaMedica = respuestaBajas.data.find(baja => {
              const fechaBajaInicio = new Date(baja.DIA_DESDE).toISOString().split('T')[0];
              const fechaDtoInicio = new Date(createDto.fecha_baja_medica_inicio).toISOString().split('T')[0];
              return fechaBajaInicio === fechaDtoInicio;
            });
          }
        } catch (error) {
          console.warn('No se pudieron obtener datos del servicio externo:', error.message);
        }
      }
  
  
      // Obtener datos completos del trabajador desde planillas de aportes
      const datosTrabajador = await this.obtenerDatosTrabajador(createDto.matricula, planilla.fecha_planilla);
  
      // Obtener número correlativo para el detalle
      const countQuery = `
        SELECT COUNT(*) + 1 as siguiente_nro 
        FROM transversales.incapacidades_reembolso_detalles 
        WHERE id_incapacidad_reembolso = $1
      `;
      const countResult = await this.dataSource.query(countQuery, [createDto.id_incapacidad_reembolso]);
      const siguienteNro = parseInt(countResult[0].siguiente_nro);
  
      // Validar cotizaciones previas
      const cotizacionesPrevias = await this.validarCotizacionesPrevias(
        createDto.matricula, 
        planilla.fecha_planilla,
        tipoIncapacidad.cotizaciones_minimas
      );
  
      // Calcular datos financieros
      const calculosFinancieros = this.calcularReembolso({
        fechaBajaInicio: createDto.fecha_baja_medica_inicio,
        fechaBajaFin: createDto.fecha_baja_medica_fin,
        diasIncapacidad: createDto.dias_incapacidad_inicial,
        fechaCotizacionDel: createDto.fecha_cotizacion_del,
        fechaCotizacionAl: createDto.fecha_cotizacion_al,
        salarioTotal: datosTrabajador.salario,
        porcentajeReembolso: tipoIncapacidad.porcentaje_reembolso,
        diasCarencia: tipoIncapacidad.dias_carencia,
      });

      
  
      // Crear detalle con todos los campos poblados
      const detalle = this.detallesRepo.create({
        ...createDto,
        // Número correlativo
        nro: siguienteNro,
        
        // Datos poblados desde planillas de aportes
        sexo: datosTrabajador.sexo,
        cargo: datosTrabajador.cargo,
        regional: datosTrabajador.regional,
        
        // Datos del servicio externo (si vienen en el DTO)
        comprobante: datosBajaMedica?.COMPROBANTE || createDto.comprobante || null,
      especialidad: datosBajaMedica?.ESP_NOM || createDto.especialidad || null,
      medico: datosBajaMedica?.MEDI_NOM || createDto.medico || null,
        
        // Cálculos financieros
        salario_total: datosTrabajador.salario,
        salario_dia: calculosFinancieros.salarioDia,
        dias_mes: calculosFinancieros.diasMes,
        dias_cbes: calculosFinancieros.diasCbes,
        subtotal_salario: calculosFinancieros.subtotalSalario,
        porcentaje_reembolso: tipoIncapacidad.porcentaje_reembolso,
        monto_reembolso: calculosFinancieros.montoReembolso,
        
        // Validaciones
        cotizaciones_previas: cotizacionesPrevias.cantidad,
        cumple_requisitos: cotizacionesPrevias.cumple,
        
        // Auditoría
        usuario_registro: usuarioCreacion,
      });
  
      const detalleSaved = await queryRunner.manager.save(detalle);
  
      // Actualizar totales de la planilla
      await this.actualizarTotalesPlanilla(createDto.id_incapacidad_reembolso, queryRunner);
  
      await queryRunner.commitTransaction();
      return ResponseUtil.success(detalleSaved, 'Trabajador agregado exitosamente');
  
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

   // =====================================================
  // HELPERS PARA CÁLCULOS
  // =====================================================

  private calcularReembolso(params: {
    fechaBajaInicio: Date,
    fechaBajaFin: Date,
    diasIncapacidad: number,
    fechaCotizacionDel: Date,
    fechaCotizacionAl: Date,
    salarioTotal: number,
    porcentajeReembolso: number,
    diasCarencia: number,
  }) {
    const { 
      fechaBajaInicio,
      fechaBajaFin,
      fechaCotizacionDel, 
      fechaCotizacionAl, 
      salarioTotal, 
      porcentajeReembolso, 
      diasCarencia 
    } = params;
  
    // CONVERTIR A DATE SI SON STRINGS
    const fechaBajaInicioDate = new Date(fechaBajaInicio);
    const fechaBajaFinDate = new Date(fechaBajaFin);
    const fechaCotizacionDelDate = new Date(fechaCotizacionDel);
    const fechaCotizacionAlDate = new Date(fechaCotizacionAl);
  
    // Calcular intersección entre período de baja y período de planilla
    const inicioReembolso = fechaCotizacionDelDate > fechaBajaInicioDate ? fechaCotizacionDelDate : fechaBajaInicioDate;
    const finReembolso = fechaCotizacionAlDate < fechaBajaFinDate ? fechaCotizacionAlDate : fechaBajaFinDate;
    
    // Si no hay intersección, no hay días a reembolsar
    if (inicioReembolso > finReembolso) {
      return {
        diasMes: 0,
        diasCbes: 0,
        salarioDia: Math.round((salarioTotal / 30) * 100) / 100,
        subtotalSalario: 0,
        montoReembolso: 0,
      };
    }

    // Calcular días del período de intersección
    const diasMes = Math.floor((finReembolso.getTime() - inicioReembolso.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // Calcular días que corresponden a CBES (descontando carencia)
    let diasCbes = diasMes;
    if (diasCarencia > 0) {
      // Para enfermedad común, descontar 3 días de carencia solo si la baja inicia en este período
      const bajaIniciaEnPeriodo = fechaBajaInicio >= fechaCotizacionDel;
      if (bajaIniciaEnPeriodo) {
        diasCbes = Math.max(0, diasMes - diasCarencia);
      }
      // Si la baja empezó antes del período, no se descuenta carencia
    }

    // Cálculos financieros
    const salarioDia = salarioTotal / 30; // Mes comercial
    const subtotalSalario = salarioDia * diasCbes;
    const montoReembolso = (subtotalSalario * porcentajeReembolso) / 100;

    return {
      diasMes,
      diasCbes,
      salarioDia: Math.round(salarioDia * 100) / 100,
      subtotalSalario: Math.round(subtotalSalario * 100) / 100,
      montoReembolso: Math.round(montoReembolso * 100) / 100,
    };
  }

  private async obtenerSalarioTrabajador(matricula: string, fechaPlanilla: Date): Promise<number> {
    // Query para buscar el salario más reciente del trabajador
    const query = `
      SELECT pad.salario, pa.fecha_planilla
      FROM transversales.planilla_aportes_detalles pad
      INNER JOIN transversales.planillas_aportes pa ON pad.id_planilla_aportes = pa.id_planilla_aportes
      WHERE pad.matricula = $1 
        AND pa.fecha_planilla <= $2
        AND pa.estado = 2
      ORDER BY pa.fecha_planilla DESC
      LIMIT 1
    `;

    const result = await this.dataSource.query(query, [matricula, fechaPlanilla]);
    
    if (!result || result.length === 0) {
      // Si no encuentra con la fecha límite, buscar el más reciente sin límite
      const queryAlternativo = `
        SELECT pad.salario, pa.fecha_planilla
        FROM transversales.planilla_aportes_detalles pad
        INNER JOIN transversales.planillas_aportes pa ON pad.id_planilla_aportes = pa.id_planilla_aportes
        WHERE pad.matricula = $1 
          AND pa.estado = 2
        ORDER BY pa.fecha_planilla DESC
        LIMIT 1
      `;
      
      const resultAlternativo = await this.dataSource.query(queryAlternativo, [matricula]);
      
      if (!resultAlternativo || resultAlternativo.length === 0) {
        throw new BadRequestException(`No se encontró salario para el trabajador con matrícula ${matricula} en planillas aprobadas`);
      }
      
      console.log(`Salario encontrado (búsqueda alternativa) para ${matricula}: ${resultAlternativo[0].salario} de fecha ${resultAlternativo[0].fecha_planilla}`);
      return parseFloat(resultAlternativo[0].salario);
    }

    console.log(`Salario encontrado para ${matricula}: ${result[0].salario} de fecha ${result[0].fecha_planilla}`);
    return parseFloat(result[0].salario);
  }

  private async obtenerDatosTrabajador(matricula: string, fechaPlanilla: Date) {
    const query = `
      SELECT 
        pad.salario,
        COALESCE(pad.sexo, 'M') as sexo,
        COALESCE(pad.cargo, 'NO ESPECIFICADO') as cargo,
        COALESCE(pad.regional, 'LA PAZ') as regional
      FROM transversales.planilla_aportes_detalles pad
      INNER JOIN transversales.planillas_aportes pa ON pad.id_planilla_aportes = pa.id_planilla_aportes
      WHERE pad.matricula = $1 
        AND pa.fecha_planilla <= $2
        AND pa.estado = 2
      ORDER BY pa.fecha_planilla DESC
      LIMIT 1
    `;
  
    const result = await this.dataSource.query(query, [matricula, fechaPlanilla]);
    
    if (!result || result.length === 0) {
      throw new BadRequestException(`No se encontraron datos para el trabajador con matrícula ${matricula}`);
    }
  
    return {
      salario: parseFloat(result[0].salario),
      sexo: result[0].sexo,
      cargo: result[0].cargo,
      regional: result[0].regional,
    };
  }



  private async validarCotizacionesPrevias(
    matricula: string, 
    fechaPlanilla: Date, 
    cotizacionesRequeridas: number
  ) {
    // Query para contar cotizaciones previas
    const query = `
      SELECT COUNT(*) as cantidad
      FROM transversales.planilla_aportes_detalles pad
      INNER JOIN transversales.planillas_aportes pa ON pad.id_planilla_aportes = pa.id_planilla_aportes
      WHERE pad.matricula = $1 
        AND pa.fecha_planilla < $2
        AND pa.estado = 2
    `;

    const result = await this.dataSource.query(query, [matricula, fechaPlanilla]);
    const cantidad = parseInt(result[0]?.cantidad || '0');
    
    return {
      cantidad,
      cumple: cantidad >= cotizacionesRequeridas,
    };
  }

  private async actualizarTotalesPlanilla(idPlanilla: number, queryRunner: any) {
    // Query para obtener totales por tipo
    const query = `
      SELECT 
        ti.codigo,
        COALESCE(SUM(ird.monto_reembolso), 0) as total,
        COUNT(*) as trabajadores
      FROM transversales.incapacidades_reembolso_detalles ird
      INNER JOIN transversales.tipos_incapacidad ti ON ird.id_tipo_incapacidad = ti.id_tipo_incapacidad
      WHERE ird.id_incapacidad_reembolso = $1 AND ird.estado = 'ACTIVO'
      GROUP BY ti.codigo
    `;

    const totales = await queryRunner.query(query, [idPlanilla]);
    
    let totalReembolso = 0;
    let totalTrabajadores = 0;
    let totalEnfermedadComun = 0;
    let totalMaternidad = 0;
    let totalRiesgoProfesional = 0;
    let totalEnfermedadProfesional = 0;

    totales.forEach((total: any) => {
      const monto = parseFloat(total.total);
      const trabajadores = parseInt(total.trabajadores);
      
      totalReembolso += monto;
      totalTrabajadores += trabajadores;

      switch (total.codigo) {
        case 'ENFERMEDAD_COMUN':
          totalEnfermedadComun = monto;
          break;
        case 'MATERNIDAD':
          totalMaternidad = monto;
          break;
        case 'RIESGO_PROFESIONAL':
          totalRiesgoProfesional = monto;
          break;
        case 'ENFERMEDAD_PROFESIONAL':
          totalEnfermedadProfesional = monto;
          break;
      }
    });

    // Actualizar planilla
    await queryRunner.query(`
      UPDATE transversales.incapacidades_reembolso 
      SET 
        total_reembolso = $2,
        total_trabajadores = $3,
        total_enfermedad_comun = $4,
        total_maternidad = $5,
        total_riesgo_profesional = $6,
        total_enfermedad_profesional = $7,
        fecha_modificacion = NOW()
      WHERE id_incapacidad_reembolso = $1
    `, [
      idPlanilla,
      totalReembolso,
      totalTrabajadores,
      totalEnfermedadComun,
      totalMaternidad,
      totalRiesgoProfesional,
      totalEnfermedadProfesional,
    ]);
  }

  // =====================================================
  // INTEGRACIÓN CON SERVICIO EXTERNO (usando tu external-api.service)
  // =====================================================

  async buscarBajasMedicas(matricula: string) {
    try {
      return await this.externalApiService.buscarBajasMedicas(matricula);
    } catch (error) {
      return ResponseUtil.error(`Error al consultar bajas médicas: ${error.message}`);
    }
  }

  // =====================================================
  // HELPER PARA MAPEAR TIPO DE BAJA A TIPO INCAPACIDAD
  // =====================================================

  private async mapearTipoBajaAIncapacidad(tipoBaja: string): Promise<number> {
    const tipoLimpio = tipoBaja.trim().toUpperCase();
    
    let codigoTipo: string;
    
    switch (tipoLimpio) {
      case 'ENFERMEDAD':
      case 'ENFERMEDAD COMUN':
      case 'ENFERMEDAD_COMUN':
        codigoTipo = 'ENFERMEDAD_COMUN';
        break;
      case 'MATERNIDAD':
        codigoTipo = 'MATERNIDAD';
        break;
      case 'ACCIDENTE':
      case 'ACCIDENTE DE TRABAJO':
      case 'RIESGO PROFESIONAL':
        codigoTipo = 'RIESGO_PROFESIONAL';
        break;
      case 'ENFERMEDAD PROFESIONAL':
        codigoTipo = 'ENFERMEDAD_PROFESIONAL';
        break;
      default:
        // Por defecto, asume enfermedad común
        codigoTipo = 'ENFERMEDAD_COMUN';
    }

    const tipo = await this.tiposService.findByCode(codigoTipo);
    if (!tipo) {
      throw new BadRequestException(`Tipo de incapacidad '${codigoTipo}' no encontrado`);
    }

    return tipo.id_tipo_incapacidad;
  }

}