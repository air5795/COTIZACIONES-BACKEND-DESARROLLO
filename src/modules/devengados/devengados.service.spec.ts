import { Test, TestingModule } from '@nestjs/testing';
import { DevengadosService } from './devengados.service';

describe('DevengadosService', () => {
  let service: DevengadosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DevengadosService],
    }).compile();

    service = module.get<DevengadosService>(DevengadosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
