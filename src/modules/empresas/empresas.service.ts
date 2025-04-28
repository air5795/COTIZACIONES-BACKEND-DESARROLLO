import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empresa } from './entities/empresa.entity';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ExternalApiService } from '../../modules/api-client/service/external-api.service';

@Injectable()
export class EmpresasService {
  constructor(
    @InjectRepository(Empresa)
    private readonly empresaRepository: Repository<Empresa>,
    private readonly externalApiService: ExternalApiService,
    private readonly httpService: HttpService,
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
}