import { Test, TestingModule } from '@nestjs/testing';
import { DevengadosController } from './devengados.controller';
import { DevengadosService } from './devengados.service';

describe('DevengadosController', () => {
  let controller: DevengadosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DevengadosController],
      providers: [DevengadosService],
    }).compile();

    controller = module.get<DevengadosController>(DevengadosController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
