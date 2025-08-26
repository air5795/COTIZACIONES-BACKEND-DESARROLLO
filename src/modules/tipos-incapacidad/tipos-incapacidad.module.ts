import { Module } from '@nestjs/common';
import { TiposIncapacidadService } from './tipos-incapacidad.service';
import { TiposIncapacidadController } from './tipos-incapacidad.controller';

@Module({
  controllers: [TiposIncapacidadController],
  providers: [TiposIncapacidadService],
})
export class TiposIncapacidadModule {}
