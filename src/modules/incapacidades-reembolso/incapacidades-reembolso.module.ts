import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios'; // IMPORTANTE: Para servicio externo
import { IncapacidadesReembolsoService } from './incapacidades-reembolso.service';
import { IncapacidadesReembolsoController } from './incapacidades-reembolso.controller';
import { IncapacidadesReembolso } from './entities/incapacidades-reembolso.entity';
import { IncapacidadesReembolsoDetalle } from './entities/incapacidades-reembolso-detalle.entity';
import { IncapacidadesDocumento } from './entities/incapacidades-documento.entity';
import { TiposIncapacidadModule } from '../tipos-incapacidad/tipos-incapacidad.module';
import { EmpresasModule } from '../empresas/empresas.module'; // Si existe
import { PlanillasAportesModule } from '../planillas_aportes/planillas_aportes.module';
import { ApiClientModule } from '../api-client/api-client.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IncapacidadesReembolso,
      IncapacidadesReembolsoDetalle,
      IncapacidadesDocumento,
    ]),
    HttpModule, // Para llamadas al servicio externo
    TiposIncapacidadModule,
    EmpresasModule, // Descomenta si existe
    PlanillasAportesModule, // Descomenta si existe
    ApiClientModule,
  ],
  controllers: [IncapacidadesReembolsoController],
  providers: [IncapacidadesReembolsoService],
  exports: [IncapacidadesReembolsoService],
})
export class IncapacidadesReembolsoModule {}