import { Test, TestingModule } from '@nestjs/testing';
import { IncapacidadesReembolsoService } from './incapacidades-reembolso.service';

describe('IncapacidadesReembolsoService', () => {
  let service: IncapacidadesReembolsoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IncapacidadesReembolsoService],
    }).compile();

    service = module.get<IncapacidadesReembolsoService>(IncapacidadesReembolsoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
