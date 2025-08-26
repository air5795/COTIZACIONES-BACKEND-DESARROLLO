import { Injectable } from '@nestjs/common';
import { CreateTiposIncapacidadDto } from './dto/create-tipos-incapacidad.dto';
import { UpdateTiposIncapacidadDto } from './dto/update-tipos-incapacidad.dto';

@Injectable()
export class TiposIncapacidadService {
  create(createTiposIncapacidadDto: CreateTiposIncapacidadDto) {
    return 'This action adds a new tiposIncapacidad';
  }

  findAll() {
    return `This action returns all tiposIncapacidad`;
  }

  findOne(id: number) {
    return `This action returns a #${id} tiposIncapacidad`;
  }

  update(id: number, updateTiposIncapacidadDto: UpdateTiposIncapacidadDto) {
    return `This action updates a #${id} tiposIncapacidad`;
  }

  remove(id: number) {
    return `This action removes a #${id} tiposIncapacidad`;
  }
}
