import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { SolicitudesReembolso } from './entities/solicitudes_reembolso.entity';
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
  async obtenerSolicitudesPorCodPatronal(
    cod_patronal: string,
    pagina: number = 1,
    limite: number = 10,
    busqueda: string = '',
    mes?: string,
    anio?: string
  ) {
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
  
}