import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { EmpresasService } from './empresas.service';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { Empresa } from './entities/empresa.entity';
import { ApiTags } from '@nestjs/swagger';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
@ApiTags('Empresas Afiliadas')
@Controller('empresas')
export class EmpresasController {
  constructor(private readonly empresasService: EmpresasService) {}

  @Post('sync')
  async syncEmpresas() {
    await this.empresasService.syncEmpresas();
    return { message: 'Empresas sincronizadas exitosamente' };
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
