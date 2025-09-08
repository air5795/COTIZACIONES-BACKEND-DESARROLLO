import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReembolsosIncapacidadesService } from './solicitudes_reembolso.service';
import { ReembolsosIncapacidadesController } from './solicitudes_reembolso.controller';
import { SolicitudesReembolso } from './entities/solicitudes_reembolso.entity';
import { DetallesReembolso } from './entities/detalles_reembolso.entity';
import { EmpresasModule } from '../../empresas/empresas.module';
import { ApiClientModule } from '../../api-client/api-client.module';
import { PlanillasAportesModule } from 'src/modules/planillas_aportes/planillas_aportes.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SolicitudesReembolso, DetallesReembolso]),
    EmpresasModule,
    ApiClientModule,
    PlanillasAportesModule,
  ],
  controllers: [ReembolsosIncapacidadesController],
  providers: [ReembolsosIncapacidadesService],
  exports: [ReembolsosIncapacidadesService],
})
export class ReembolsosIncapacidadesModule {}