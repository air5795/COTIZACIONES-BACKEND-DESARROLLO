import { Injectable } from '@nestjs/common';
import { CreateIncapacidadesReembolsoDto } from './dto/create-incapacidades-reembolso.dto';
import { UpdateIncapacidadesReembolsoDto } from './dto/update-incapacidades-reembolso.dto';

@Injectable()
export class IncapacidadesReembolsoService {
  create(createIncapacidadesReembolsoDto: CreateIncapacidadesReembolsoDto) {
    return 'This action adds a new incapacidadesReembolso';
  }

  findAll() {
    return `This action returns all incapacidadesReembolso`;
  }

  findOne(id: number) {
    return `This action returns a #${id} incapacidadesReembolso`;
  }

  update(id: number, updateIncapacidadesReembolsoDto: UpdateIncapacidadesReembolsoDto) {
    return `This action updates a #${id} incapacidadesReembolso`;
  }

  remove(id: number) {
    return `This action removes a #${id} incapacidadesReembolso`;
  }
}
