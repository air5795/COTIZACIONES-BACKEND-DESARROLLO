import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import config from './../config/config';
import { ConfigType } from '@nestjs/config';
import { Client } from 'pg';
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [config.KEY],
      useFactory: (configEnv: ConfigType<typeof config>) => {
        return {
          type: 'postgres',
          url: configEnv.postgresUrl,
          ssl: {
            rejectUnauthorized: false,
          },
          synchronize: false,
          autoLoadEntities: true,
          logging: false, // Cambiar a true solo para debug
          
          // 🚀 CONFIGURACIONES DE RENDIMIENTO DESDE VARIABLES DE ENTORNO
          extra: {
            max: configEnv.database.maxConnections,                    // Máximo conexiones simultáneas
            min: configEnv.database.minConnections,                    // Mínimo conexiones en el pool
            idleTimeoutMillis: configEnv.database.idleTimeout,         // Timeout para conexiones inactivas
            connectionTimeoutMillis: configEnv.database.connectionTimeout, // Tiempo para establecer conexión
            acquireTimeoutMillis: 60000,                               // 60 segundos para obtener conexión del pool
            statement_timeout: configEnv.database.queryTimeout,        // Timeout para statements
            query_timeout: configEnv.database.queryTimeout,            // Timeout para queries
          },
          
          // ⏱️ TIMEOUTS ADICIONALES
          maxQueryExecutionTime: configEnv.database.queryTimeout - 5000,  // 5 segundos menos que el query timeout
          
          // 📊 CONFIGURACIONES DE LOGGING PARA PRODUCCIÓN
          logger: 'advanced-console',
          logNotifications: true,
        };
      },
    }),
  ],
  providers: [
    {
      provide: 'PG',
      useFactory: (configEnv: ConfigType<typeof config>) => {
        const client = new Client({
          connectionString: configEnv.postgresUrl,
          ssl: {
            rejectUnauthorized: false,
          },
          // 🚀 CONFIGURACIONES ADICIONALES PARA EL CLIENTE PG DESDE VARIABLES DE ENTORNO
          connectionTimeoutMillis: configEnv.database.connectionTimeout,
          query_timeout: configEnv.database.queryTimeout,
        });
        client.connect();
        return client;
      },
      inject: [config.KEY],
    },
  ],
  exports: ['PG'],
})
export class DatabaseModule {}
