import { Test, TestingModule } from '@nestjs/testing';
import { LiquidacionesController } from './liquidaciones.controller';
import { LiquidacionesService } from './liquidaciones.service';

describe('LiquidacionesController', () => {
  let controller: LiquidacionesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LiquidacionesController],
      providers: [LiquidacionesService],
    }).compile();

    controller = module.get<LiquidacionesController>(LiquidacionesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
