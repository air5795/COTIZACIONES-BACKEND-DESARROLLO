import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

export interface ValidateTokenResponse {
  userId: number;
  username: string;
  scope: string;
}

@Injectable()
export class ExternalAuthValidationService {
  private readonly AUTH_VALIDATE_URL = 'http://10.0.10.217:3000/api/auth/validate';

  constructor(private readonly httpService: HttpService) {}

  /**
   * Valida un token JWT contra el sistema de autenticación externo
   * @param token - Token JWT a validar
   * @returns Datos del usuario si es válido
   * @throws HttpException si el token es inválido
   */
  async validateToken(token: string): Promise<ValidateTokenResponse> {
    try {

      const response = await firstValueFrom(
        this.httpService.get(this.AUTH_VALIDATE_URL, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
      );

      return response.data as ValidateTokenResponse;

    } catch (error) {
      if (error instanceof AxiosError) {

        // Si el sistema externo devuelve 401
        if (error.response?.status === 401) {
          throw new HttpException(
            {
              message: 'Token inválido o expirado',
              error: 'Unauthorized',
              statusCode: 401,
            },
            HttpStatus.UNAUTHORIZED,
          );
        }
      }

      // Otros errores (timeout, red, etc.)
      throw new HttpException(
        {
          message: 'Error al validar token con el sistema de autenticación',
          error: 'Service Unavailable',
          statusCode: 503,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Extrae el token del header Authorization
   * @param authHeader - Header Authorization completo
   * @returns Token sin el prefijo "Bearer "
   */
  extractTokenFromHeader(authHeader: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7); // Remueve "Bearer "
  }
}