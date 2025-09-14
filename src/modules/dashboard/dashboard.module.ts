import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

// Importar solo las entidades, NO los módulos completos para evitar dependencias circulares
import { PlanillasAporte } from '../planillas_aportes/entities/planillas_aporte.entity';
import { Empresa } from '../empresas/entities/empresa.entity';
import { PagoAporte } from '../pagos-aportes/entities/pagos-aporte.entity';

@Module({
  imports: [
    // Solo registrar las entidades que necesita el dashboard
    TypeOrmModule.forFeature([
      PlanillasAporte,
      Empresa,
      PagoAporte,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService], // Exportar para uso en otros módulos
})
export class DashboardModule {}