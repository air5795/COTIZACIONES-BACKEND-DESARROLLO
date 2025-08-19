import { Injectable } from '@nestjs/common';
import { CreateLiquidacioneDto } from './dto/create-liquidacione.dto';
import { UpdateLiquidacioneDto } from './dto/update-liquidacione.dto';

@Injectable()
export class LiquidacionesService {
  create(createLiquidacioneDto: CreateLiquidacioneDto) {
    return 'This action adds a new liquidacione';
  }

  findAll() {
    return `This action returns all liquidaciones`;
  }

  findOne(id: number) {
    return `This action returns a #${id} liquidacione`;
  }

  update(id: number, updateLiquidacioneDto: UpdateLiquidacioneDto) {
    return `This action updates a #${id} liquidacione`;
  }

  remove(id: number) {
    return `This action removes a #${id} liquidacione`;
  }
}
