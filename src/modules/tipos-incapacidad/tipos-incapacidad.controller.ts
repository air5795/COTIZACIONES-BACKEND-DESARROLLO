import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { TiposIncapacidadService } from './tipos-incapacidad.service';
import { CreateTiposIncapacidadDto } from './dto/create-tipos-incapacidad.dto';
import { UpdateTiposIncapacidadDto } from './dto/update-tipos-incapacidad.dto';

@Controller('tipos-incapacidad')
export class TiposIncapacidadController {
  constructor(private readonly tiposIncapacidadService: TiposIncapacidadService) {}

  @Post()
  create(@Body() createTiposIncapacidadDto: CreateTiposIncapacidadDto) {
    return this.tiposIncapacidadService.create(createTiposIncapacidadDto);
  }

  @Get()
  findAll() {
    return this.tiposIncapacidadService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tiposIncapacidadService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTiposIncapacidadDto: UpdateTiposIncapacidadDto) {
    return this.tiposIncapacidadService.update(+id, updateTiposIncapacidadDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tiposIncapacidadService.remove(+id);
  }
}
