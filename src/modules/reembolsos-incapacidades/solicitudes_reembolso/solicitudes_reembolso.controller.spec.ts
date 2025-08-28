import { Test, TestingModule } from '@nestjs/testing';
import { SolicitudesReembolsoController } from './solicitudes_reembolso.controller';
import { SolicitudesReembolsoService } from './solicitudes_reembolso.service';

describe('SolicitudesReembolsoController', () => {
  let controller: SolicitudesReembolsoController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SolicitudesReembolsoController],
      providers: [SolicitudesReembolsoService],
    }).compile();

    controller = module.get<SolicitudesReembolsoController>(SolicitudesReembolsoController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
