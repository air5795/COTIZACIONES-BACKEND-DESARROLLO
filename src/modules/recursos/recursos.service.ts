// src/modules/recursos/recursos.service.ts
import { Injectable, BadRequestException, NotFoundException, StreamableFile } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindManyOptions } from 'typeorm';
import { Recurso } from './entities/recurso.entity';
import { CreateRecursoDto } from './dto/create-recurso.dto';
import { UpdateRecursoDto } from './dto/update-recurso.dto';
import { FilterRecursoDto } from './dto/filter-recurso.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class RecursosService {
  constructor(
    @InjectRepository(Recurso)
    private recursoRepository: Repository<Recurso>,
  ) {}

  // Crear un nuevo recurso
  async create(createRecursoDto: CreateRecursoDto): Promise<Recurso> {
    try {
      const recurso = this.recursoRepository.create({
        ...createRecursoDto,
        fecha_creacion: new Date(),
        fecha_actualizacion: new Date(),
      });

      return await this.recursoRepository.save(recurso);
    } catch (error) {
      throw new BadRequestException(`Error al crear el recurso: ${error.message}`);
    }
  }

  // Obtener todos los recursos con filtros y paginación
  async findAll(filterDto: FilterRecursoDto): Promise<{data: Recurso[];total: number;page: number;limit: number; totalPages: number;}> {
    const { page = 1, limit = 10, categoria, buscar, estado, es_publico, tipo_usuario } = filterDto;
    
    const options: FindManyOptions<Recurso> = {
      where: {},
      order: {
        orden_visualizacion: 'ASC',
        fecha_creacion: 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
    };

    // Aplicar filtros
    if (categoria) {
      options.where['categoria'] = categoria;
    }

    if (estado !== undefined) {
      options.where['estado'] = estado;
    }

    if (es_publico !== undefined) {
      options.where['es_publico'] = es_publico;
    }

    if (tipo_usuario) {
      options.where['tipo_usuario'] = tipo_usuario;
    }

    if (buscar) {
      options.where = [
        { ...options.where, titulo: Like(`%${buscar}%`) },
        { ...options.where, descripcion: Like(`%${buscar}%`) },
      ];
    }

    const [data, total] = await this.recursoRepository.findAndCount(options);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // Obtener recursos públicos (para usuarios normales)
  async findPublicos(filterDto: FilterRecursoDto): Promise<{data: Recurso[];total: number;page: number;limit: number;totalPages: number;}> {
    return this.findAll({
      ...filterDto,
      estado: 1,
      es_publico: 1,
    });
  }

  async findByTipoUsuario(tipoUsuario: string, filterDto: FilterRecursoDto): Promise<{ data: Recurso[];total: number;page: number;limit: number;totalPages: number;}> {
    return this.findAll({
      ...filterDto,
      estado: 1,
      es_publico: 1,
      tipo_usuario: tipoUsuario
    });
  }





  // Obtener un recurso por ID
  async findOne(id: number): Promise<Recurso> {
    const recurso = await this.recursoRepository.findOne({
      where: { id_recurso: id },
    });

    if (!recurso) {
      throw new NotFoundException(`Recurso con ID ${id} no encontrado`);
    }

    return recurso;
  }

  // Actualizar un recurso
  async update(id: number, updateRecursoDto: UpdateRecursoDto): Promise<Recurso> {
    const recurso = await this.findOne(id);

    Object.assign(recurso, {
      ...updateRecursoDto,
      fecha_actualizacion: new Date(),
    });

    return await this.recursoRepository.save(recurso);
  }

  // Eliminar un recurso (cambiar estado a inactivo)
  async remove(id: number): Promise<void> {
    const recurso = await this.findOne(id);
    
    recurso.estado = 0;
    recurso.fecha_actualizacion = new Date();
    
    await this.recursoRepository.save(recurso);
  }

  // Eliminar completamente un recurso (admin)
  async delete(id: number): Promise<void> {
    const recurso = await this.findOne(id);
    
    // Eliminar el archivo físico si existe
    if (fs.existsSync(recurso.ruta_archivo)) {
      fs.unlinkSync(recurso.ruta_archivo);
    }
    
    await this.recursoRepository.delete(id);
  }

  // Descargar un archivo recurso
  async downloadFile(id: number): Promise<StreamableFile> {
    const recurso = await this.findOne(id);

    if (!fs.existsSync(recurso.ruta_archivo)) {
      throw new NotFoundException('El archivo no se encuentra en el servidor');
    }

    // Incrementar contador de descargas
    await this.recursoRepository.update(id, {
      descargas_count: () => 'descargas_count + 1',
    });

    const fileStream = fs.createReadStream(recurso.ruta_archivo);
    
    return new StreamableFile(fileStream, {
      type: recurso.tipo_mime || 'application/octet-stream',
      disposition: `attachment; filename="${recurso.nombre_archivo}"`,
    });
  }

  // Obtener contenido del archivo para vista previa (solo PDFs)
  async getFileContent(id: number): Promise<StreamableFile> {
    const recurso = await this.findOne(id);

    if (!fs.existsSync(recurso.ruta_archivo)) {
      throw new NotFoundException('El archivo no se encuentra en el servidor');
    }

    // Solo permitir vista previa para PDFs
    if (recurso.tipo_mime !== 'application/pdf') {
      throw new BadRequestException('Vista previa solo disponible para archivos PDF');
    }

    const fileStream = fs.createReadStream(recurso.ruta_archivo);
    
    return new StreamableFile(fileStream, {
      type: recurso.tipo_mime,
      disposition: `inline; filename="${recurso.nombre_archivo}"`,
    });
  }

  // Obtener categorías disponibles
  async getCategorias(): Promise<string[]> {
    const result = await this.recursoRepository
      .createQueryBuilder('recurso')
      .select('DISTINCT recurso.categoria', 'categoria')
      .where('recurso.estado = :estado', { estado: 1 })
      .getRawMany();

    return result.map(r => r.categoria);
  }

  // Subir archivo físico y crear registro
  async uploadFile(
    file: Express.Multer.File,
    createRecursoDto: CreateRecursoDto,
    usuario: string,
  ): Promise<Recurso> {
    if (!file) {
      throw new BadRequestException('No se ha proporcionado ningún archivo');
    }

    try {
      console.log('🔧 Procesando archivo:', file.originalname);
      console.log('📁 Ruta del archivo:', file.path);
      
      // Extraer extensión del archivo
      const extension = path.extname(file.originalname).toLowerCase();
      
      const recursoData: CreateRecursoDto = {
        ...createRecursoDto,
        nombre_archivo: file.originalname,
        ruta_archivo: file.path,
        tamaño_archivo: file.size,
        tipo_mime: file.mimetype,
        extension: extension.replace('.', ''),
        usuario_creacion: usuario,
      };

      console.log('💾 Datos a guardar:', recursoData);

      return await this.create(recursoData);
    } catch (error) {
      console.error('❌ Error al procesar archivo:', error);
      
      // Si hay error, eliminar el archivo subido
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      throw new BadRequestException(`Error al procesar el archivo: ${error.message}`);
    }
  }
}