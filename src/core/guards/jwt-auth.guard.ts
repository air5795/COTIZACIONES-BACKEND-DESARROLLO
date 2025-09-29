// src/core/guards/jwt-auth.guard.ts
import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
  } from '@nestjs/common';
  import { Reflector } from '@nestjs/core';
  import { Request } from 'express';
  import { PUBLIC_KEY } from '../decorators/key-decorators.decorator';
  import { ExternalAuthValidationService } from '../services/external-auth-validation.service';
  
  @Injectable()
  export class JwtAuthGuard implements CanActivate {
    constructor(
      private readonly reflector: Reflector,
      private readonly authValidationService: ExternalAuthValidationService,
    ) {}
  
    async canActivate(context: ExecutionContext): Promise<boolean> {
      // 1. Verificar si la ruta es pública
      const isPublic = this.reflector.get<boolean>(
        PUBLIC_KEY,
        context.getHandler(),
      );
  
      if (isPublic) {
        return true;
      }
  
      // 2. Obtener el request
      const request = context.switchToHttp().getRequest<Request>();
  
      // 3. Extraer token del header Authorization
      const authHeader = request.headers.authorization;
      
      if (!authHeader) {
        throw new UnauthorizedException('Token de autenticación requerido');
      }
  
      const token = this.authValidationService.extractTokenFromHeader(authHeader);
  
      if (!token) {
        throw new UnauthorizedException('Formato de token inválido. Use: Bearer <token>');
      }
  
      // 4. Validar token contra sistema externo
      try {
        const userData = await this.authValidationService.validateToken(token);
        
        // 5. Adjuntar datos del usuario al request para usar en controllers
        request['user'] = userData;
        
        return true;
  
      } catch (error) {
        throw new UnauthorizedException('Token inválido o expirado');
      }
    }
  }