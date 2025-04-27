import { Module} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmpresasService } from './empresas.service';
import { EmpresasController } from './empresas.controller';
import { Empresa } from './entities/empresa.entity';
import { HttpService, HttpModule } from '@nestjs/axios';
import { ApiClientModule } from '../api-client/api-client.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Empresa]),
    HttpModule, 
    ApiClientModule,
  ],
  controllers: [EmpresasController],
  providers: [EmpresasService],
  exports: [EmpresasService],
})
export class EmpresasModule {}
