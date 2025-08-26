import { Test, TestingModule } from '@nestjs/testing';
import { TiposIncapacidadController } from './tipos-incapacidad.controller';
import { TiposIncapacidadService } from './tipos-incapacidad.service';

describe('TiposIncapacidadController', () => {
  let controller: TiposIncapacidadController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TiposIncapacidadController],
      providers: [TiposIncapacidadService],
    }).compile();

    controller = module.get<TiposIncapacidadController>(TiposIncapacidadController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
