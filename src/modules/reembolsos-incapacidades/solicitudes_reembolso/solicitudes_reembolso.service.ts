import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { SolicitudesReembolso } from './entities/solicitudes_reembolso.entity';
import { DetallesReembolso } from './entities/detalles_reembolso.entity';
import { CreateSolicitudesReembolsoDto } from './dto/create-solicitudes_reembolso.dto';
import { UpdateSolicitudesReembolsoDto } from './dto/update-solicitudes_reembolso.dto';
import { EmpresasService } from '../../empresas/empresas.service';
import { ExternalApiService } from '../../api-client/service/external-api.service';
import { PlanillasAportesService } from '../../planillas_aportes/planillas_aportes.service';

@Injectable()
export class ReembolsosIncapacidadesService {
  constructor(
    @InjectRepository(SolicitudesReembolso)
    private readonly reembolsoRepo: Repository<SolicitudesReembolso>,
    private readonly empresasService: EmpresasService,
    @InjectRepository(DetallesReembolso)
    private readonly detalleRepo: Repository<DetallesReembolso>,
    private readonly externalApiService: ExternalApiService,
    private readonly planillasService: PlanillasAportesService,
  ) {}

  //1.- CREAR SOLICITUD MENSUAL DE REEMBOLSO ----------------------------------------------------------------------------------------
  async crearSolictudMensual(createDto: CreateSolicitudesReembolsoDto) {
    const { cod_patronal, mes, gestion, usuario_creacion, nombre_creacion } = createDto;

    // Validar empresa
    const empresa = await this.empresasService.findByCodPatronal(cod_patronal);
    if (!empresa) {
      throw new BadRequestException('No se encontró una empresa con el código patronal proporcionado');
    }

    // Validar tipo de empresa
    const tipoEmpresa = empresa.tipo?.toUpperCase();
    if (!tipoEmpresa) {
      throw new BadRequestException('No se pudo determinar el tipo de empresa');
    }
    if (!['PA', 'AP', 'AV', 'VA'].includes(tipoEmpresa)) {
      throw new BadRequestException(`Tipo de empresa no válido: ${tipoEmpresa}`);
    }

    // Crear fecha_planilla para validación de unicidad
    const fechaSolicitud = new Date(`${gestion}-${mes.padStart(2, '0')}-01`);

    // Validar que no exista una solicitud para el mismo mes/gestión
    const solicitudExistente = await this.reembolsoRepo.findOne({
      where: { cod_patronal, mes, gestion },
    });
    if (solicitudExistente) {
      throw new BadRequestException(`Ya existe una solicitud de reembolso para ${mes}/${gestion} con este código patronal`);
    }

    // Crear solicitud
    const nuevaSolicitud = this.reembolsoRepo.create({
      cod_patronal,
      id_empresa: empresa.id_empresa,
      mes,
      gestion,
      tipo_empresa: tipoEmpresa || 'FALLA EN REGISTRO',
      estado: 0, // BORRADOR
      fecha_solicitud: fechaSolicitud,
      usuario_creacion: usuario_creacion || 'FALLA EN REGISTRO',
      nombre_creacion: nombre_creacion || 'FALLA EN REGISTRO',
      total_reembolso: 0,
      total_trabajadores: 0,
    });

    const solicitudGuardada = await this.reembolsoRepo.save(nuevaSolicitud);

    console.log(`📊 Solicitud de reembolso creada:
    - ID: ${solicitudGuardada.id_solicitud_reembolso}
    - Código Patronal: ${cod_patronal}
    - Mes/Gestión: ${mes}/${gestion}
    - Tipo Empresa: ${tipoEmpresa}`);

    return {
      mensaje: '✅ Solicitud de reembolso guardada con éxito',
      id_solicitud: solicitudGuardada.id_solicitud_reembolso,
    };
  }
  //2.- OBTENER SOLICITUD POR ID ----------------------------------------------------------------------------------------------------
  async obtenerSolicitudPorId(id: number) {
    const solicitud = await this.reembolsoRepo.findOne({
      where: { id_solicitud_reembolso: id },
      relations: ['empresa'], // Para mostrar datos de empresa
    });
    if (!solicitud) throw new NotFoundException('Solicitud no encontrada');
    return solicitud;
  }
  //3.- OBTENER TODAS LAS SOLICITUDES POR CODIGO PATRONAL CON PAGINACIÓN Y FILTROS -------------------------------------------------------------------------
  async obtenerSolicitudesPorCodPatronal(cod_patronal: string,pagina: number = 1,limite: number = 10,busqueda: string = '',mes?: string,anio?: string) {
    try {
      // Validar parámetros
      if (pagina < 1 || limite < 1) {
        throw new BadRequestException('La página y el límite deben ser mayores que 0');
      }
      if (mes && (isNaN(Number(mes)) || Number(mes) < 1 || Number(mes) > 12)) {
        throw new BadRequestException('El mes debe ser un número entre 1 y 12');
      }
      if (anio && (isNaN(Number(anio)) || Number(anio) < 1900 || Number(anio) > 2100)) {
        throw new BadRequestException('El año debe ser un número válido (1900-2100)');
      }

      // Validar empresa
      const empresa = await this.empresasService.findByCodPatronal(cod_patronal);
      if (!empresa) {
        throw new BadRequestException('Empresa no encontrada');
      }

      const skip = (pagina - 1) * limite;

      const query = this.reembolsoRepo.createQueryBuilder('solicitud')
        .leftJoinAndSelect('solicitud.empresa', 'empresa')
        .where('TRIM(LOWER(solicitud.cod_patronal)) = TRIM(LOWER(:cod_patronal))', { cod_patronal })
        .orderBy('solicitud.fecha_creacion', 'DESC')
        .skip(skip)
        .take(limite);

      // Filtro por mes
      if (mes) {
        query.andWhere('CAST(solicitud.mes AS TEXT) = :mes', { mes });
      }

      // Filtro por año
      if (anio) {
        query.andWhere('CAST(solicitud.gestion AS TEXT) = :anio', { anio });
      }

      // Búsqueda en todos los campos
      if (busqueda) {
        query.andWhere(
          new Brackets(qb => {
            qb.where('CAST(solicitud.id_solicitud_reembolso AS TEXT) LIKE :busqueda')
              .orWhere('CAST(solicitud.mes AS TEXT) LIKE :busqueda')
              .orWhere('CAST(solicitud.gestion AS TEXT) LIKE :busqueda')
              .orWhere('solicitud.cod_patronal LIKE :busqueda')
              .orWhere('empresa.emp_nom LIKE :busqueda')
              .orWhere('solicitud.tipo_empresa LIKE :busqueda')
              .orWhere('CAST(solicitud.total_reembolso AS TEXT) LIKE :busqueda')
              .orWhere('CAST(solicitud.total_trabajadores AS TEXT) LIKE :busqueda')
              .orWhere('CAST(solicitud.estado AS TEXT) LIKE :busqueda')
              .orWhere('solicitud.usuario_creacion LIKE :busqueda')
              .orWhere('solicitud.nombre_creacion LIKE :busqueda');
          }),
          { busqueda: `%${busqueda}%` }
        );
      }

      // Obtener los resultados
      const [solicitudes, total] = await query.getManyAndCount();

      if (!solicitudes.length) {
        return {
          mensaje: 'No hay solicitudes de reembolso registradas para este código patronal',
          solicitudes: [],
          total: 0,
          pagina,
          limite,
        };
      }

      return {
        mensaje: 'Solicitudes de reembolso obtenidas con éxito',
        solicitudes,
        total,
        pagina,
        limite,
      };
    } catch (error) {
      throw new BadRequestException(`Error al obtener las solicitudes de reembolso: ${error.message}`);
    }
  }
    //4.- CREAR DETALLE DE REEMBOLSO ----------------------------------------------------------------------------------------
  async crearDetalle(createDetalleDto: any) {
    try {
      // Verificar que la solicitud existe y está en estado BORRADOR (0)
      const solicitud = await this.reembolsoRepo.findOne({
        where: { id_solicitud_reembolso: createDetalleDto.id_solicitud_reembolso }
      });

      if (!solicitud) {
        throw new NotFoundException('No se encontró la solicitud de reembolso');
      }

      if (solicitud.estado !== 0) {
        throw new BadRequestException('Solo se pueden agregar detalles a solicitudes en estado BORRADOR');
      }

      // Crear el detalle
      const nuevoDetalle = this.detalleRepo.create({
        id_solicitud_reembolso: createDetalleDto.id_solicitud_reembolso,
        nro: createDetalleDto.nro,
        ci: createDetalleDto.ci,
        apellido_paterno: createDetalleDto.apellido_paterno,
        apellido_materno: createDetalleDto.apellido_materno,
        nombres: createDetalleDto.nombres,
        matricula: createDetalleDto.matricula,
        tipo_incapacidad: createDetalleDto.tipo_incapacidad,
        fecha_inicio_baja: new Date(createDetalleDto.fecha_inicio_baja),
        fecha_fin_baja: new Date(createDetalleDto.fecha_fin_baja),
        dias_incapacidad: createDetalleDto.dias_incapacidad,
        dias_reembolso: createDetalleDto.dias_reembolso,
        salario: createDetalleDto.salario,
        monto_dia: createDetalleDto.monto_dia,
        porcentaje_reembolso: createDetalleDto.porcentaje_reembolso,
        monto_reembolso: createDetalleDto.monto_reembolso,
        cotizaciones_previas_verificadas: createDetalleDto.cotizaciones_previas_verificadas || 0,
        observaciones_afiliacion: createDetalleDto.observaciones_afiliacion,
        observaciones: createDetalleDto.observaciones,
        usuario_creacion: createDetalleDto.usuario_creacion || 'SYSTEM'
      });

      const detalleGuardado = await this.detalleRepo.save(nuevoDetalle);

      // Actualizar los totales de la solicitud
      await this.recalcularTotalesSolicitud(createDetalleDto.id_solicitud_reembolso);

      return {
        mensaje: 'Detalle de reembolso creado exitosamente',
        id_detalle: detalleGuardado.id_detalle_reembolso,
        detalle: detalleGuardado
      };

    } catch (error) {
      console.error('Error al crear detalle de reembolso:', error);
      throw error;
    }
  }

  //5.- OBTENER DETALLES POR ID DE SOLICITUD ----------------------------------------------------------------------------------------
  async obtenerDetallesPorSolicitud(idSolicitud: number) {
    try {
      const detalles = await this.detalleRepo.find({
        where: { id_solicitud_reembolso: idSolicitud },
        order: { nro: 'ASC' }
      });

      return {
        mensaje: 'Detalles obtenidos exitosamente',
        detalles: detalles,
        total: detalles.length
      };

    } catch (error) {
      console.error('Error al obtener detalles:', error);
      throw new BadRequestException('Error al obtener los detalles de reembolso');
    }
  }

  //6.- ELIMINAR DETALLE ----------------------------------------------------------------------------------------
  async eliminarDetalle(idDetalle: number) {
    try {
      // Buscar el detalle
      const detalle = await this.detalleRepo.findOne({
        where: { id_detalle_reembolso: idDetalle },
        relations: ['solicitud_reembolso']
      });

      if (!detalle) {
        throw new NotFoundException('No se encontró el detalle de reembolso');
      }

      // Verificar que la solicitud esté en estado BORRADOR
      if (detalle.solicitud_reembolso.estado !== 0) {
        throw new BadRequestException('Solo se pueden eliminar detalles de solicitudes en estado BORRADOR');
      }

      const idSolicitud = detalle.id_solicitud_reembolso;

      // Eliminar el detalle
      await this.detalleRepo.remove(detalle);

      // Recalcular números correlativos
      await this.recalcularNumerosCorrelativos(idSolicitud);

      // Actualizar totales
      await this.recalcularTotalesSolicitud(idSolicitud);

      return {
        mensaje: 'Detalle eliminado exitosamente'
      };

    } catch (error) {
      console.error('Error al eliminar detalle:', error);
      throw error;
    }
  }

  //7.- ACTUALIZAR TOTALES DE SOLICITUD ----------------------------------------------------------------------------------------
  async actualizarTotales(idSolicitud: number, totales: any) {
    try {
      const solicitud = await this.reembolsoRepo.findOne({
        where: { id_solicitud_reembolso: idSolicitud }
      });

      if (!solicitud) {
        throw new NotFoundException('No se encontró la solicitud de reembolso');
      }

      // Actualizar totales
      solicitud.total_reembolso = totales.total_reembolso;
      solicitud.total_trabajadores = totales.total_trabajadores;
      solicitud.usuario_modificacion = totales.usuario_modificacion || 'SYSTEM';
      solicitud.fecha_modificacion = new Date();

      await this.reembolsoRepo.save(solicitud);

      return {
        mensaje: 'Totales actualizados exitosamente',
        solicitud: solicitud
      };

    } catch (error) {
      console.error('Error al actualizar totales:', error);
      throw error;
    }
  }

// TODO : CALCULO DE BAJAS 

//8.- CALCULAR REEMBOLSO CON DATOS REALES ----------------------------------------------------------------------------------------
/* async calcularReembolsoConDatosReales(calcularDto: any) {
  try {
    const { matricula, cod_patronal, mes, gestion, baja_medica } = calcularDto;

    // 1. Buscar datos del trabajador en planillas de aportes usando el método correcto
    const detallesTrabajador = await this.planillasService.obtenerDetallesDeMes(
      cod_patronal, mes, gestion
    );

    // 2. Buscar el trabajador específico por matrícula
    const trabajador = detallesTrabajador.find(
      (detalle: any) => detalle.matricula === matricula
    );

    if (!trabajador) {
      throw new NotFoundException(
        `No se encontró el trabajador con matrícula ${matricula} en la planilla de ${mes}/${gestion}`
      );
    }

    // 3. Extraer datos reales del trabajador
    const datosReales = {
      ci: trabajador.ci,
      apellido_paterno: trabajador.apellido_paterno,
      apellido_materno: trabajador.apellido_materno,
      nombres: trabajador.nombres,
      salario_total: Number(trabajador.salario), // Total ganado real
      haber_basico: Number(trabajador.haber_basico || 0),
      bono_antiguedad: Number(trabajador.bono_antiguedad || 0),
      horas_extra: Number(trabajador.monto_horas_extra || 0),
      horas_extra_nocturnas: Number(trabajador.monto_horas_extra_nocturnas || 0),
      otros_bonos: Number(trabajador.otros_bonos_pagos || 0),
      dias_pagados: Number(trabajador.dias_pagados || 30),
      cargo: trabajador.cargo,
      matricula: trabajador.matricula
    };

    // 4. Realizar cálculos según PDF (casos complejos)
    const calculoDetallado = await this.calcularSegunCasosPDF(baja_medica, datosReales, mes, gestion);

    return {
      mensaje: 'Cálculo realizado exitosamente',
      datos_trabajador: datosReales,
      baja_medica: baja_medica,
      calculo: calculoDetallado
    };

  } catch (error) {
    console.error('Error al calcular reembolso:', error);
    throw error;
  }
} */

//8.- CALCULAR REEMBOLSO CON DATOS QUEMADOS ----------------------------------------------------------------------------------------
async calcularReembolsoConDatosReales(calcularDto: any) {
  try {
    const { matricula, cod_patronal, mes, gestion, baja_medica } = calcularDto;

    // TEMPORALMENTE COMENTAMOS LA VALIDACIÓN DE PLANILLAS
    /*
    // 1. Buscar datos del trabajador en planillas de aportes usando el método correcto
    const detallesTrabajador = await this.planillasService.obtenerDetallesDeMes(
      cod_patronal, mes, gestion
    );

    // 2. Buscar el trabajador específico por matrícula
    const trabajador = detallesTrabajador.find(
      (detalle: any) => detalle.matricula === matricula
    );

    if (!trabajador) {
      throw new NotFoundException(
        `No se encontró el trabajador con matrícula ${matricula} en la planilla de ${mes}/${gestion}`
      );
    }
    */

    // 3. DATOS TEMPORALES (extraer CI de matrícula)
    const ci = matricula.split(' ')[0];
    const datosReales = {
      ci: ci,
      apellido_paterno: 'APELLIDO_PATERNO', // Temporal
      apellido_materno: 'APELLIDO_MATERNO', // Temporal
      nombres: 'NOMBRES_COMPLETOS',         // Temporal
      salario_total: 8851,                  // Temporal
      haber_basico: 8851,                   // Temporal
      bono_antiguedad: 0,                 // Temporal
      horas_extra: 0,                     // Temporal
      horas_extra_nocturnas: 0,           // Temporal
      otros_bonos: 0,                       // Temporal
      dias_pagados: 30,                     // Temporal
      cargo: 'CARGO_TEMPORAL',              // Temporal
      matricula: matricula
    };

    // 4. Realizar cálculos según PDF (casos complejos)
    const calculoDetallado = await this.calcularSegunCasosPDF(baja_medica, datosReales, mes, gestion);
    console.log('calculoDetallado', calculoDetallado);

    return {
      mensaje: 'Cálculo realizado exitosamente (MODO TEMPORAL)',
      datos_trabajador: datosReales,
      baja_medica: baja_medica,
      calculo: calculoDetallado
    };

  } catch (error) {
    console.error('Error al calcular reembolso:', error);
    throw error;
  }
}
//MÉTODO AUXILIAR PARA CÁLCULOS SEGÚN PDF ----------------------------------------------------------------------------------------
private async calcularSegunCasosPDF(bajaMedica: any, datosWorker: any, mesReembolso: string, gestionReembolso: string) {
  // Extraer fechas de la baja médica
  const fechaInicioBaja = new Date(bajaMedica.DIA_DESDE);
  const fechaFinBaja = new Date(bajaMedica.DIA_HASTA);
  
  // CALCULAR DÍAS CORRECTAMENTE (fecha fin - fecha inicio, SIN incluir último día)
  const milisecondsDiff = fechaFinBaja.getTime() - fechaInicioBaja.getTime();
  const diasCalculados = Math.floor(milisecondsDiff / (1000 * 60 * 60 * 24));
  
  console.log('fechaInicioBaja', fechaInicioBaja);
  console.log('fechaFinBaja', fechaFinBaja);
  console.log('diasCalculados', diasCalculados);
  console.log('DIAS_IMPEDIMENTO original', bajaMedica.DIAS_IMPEDIMENTO);
  
  // Usar días calculados en lugar del DIAS_IMPEDIMENTO
  const diasTotalesIncapacidad = diasCalculados;
  
  // Determinar tipo de incapacidad
  const tipoIncapacidad = bajaMedica.TIPO_BAJA.trim();
  
  // Porcentajes según tipo
  const porcentajes = {
    'ENFERMEDAD': 75,
    'MATERNIDAD': 90,
    'PROFESIONAL': 90
  };
  
  const porcentajeReembolso = porcentajes[tipoIncapacidad] || 75;
  
  // Calcular días de reembolso según tipo
  let diasReembolso = 0;
  
  if (tipoIncapacidad === 'ENFERMEDAD') {
    // Para enfermedad común, se descuentan los primeros 3 días
    diasReembolso = Math.max(0, diasTotalesIncapacidad - 3);
  } else if (tipoIncapacidad === 'MATERNIDAD') {
    // Para maternidad, máximo 90 días
    diasReembolso = Math.min(diasTotalesIncapacidad, 90);
  } else if (tipoIncapacidad === 'PROFESIONAL') {
    // Para riesgo profesional, todos los días desde el primer día
    diasReembolso = diasTotalesIncapacidad;
  }
  
  // Cálculos financieros
  const salarioDiario = datosWorker.salario_total / 30; // Mes comercial
  const montoReembolso = (salarioDiario * diasReembolso * porcentajeReembolso) / 100;
  
  console.log('tipoIncapacidad', tipoIncapacidad);
  console.log('diasTotalesIncapacidad', diasTotalesIncapacidad);
  console.log('diasReembolso', diasReembolso);
  console.log('porcentajeReembolso', porcentajeReembolso);
  console.log('salarioDiario', salarioDiario);
  console.log('montoReembolso', montoReembolso);
  
  return {
    tipo_incapacidad: tipoIncapacidad,
    fecha_inicio_baja: fechaInicioBaja.toISOString().split('T')[0],
    fecha_fin_baja: fechaFinBaja.toISOString().split('T')[0],
    dias_incapacidad: diasTotalesIncapacidad, // Ahora usa días calculados
    dias_reembolso: diasReembolso,
    salario: datosWorker.salario_total,
    monto_dia: parseFloat(salarioDiario.toFixed(6)),
    porcentaje_reembolso: porcentajeReembolso,
    monto_reembolso: parseFloat(montoReembolso.toFixed(6)),
    desglose_salarial: {
      haber_basico: datosWorker.haber_basico,
      bono_antiguedad: datosWorker.bono_antiguedad,
      horas_extra: datosWorker.horas_extra,
      horas_extra_nocturnas: datosWorker.horas_extra_nocturnas,
      otros_bonos: datosWorker.otros_bonos
    }
  };
}














  //MÉTODOS AUXILIARES ----------------------------------------------------------------------------------------

  private async recalcularTotalesSolicitud(idSolicitud: number) {
    // Obtener todos los detalles de la solicitud
    const detalles = await this.detalleRepo.find({
      where: { id_solicitud_reembolso: idSolicitud }
    });

    // Calcular totales
    const totalReembolso = detalles.reduce((sum, detalle) => sum + Number(detalle.monto_reembolso), 0);
    const totalTrabajadores = detalles.length;

    // Actualizar la solicitud
    await this.reembolsoRepo.update(idSolicitud, {
      total_reembolso: totalReembolso,
      total_trabajadores: totalTrabajadores,
      fecha_modificacion: new Date()
    });
  }

  private async recalcularNumerosCorrelativos(idSolicitud: number) {
    const detalles = await this.detalleRepo.find({
      where: { id_solicitud_reembolso: idSolicitud },
      order: { fecha_creacion: 'ASC' }
    });

    // Actualizar números correlativos
    for (let i = 0; i < detalles.length; i++) {
      await this.detalleRepo.update(detalles[i].id_detalle_reembolso, {
        nro: i + 1
      });
    }
  }

  
}