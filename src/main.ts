import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  ClassSerializerInterceptor,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as express from 'express';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('bootstrap');

  // Aumentar el límite del tamaño del request
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  // Configurar serve-static para servir las imágenes de pagos-aportes
  app.useStaticAssets(join(__dirname, '..', 'src', 'modules', 'pagos-aportes', 'pagos'), {
    prefix: '/pagos-imagenes/',
  });

  // Configurar serve-static para servir las imágenes de pagos-aportes-adicionales
  app.useStaticAssets(join(__dirname, '..', 'src', 'modules', 'pagos-aportes-adicionales', 'pagos'), {
    prefix: '/pagos-adicionales-imagenes/',
  });

  // Servir archivos estáticos para el CSS personalizado de Swagger
  app.useStaticAssets(join(__dirname, '..', 'src', 'public'), {
    prefix: '/public/',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transformOptions: { enableImplicitConversion: true },
      transform: true,
    }),
  );

  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new ClassSerializerInterceptor(reflector));
  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('CBES - Caja Bancaria Estatal de Salud')
    .setDescription('DOCUMENTACION DEL SISTEMA DE COTIZACIONES - DESARROLLO')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/v1/docs', app, document, {
    swaggerOptions: {
      filter: true,
    },
    customCssUrl: '/public/custom-swagger.css', // Inyectar el CSS personalizado
  });

  app.enableCors();

  await app.listen(process.env.PORT || 4001);
  logger.log(
    `API-SisAdmin Ready: Development on Line! on PORT: ${process.env.PORT || 4001}`,
  );
}

bootstrap();