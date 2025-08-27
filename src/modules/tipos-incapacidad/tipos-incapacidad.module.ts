import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TiposIncapacidadService } from './tipos-incapacidad.service';
import { TiposIncapacidadController } from './tipos-incapacidad.controller';
import { TiposIncapacidad } from './entities/tipos-incapacidad.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([TiposIncapacidad])
  ],
  controllers: [TiposIncapacidadController],
  providers: [TiposIncapacidadService],
  exports: [TiposIncapacidadService],
})
export class TiposIncapacidadModule {}