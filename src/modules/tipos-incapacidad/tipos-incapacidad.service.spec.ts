import { Test, TestingModule } from '@nestjs/testing';
import { TiposIncapacidadService } from './tipos-incapacidad.service';

describe('TiposIncapacidadService', () => {
  let service: TiposIncapacidadService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TiposIncapacidadService],
    }).compile();

    service = module.get<TiposIncapacidadService>(TiposIncapacidadService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
