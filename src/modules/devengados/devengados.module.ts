import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DevengadosService } from './devengados.service';
import { DevengadosController } from './devengados.controller';
import { PlanillasAporte } from '../planillas_aportes/entities/planillas_aporte.entity';
import { Empresa } from '../empresas/entities/empresa.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlanillasAporte,
      Empresa
    ])
  ],
  controllers: [DevengadosController],
  providers: [DevengadosService],
  exports: [DevengadosService],
})
export class DevengadosModule {}