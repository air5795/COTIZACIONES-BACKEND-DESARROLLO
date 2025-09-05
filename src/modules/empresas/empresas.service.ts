import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empresa } from './entities/empresa.entity';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ExternalApiService } from '../../modules/api-client/service/external-api.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmpresasService {
  constructor(
    @InjectRepository(Empresa)
    private readonly empresaRepository: Repository<Empresa>,
    private readonly externalApiService: ExternalApiService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  // Sincronizar empresas desde el Servicio 2
  async syncEmpresas(): Promise<void> {
    try {
      // Asegurarse de que el token esté disponible
      if (!this.externalApiService.getApiToken()) {
        await this.externalApiService.loginToExternalApi();
      }

      const empresas = await this.externalApiService.getAllEmpresas();

      for (const emp of empresas) {
        const empresaDto: CreateEmpresaDto = {
          emp_cod: emp.EMP_COD,
          emp_reg: emp.EMP_REG,
          cod_patronal: emp.EMP_NPATRONAL,
          emp_nom: emp.EMP_NOM,
          emp_legal: emp.EMP_LEGAL || null,
          emp_activ: emp.EMP_ACTIV || null,
          emp_ntrab: emp.EMP_NTRAB,
          emp_calle: emp.EMP_CALLE || null,
          emp_num: emp.EMP_NUM || null,
          emp_telf: emp.EMP_TELF || null,
          emp_zona: emp.EMP_ZONA || null,
          emp_localidad: emp.EMP_LOCALIDAD || null,
          emp_fini_act: emp.EMP_FINI_ACT || null,
          emp_lug: emp.EMP_LUG || null,
          emp_fec: emp.EMP_FEC || null,
          emp_usu: emp.EMP_USU || null,
          emp_estado: emp.EMP_ESTADO,
          emp_fec_baja: emp.EMP_FEC_BAJA || null,
          emp_obs: emp.EMP_OBS || null,
          tipo: emp.TIPO || null,
          emp_nom_corto: emp.EMP_NOM_CORTO || null,
          emp_nit: emp.EMP_NIT || null,
          emp_matricula: emp.EMP_MATRICULA || null,
          fecha_registro: emp.FECHA_REGISTRO || null,
          fecha_modificacion: emp.FECHA_MODIFICACION || null,
          usuario_registro: emp.USUARIO_REGISTRO || null,
          usuario_modificacion: emp.USUARIO_MODIFICACION || null,
          emp_cod_entidad: emp.EMP_COD_ENTIDAD || null,
        };

        // Buscar si la empresa ya existe por cod_patronal
        const existingEmpresa = await this.empresaRepository.findOne({ where: { cod_patronal: emp.EMP_NPATRONAL } });
        if (existingEmpresa) {
          // Actualizar
          await this.empresaRepository.update(existingEmpresa.id_empresa, empresaDto);
        } else {
          // Crear
          await this.empresaRepository.save(empresaDto);
        }
      }
    } catch (error) {
      throw new HttpException('Error al sincronizar empresas: ' + error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
}

  // CRUD Operations
  async create(createEmpresaDto: CreateEmpresaDto): Promise<Empresa> {
    const empresa = this.empresaRepository.create(createEmpresaDto);
    return this.empresaRepository.save(empresa);
  }

  async findAll(): Promise<Empresa[]> {
    return this.empresaRepository.find();
  }

  async findOne(id: number): Promise<Empresa> {
    const empresa = await this.empresaRepository.findOne({ where: { id_empresa: id } });
    if (!empresa) {
      throw new HttpException('Empresa no encontrada', HttpStatus.NOT_FOUND);
    }
    return empresa;
  }

  async findByCodPatronal(codPatronal: string): Promise<Empresa> {
    const empresa = await this.empresaRepository.findOne({ where: { cod_patronal: codPatronal } });
    if (!empresa) {
      throw new HttpException('Empresa no encontrada', HttpStatus.NOT_FOUND);
    }
    return empresa;
  }

  async update(id: number, updateEmpresaDto: UpdateEmpresaDto): Promise<Empresa> {
    const empresa = await this.findOne(id);
    await this.empresaRepository.update(id, updateEmpresaDto);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const empresa = await this.findOne(id);
    await this.empresaRepository.delete(id);
  }

  // Método para obtener el tipo de empresa por cod_patronal
  async findTipoByCodPatronal(codPatronal: string): Promise<string> {
    const empresa = await this.empresaRepository.findOne({
      where: { cod_patronal: codPatronal },
      select: ['tipo'], // Selecciona solo la columna 'tipo'
    });
    if (!empresa) {
      throw new HttpException('Empresa no encontrada', HttpStatus.NOT_FOUND);
    }
    return empresa.tipo || 'No especificado';
  }

  // metodo para obtener la cadena de direrecion de la empresa para GOOGLE MAPS
  async obtenerDireccionCompleta(id: number): Promise<string> {
    const empresa = await this.findOne(id); // Usa tu método existente
  
    const partesDireccion = [
      empresa.emp_calle,
      empresa.emp_num,
      empresa.emp_zona ? `ZONA ${empresa.emp_zona}` : null,
      empresa.emp_localidad,
    ].filter(Boolean); // Elimina null o undefined
  
    return partesDireccion.join(', ');
  }

  // Método para obtener coordenadas de Google Maps
  async obtenerCoordenadas(id: number): Promise<{ lat: number; lng: number }> {
    const direccion = await this.obtenerDireccionCompleta(id);
    const apiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY');
  
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      direccion,
    )}&key=${apiKey}`;
  
    const response = await this.httpService.axiosRef.get(url);
  
    if (
      response.data.status === 'OK' &&
      response.data.results &&
      response.data.results.length > 0
    ) {
      const location = response.data.results[0].geometry.location;
      return { lat: location.lat, lng: location.lng };
    }
  
    throw new HttpException(
      'No se pudo obtener la ubicación desde Google Maps',
      HttpStatus.BAD_REQUEST,
    );
  

  }

  // Método para obtener empresas paginadas con filtros de búsqueda
  async findAllPaginated(
    page: number = 1,
    limit: number = 10,
    search?: string
  ): Promise<{
    data: Empresa[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const queryBuilder = this.empresaRepository.createQueryBuilder('empresa');

    // Aplicar filtros de búsqueda si se proporciona el término de búsqueda
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      queryBuilder.where(
        `(
          CAST(empresa.emp_cod AS TEXT) ILIKE :search OR
          empresa.emp_reg ILIKE :search OR
          empresa.cod_patronal ILIKE :search OR
          empresa.emp_nom ILIKE :search OR
          empresa.emp_legal ILIKE :search OR
          empresa.emp_activ ILIKE :search OR
          CAST(empresa.emp_ntrab AS TEXT) ILIKE :search OR
          empresa.emp_calle ILIKE :search OR
          empresa.emp_num ILIKE :search OR
          empresa.emp_telf ILIKE :search OR
          empresa.emp_zona ILIKE :search OR
          empresa.emp_localidad ILIKE :search OR
          empresa.emp_lug ILIKE :search OR
          empresa.emp_usu ILIKE :search OR
          empresa.emp_estado ILIKE :search OR
          empresa.emp_obs ILIKE :search OR
          empresa.tipo ILIKE :search OR
          empresa.emp_nom_corto ILIKE :search OR
          CAST(empresa.emp_nit AS TEXT) ILIKE :search OR
          empresa.emp_matricula ILIKE :search OR
          empresa.usuario_registro ILIKE :search OR
          empresa.usuario_modificacion ILIKE :search OR
          empresa.emp_cod_entidad ILIKE :search
        )`,
        { search: searchTerm }
      );
    }

    // Ordenar por id_empresa de forma descendente (más recientes primero)
    queryBuilder.orderBy('empresa.id_empresa', 'DESC');

    // Aplicar paginación
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    // Ejecutar la consulta
    const [data, total] = await queryBuilder.getManyAndCount();

    // Calcular total de páginas
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }
}