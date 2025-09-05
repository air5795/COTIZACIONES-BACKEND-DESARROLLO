import { registerAs } from '@nestjs/config';

export default registerAs('config', () => {
  const db = `postgres://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?sslmode=disable`;
  
  return {
    postgresUrl: db,
    
    // 🚀 CONFIGURACIONES DE RENDIMIENTO DE BASE DE DATOS
    database: {
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS) || 25,
      minConnections: parseInt(process.env.DB_MIN_CONNECTIONS) || 5,
      connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000,
      queryTimeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 60000,
      idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
    },
    
    // 📊 CONFIGURACIONES DE LA APLICACIÓN
    app: {
      maxUploadSize: parseInt(process.env.MAX_UPLOAD_SIZE) || 52428800, // 50MB
      maxPlanillaRecords: parseInt(process.env.MAX_PLANILLA_RECORDS) || 30000,
      batchSize: parseInt(process.env.BATCH_SIZE) || 1000,
    },
  };
});
