import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanillasAportesController } from './planillas_aportes.controller';
import { PlanillasAportesService } from './planillas_aportes.service';
import { PlanillasAporte } from './entities/planillas_aporte.entity';
import { PlanillaAportesDetalles } from './entities/planillas_aportes_detalles.entity';
import { PagoAporte } from '../pagos-aportes/entities/pagos-aporte.entity';
import { Http } from 'winston/lib/winston/transports';
import { HttpModule } from '@nestjs/axios';
import { EmpresasModule } from '../empresas/empresas.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { ApiClientModule } from '../api-client/api-client.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
    PlanillasAporte,
    PlanillaAportesDetalles, 
    PagoAporte]),
    EmpresasModule,
    HttpModule,
    NotificacionesModule,
    ApiClientModule,
  ],
  controllers: [PlanillasAportesController],
  providers: [PlanillasAportesService],
  exports: [PlanillasAportesService], 
})
export class PlanillasAportesModule {}