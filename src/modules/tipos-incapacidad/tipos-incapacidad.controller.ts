import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TiposIncapacidadService } from './tipos-incapacidad.service';
import { CreateTiposIncapacidadDto } from './dto/create-tipos-incapacidad.dto';
import { UpdateTiposIncapacidadDto } from './dto/update-tipos-incapacidad.dto';

@ApiTags('Tipos de Incapacidad')
@Controller('tipos-incapacidad')
export class TiposIncapacidadController {
  constructor(private readonly tiposService: TiposIncapacidadService) {}

  @Post()
  @ApiOperation({ summary: 'Crear nuevo tipo de incapacidad' })
  create(@Body() createDto: CreateTiposIncapacidadDto) {
    return this.tiposService.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los tipos de incapacidad activos' })
  findAll() {
    return this.tiposService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener tipo de incapacidad por ID' })
  findOne(@Param('id') id: string) {
    return this.tiposService.findOne(+id);
  }

  @Get('codigo/:codigo')
  @ApiOperation({ summary: 'Obtener tipo de incapacidad por código' })
  findByCode(@Param('codigo') codigo: string) {
    return this.tiposService.findByCode(codigo);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar tipo de incapacidad' })
  update(@Param('id') id: string, @Body() updateDto: UpdateTiposIncapacidadDto) {
    return this.tiposService.update(+id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Desactivar tipo de incapacidad' })
  remove(@Param('id') id: string) {
    return this.tiposService.remove(+id);
  }
}