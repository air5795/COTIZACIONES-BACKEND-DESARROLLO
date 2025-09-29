import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { url } from 'inspector';
import { firstValueFrom } from 'rxjs';
import { ResponseUtil } from 'src/core/utility/response-util';

@Injectable()
export class ExternalApiService {
  private baseUrl = 'http://192.168.1.224:8888/saas-siigah/api/v1';
  private userName = process.env.API_USERNAME;
  private password = process.env.API_PASSWORD;
  private apiToken: string | null = null;
  private loginPromise: Promise<any> | null = null;

  constructor(private readonly httpService: HttpService) {
  }

  async loginToExternalApi() {
    if (this.loginPromise) {
      return await this.loginPromise;
    }

    const params = new URLSearchParams();
    params.append('user', this.userName);
    params.append('password', this.password);

    this.loginPromise = (async () => {
      try {
        
        const response = await firstValueFrom(
          this.httpService.post(`${this.baseUrl}/security/login`, params, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }),
        );

        this.apiToken = response.data.token;
        

        return {
          status: true,
          data: response.data,
          message: 'Inicio de sesión exitoso',
        };
      } catch (error) {
        this.apiToken = null;
        throw new Error(`Error al iniciar sesión en la API externa: ${error.message}`);
      } finally {
        this.loginPromise = null;
      }
    })();

    return await this.loginPromise;
  }

  private async handleRequest<T>(requestFn: () => Promise<T>, methodName: string): Promise<T> {
    // Si no tenemos token, obtenerlo primero
    if (!this.apiToken) {
      await this.loginToExternalApi();
    }

    try {
      return await requestFn();
    } catch (error: any) {
      // Si recibimos un 401, el token está expirado/inválido
      if (error.response?.status === 401) {
        
        // Limpiar token actual e intentar renovar
        this.apiToken = null;
        
        try {
          await this.loginToExternalApi();
          // Reintentar la petición con el nuevo token
          return await requestFn();
        } catch (loginError) {
          throw new Error(`Error de autenticación en ${methodName}: ${loginError.message}`);
        }
      }
      
      // Si no es un error 401, relanzar el error original
      throw error;
    }
  }

  getApiToken(): string | null {
    return this.apiToken;
  }

  async getEmpresaByNroPatronal(npatronal: string): Promise<any> {
    
    return await this.handleRequest(async () => {
      const url = `${this.baseUrl}/modelo/getEmpresaByNroPatronal/${npatronal}`;
      
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
          },
        }),
      );
      
      return response.data.empresas;
    }, 'getEmpresaByNroPatronal');
  }

  async getAllEmpresas(): Promise<any> {
    
    return await this.handleRequest(async () => {
      const url = `${this.baseUrl}/modelo/getAllEmpresas`;

      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
          },
        }),
      );
      
      return response.data.empresas;
    }, 'getAllEmpresas');
  }

  /* async getAseguradosByNroPatronal(npatronal: string): Promise<any> {
    console.log("🔍 Llamando a getAseguradosByNroPatronal con nroPatronal:", npatronal);
    
    return await this.handleRequest(async () => {
      const url = `${this.baseUrl}/modelo/getAllAseguradosByNroPatronal/${npatronal}`;

      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
          },
        }),
      );
      
      return response.data.datosAsegurado;
    }, 'getAseguradosByNroPatronal');
  } */

  async getAseguradoByCi(ci: string): Promise<any> {
    
    return await this.handleRequest(async () => {
      const url = `${this.baseUrl}/modelo/getDatosAseguradoByAseCi/${ci}`;

      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
          },
        }),
      );
      
      const data = response.data.datosAsegurado;
      if (data) {
        return ResponseUtil.success(data, 'Datos de Empleado encontrados.');
      } else {
        return ResponseUtil.error('No hay información del carnet solicitado.');
      }
    }, 'getAseguradoByCi');
  }

  async getAseguradoByMatricula(matricula: string): Promise<any> {
    
    return await this.handleRequest(async () => {
      const url = `${this.baseUrl}/modelo/getDatosAseguradoByAseMat/${matricula}`;

      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
          },
        }),
      );
      
      const data = [response.data.datosAsegurado];
      if (data && data.length > 0) {
        return ResponseUtil.success(data, 'Datos de Empleado encontrados.');
      } else {
        return ResponseUtil.error('No hay información de la matricula solicitada.');
      }
    }, 'getAseguradoByMatricula');
  }

  async getAllAseguradosByNroPatronal(npatronal: string): Promise<any> {
  
  if (!this.apiToken) {
    throw new Error('Token no disponible');
  }

  const url = `${this.baseUrl}/modelo/getAllAseguradosByNroPatronal/${npatronal}`;

  try {
    const response = await firstValueFrom(
      this.httpService.get(url, {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
        },
      }),
    );
    

    if (response.data.ok && response.data.datosAsegurado) {
      return {
        status: true,
        data: response.data.datosAsegurado,
        total: response.data.datosAsegurado.length,
        npatronal: response.data.npatronal
      };
    } else {
      return {
        status: false,
        data: [],
        total: 0,
        msg: response.data.msg || 'No se encontraron asegurados para este número patronal'
      };
    }

  } catch (error) {
    throw new Error(`Error al obtener asegurados por número patronal: ${error.message}`);
  }
}

async buscarBajasMedicas(matricula: string): Promise<any> {
  
  return await this.handleRequest(async () => {
    const url = `${this.baseUrl}/gestion/getCertificadoIncapacidadByParamMat/${matricula}`;

    const response = await firstValueFrom(
      this.httpService.get(url, {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
        },
      }),
    );
    
    return response.data;
  }, 'buscarBajasMedicas');
}







}