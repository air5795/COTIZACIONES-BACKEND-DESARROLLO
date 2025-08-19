import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { LiquidacionesService } from './liquidaciones.service';
import { CreateLiquidacioneDto } from './dto/create-liquidacione.dto';
import { UpdateLiquidacioneDto } from './dto/update-liquidacione.dto';

@Controller('liquidaciones')
export class LiquidacionesController {
  constructor(private readonly liquidacionesService: LiquidacionesService) {}

  @Post()
  create(@Body() createLiquidacioneDto: CreateLiquidacioneDto) {
    return this.liquidacionesService.create(createLiquidacioneDto);
  }

  @Get()
  findAll() {
    return this.liquidacionesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.liquidacionesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateLiquidacioneDto: UpdateLiquidacioneDto) {
    return this.liquidacionesService.update(+id, updateLiquidacioneDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.liquidacionesService.remove(+id);
  }
}
