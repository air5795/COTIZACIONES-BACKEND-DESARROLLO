// src/modules/recursos/recursos.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecursosService } from './recursos.service';
import { RecursosController } from './recursos.controller';
import { Recurso } from './entities/recurso.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Recurso]),
  ],
  controllers: [RecursosController],
  providers: [RecursosService],
  exports: [RecursosService],
})
export class RecursosModule {}