import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { SolicitudesReembolso } from './entities/solicitudes_reembolso.entity';
import { DetallesReembolso } from './entities/detalles_reembolso.entity';
import { CreateSolicitudesReembolsoDto } from './dto/create-solicitudes_reembolso.dto';
import { UpdateSolicitudesReembolsoDto } from './dto/update-solicitudes_reembolso.dto';
import { EmpresasService } from '../../empresas/empresas.service';
import { ExternalApiService } from '../../api-client/service/external-api.service';

@Injectable()
export class ReembolsosIncapacidadesService {
  constructor(
    @InjectRepository(SolicitudesReembolso)
    private readonly reembolsoRepo: Repository<SolicitudesReembolso>,
    private readonly empresasService: EmpresasService,
    @InjectRepository(DetallesReembolso)
    private readonly detalleRepo: Repository<DetallesReembolso>,
    private readonly externalApiService: ExternalApiService,
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