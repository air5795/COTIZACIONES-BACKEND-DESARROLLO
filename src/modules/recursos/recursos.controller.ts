// src/modules/recursos/recursos.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseInterceptors,
  UploadedFile,
  StreamableFile,
  ParseIntPipe,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { RecursosService } from './recursos.service';
import { CreateRecursoDto } from './dto/create-recurso.dto';
import { UpdateRecursoDto } from './dto/update-recurso.dto';
import { FilterRecursoDto } from './dto/filter-recurso.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Recursos')
@ApiBearerAuth('JWT-auth') 
@Controller('recursos')
export class RecursosController {
  constructor(private readonly recursosService: RecursosService) {}

  // Obtener recursos públicos (para todos los usuarios)
  @Get('publicos')
  async findPublicos(@Query() filterDto: FilterRecursoDto) {
    return this.recursosService.findPublicos(filterDto);
  }
  // Obtener recursos por tipo de usuario
  @Get('por-tipo/:tipoUsuario')
  async findByTipoUsuario(
  @Param('tipoUsuario') tipoUsuario: string,
  @Query() filterDto: FilterRecursoDto) {
  return this.recursosService.findByTipoUsuario(tipoUsuario, filterDto);
  }

  // Obtener todas las categorías
  @Get('categorias')
  async getCategorias() {
    return this.recursosService.getCategorias();
  }

  // Descargar archivo
  @Get(':id/download')
  async downloadFile(@Param('id', ParseIntPipe) id: number): Promise<StreamableFile> {
    return this.recursosService.downloadFile(id);
  }

  // Vista previa del archivo (solo PDFs) - Sirve el archivo directamente
  @Get(':id/preview')
  async previewFile(@Param('id', ParseIntPipe) id: number): Promise<StreamableFile> {
    return this.recursosService.getFileContent(id);
  }

  // Obtener URL pública del archivo
  @Get(':id/url')
  async getFileUrl(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const recurso = await this.recursosService.findOne(id);
    
    // Construir la URL base desde la request
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;
    
    // Extraer solo el nombre del archivo de la ruta completa
    const filename = recurso.ruta_archivo.split('/').pop() || recurso.nombre_archivo;
    
    return {
      url: `${baseUrl}/recursos/${filename}`,
      nombre_archivo: recurso.nombre_archivo,
      tipo_mime: recurso.tipo_mime
    };
  }

  // Crear nuevo recurso con archivo (solo administradores)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './recursos',
      filename: (req, file, cb) => {
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
        const randomSuffix = Math.round(Math.random() * 1E9);
        const ext = extname(file.originalname);
        const filename = `recurso-${timestamp}-${randomSuffix}${ext}`;
        cb(null, filename);
      },
    }),
    fileFilter: (req, file, cb) => {
      const allowedMimes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'image/jpeg',
        'image/png',
        'image/gif',
        'video/mp4',
        'application/zip',
      ];
      
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new BadRequestException(`Tipo de archivo no permitido: ${file.mimetype}`), false);
      }
    },
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  }))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Req() req: any,
  ) {
    console.log('📁 Archivo recibido:', file ? file.originalname : 'NO FILE');
    console.log('📋 Body recibido:', body);
    console.log('🗂️ File path:', file?.path);
    console.log('🗂️ File filename:', file?.filename);
    
    if (!file) {
      throw new BadRequestException('Debe proporcionar un archivo');
    }

    // Crear DTO desde el body
    const createRecursoDto: CreateRecursoDto = {
      titulo: body.titulo,
      descripcion: body.descripcion || '',
      categoria: body.categoria || 'general',
      nombre_archivo: file.originalname,
      ruta_archivo: file.path || `./recursos/${file.filename}`,
      tipo_usuario: body.tipo_usuario || 'todos',
      estado: 1,
    };

    // TODO: Obtener usuario del token JWT
    const usuario = req.user?.username || 'admin';
    
    return this.recursosService.uploadFile(file, createRecursoDto, usuario);
  }

  // Obtener todos los recursos (solo administradores)
  @Get('admin/all')
  async findAllAdmin(@Query() filterDto: FilterRecursoDto) {
    return this.recursosService.findAll(filterDto);
  }

  // Crear recurso manualmente (solo administradores)
  @Post()
  async create(@Body() createRecursoDto: CreateRecursoDto) {
    return this.recursosService.create(createRecursoDto);
  }

  // Obtener recurso por ID
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.recursosService.findOne(id);
  }

  // Actualizar recurso (solo administradores)
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRecursoDto: UpdateRecursoDto,
    @Req() req: any,
  ) {
    // TODO: Obtener usuario del token JWT
    updateRecursoDto.usuario_actualizacion = req.user?.username || 'admin';
    
    return this.recursosService.update(id, updateRecursoDto);
  }

  // Desactivar recurso (cambiar estado)
  @Delete(':id/deactivate')
  async deactivate(@Param('id', ParseIntPipe) id: number) {
    await this.recursosService.remove(id);
    return { message: 'Recurso desactivado correctamente' };
  }

  // Eliminar recurso permanentemente (solo super admin)
  @Delete(':id/permanent')
  async permanentDelete(@Param('id', ParseIntPipe) id: number) {
    await this.recursosService.delete(id);
    return { message: 'Recurso eliminado permanentemente' };
  }
}