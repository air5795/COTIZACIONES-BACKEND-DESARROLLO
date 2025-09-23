import { Module } from '@nestjs/common';
import * as Joi from 'joi';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './core/database/database.module';
import config from './core/config/config';
import { enviroments } from './core/config/enviroments';
import { AuthModule } from './modules/auth/auth.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { LoggerModule } from './modules/logger/logger.module';
import { ApiClientModule } from './modules/api-client/api-client.module';
import { ParClasificadorDetalleModule } from './modules/parametro/par-clasificador-detalle.module';
import { PlanillasAportesModule } from './modules/planillas_aportes/planillas_aportes.module';
import { PlanillasAdicionalesModule } from './modules/planillas_adicionales/planillas_adicionales.module';
import { PagosAportesModule } from './modules/pagos-aportes/pagos-aportes.module';
import { PagosAportesAdicionalesModule } from './modules/pagos-aportes-adicionales/pagos-aportes-adicionales.module';
import { EmpresasModule } from './modules/empresas/empresas.module';
import { NotificacionesModule } from './modules/notificaciones/notificaciones.module';
import { IncapacidadesReembolsoModule } from './modules/incapacidades-reembolso/incapacidades-reembolso.module';
import { TiposIncapacidadModule } from './modules/tipos-incapacidad/tipos-incapacidad.module';
import { ReembolsosIncapacidadesModule } from './modules/reembolsos-incapacidades/solicitudes_reembolso/solicitudes_reembolso.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { RecursosModule } from './modules/recursos/recursos.module';
import { DevengadosModule } from './modules/devengados/devengados.module';

const db = `postgres://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?sslmode=disable`;

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: enviroments[db] || '.env',
      load: [config],
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: db,
      }),
    }),

    ServeStaticModule.forRoot({
      rootPath: process.env.ARCHIVOS,
      serveRoot: '/ruta',
      serveStaticOptions: {
        index: false, 
      },
    }),
    DatabaseModule,
    AuthModule,
    LoggerModule,
    ApiClientModule,
    ParClasificadorDetalleModule,
    PlanillasAportesModule,
    PlanillasAdicionalesModule,
    PagosAportesModule,
    PagosAportesAdicionalesModule,
    EmpresasModule,
    NotificacionesModule,
    TiposIncapacidadModule,
    IncapacidadesReembolsoModule,
    ReembolsosIncapacidadesModule,
    DashboardModule,
    RecursosModule,
    DevengadosModule,

  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
