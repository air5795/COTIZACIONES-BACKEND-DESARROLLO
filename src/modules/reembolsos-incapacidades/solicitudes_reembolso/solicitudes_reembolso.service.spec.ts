import { Test, TestingModule } from '@nestjs/testing';
import { SolicitudesReembolsoService } from './solicitudes_reembolso.service';

describe('SolicitudesReembolsoService', () => {
  let service: SolicitudesReembolsoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SolicitudesReembolsoService],
    }).compile();

    service = module.get<SolicitudesReembolsoService>(SolicitudesReembolsoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
