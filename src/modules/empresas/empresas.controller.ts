import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { EmpresasService } from './empresas.service';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { Empresa } from './entities/empresa.entity';
import { ApiTags } from '@nestjs/swagger';
import { ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
@ApiTags('Empresas Afiliadas')
@ApiBearerAuth('JWT-auth') 
@Controller('empresas')
export class EmpresasController {
  constructor(private readonly empresasService: EmpresasService) {}

  @Post('sync')
  async syncEmpresas() {
    await this.empresasService.syncEmpresas();
    return { message: 'Empresas sincronizadas exitosamente' };
  }

  @Get('paginated')
  @ApiOperation({ 
    summary: 'Obtener empresas paginadas con filtros de búsqueda',
    description: 'Endpoint para obtener empresas con paginación y filtros de búsqueda que funcionan en todos los campos de la entidad'
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número de página (por defecto: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Límite de elementos por página (por defecto: 10)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Término de búsqueda para filtrar en todos los campos' })
  @ApiResponse({
    status: 200,
    description: 'Lista de empresas paginadas retornada exitosamente.',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/Empresa' }
        },
        total: { type: 'number', description: 'Total de registros' },
        page: { type: 'number', description: 'Página actual' },
        limit: { type: 'number', description: 'Límite por página' },
        totalPages: { type: 'number', description: 'Total de páginas' }
      }
    }
  })
  async findAllPaginated(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ): Promise<{
    data: Empresa[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 10;
    
    return this.empresasService.findAllPaginated(pageNumber, limitNumber, search);
  }

  @Post()
  create(@Body() createEmpresaDto: CreateEmpresaDto): Promise<Empresa> {
    return this.empresasService.create(createEmpresaDto);
  }

  @Get()
  findAll(): Promise<Empresa[]> {
    return this.empresasService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Empresa> {
    return this.empresasService.findOne(+id);
  }

  @Get('cod-patronal/:codPatronal')
  findByCodPatronal(
    @Param('codPatronal') codPatronal: string,
  ): Promise<Empresa> {
    return this.empresasService.findByCodPatronal(codPatronal);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateEmpresaDto: UpdateEmpresaDto,
  ): Promise<Empresa> {
    return this.empresasService.update(+id, updateEmpresaDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.empresasService.remove(+id);
  }

  @Get('tipo/:codPatronal')
  @ApiOperation({ summary: 'Obtener el tipo de empresa por código patronal' })
  @ApiResponse({
    status: 200,
    description: 'Tipo de empresa retornado exitosamente.',
  })
  @ApiResponse({ status: 404, description: 'Empresa no encontrada.' })
  async findTipoByCodPatronal(
    @Param('codPatronal') codPatronal: string,
  ): Promise<string> {
    return this.empresasService.findTipoByCodPatronal(codPatronal);
  }

  @Get(':id/direccion-completa')
  @ApiOperation({
    summary: 'Obtener la dirección completa de una empresa por ID',
  })
  async getDireccionCompleta(
    @Param('id') id: string,
  ): Promise<{ direccion: string }> {
    const direccion = await this.empresasService.obtenerDireccionCompleta(+id);
    return { direccion };
  }

  @Get(':id/coordenadas')
  async getCoordenadas(
    @Param('id') id: string,
  ): Promise<{ lat: number; lng: number }> {
    return this.empresasService.obtenerCoordenadas(+id);
  }
}
