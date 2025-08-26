import { Test, TestingModule } from '@nestjs/testing';
import { IncapacidadesReembolsoController } from './incapacidades-reembolso.controller';
import { IncapacidadesReembolsoService } from './incapacidades-reembolso.service';

describe('IncapacidadesReembolsoController', () => {
  let controller: IncapacidadesReembolsoController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IncapacidadesReembolsoController],
      providers: [IncapacidadesReembolsoService],
    }).compile();

    controller = module.get<IncapacidadesReembolsoController>(IncapacidadesReembolsoController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
