import { Test, TestingModule } from '@nestjs/testing';
import { LiquidacionesService } from './liquidaciones.service';

describe('LiquidacionesService', () => {
  let service: LiquidacionesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LiquidacionesService],
    }).compile();

    service = module.get<LiquidacionesService>(LiquidacionesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
