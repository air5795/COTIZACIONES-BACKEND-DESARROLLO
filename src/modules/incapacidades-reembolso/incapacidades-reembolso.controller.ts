import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { IncapacidadesReembolsoService } from './incapacidades-reembolso.service';
import { CreateIncapacidadesReembolsoDto } from './dto/create-incapacidades-reembolso.dto';
import { UpdateIncapacidadesReembolsoDto } from './dto/update-incapacidades-reembolso.dto';

@Controller('incapacidades-reembolso')
export class IncapacidadesReembolsoController {
  constructor(private readonly incapacidadesReembolsoService: IncapacidadesReembolsoService) {}

  @Post()
  create(@Body() createIncapacidadesReembolsoDto: CreateIncapacidadesReembolsoDto) {
    return this.incapacidadesReembolsoService.create(createIncapacidadesReembolsoDto);
  }

  @Get()
  findAll() {
    return this.incapacidadesReembolsoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.incapacidadesReembolsoService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateIncapacidadesReembolsoDto: UpdateIncapacidadesReembolsoDto) {
    return this.incapacidadesReembolsoService.update(+id, updateIncapacidadesReembolsoDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.incapacidadesReembolsoService.remove(+id);
  }
}
