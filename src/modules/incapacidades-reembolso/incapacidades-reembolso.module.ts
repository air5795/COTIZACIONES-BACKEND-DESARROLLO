import { Module } from '@nestjs/common';
import { IncapacidadesReembolsoService } from './incapacidades-reembolso.service';
import { IncapacidadesReembolsoController } from './incapacidades-reembolso.controller';

@Module({
  controllers: [IncapacidadesReembolsoController],
  providers: [IncapacidadesReembolsoService],
})
export class IncapacidadesReembolsoModule {}
