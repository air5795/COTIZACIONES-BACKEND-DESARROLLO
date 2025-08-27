import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TiposIncapacidad } from './entities/tipos-incapacidad.entity';
import { CreateTiposIncapacidadDto } from './dto/create-tipos-incapacidad.dto';
import { UpdateTiposIncapacidadDto } from './dto/update-tipos-incapacidad.dto';

@Injectable()
export class TiposIncapacidadService {
  constructor(
    @InjectRepository(TiposIncapacidad)
    private tiposRepo: Repository<TiposIncapacidad>,
  ) {}

  async create(createDto: CreateTiposIncapacidadDto) {
    const tipo = this.tiposRepo.create(createDto);
    return await this.tiposRepo.save(tipo);
  }

  async findAll() {
    return await this.tiposRepo.find({
      where: { activo: true },
      order: { codigo: 'ASC' },
    });
  }

  async findOne(id: number) {
    return await this.tiposRepo.findOne({
      where: { id_tipo_incapacidad: id, activo: true },
    });
  }

  async findByCode(codigo: string) {
    return await this.tiposRepo.findOne({
      where: { codigo, activo: true },
    });
  }

  async update(id: number, updateDto: UpdateTiposIncapacidadDto) {
    await this.tiposRepo.update(id, updateDto);
    return this.findOne(id);
  }

  async remove(id: number) {
    await this.tiposRepo.update(id, { activo: false });
    return { message: 'Tipo de incapacidad desactivado' };
  }
}
