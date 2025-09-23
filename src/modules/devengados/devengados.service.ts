import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { PlanillasAporte } from '../planillas_aportes/entities/planillas_aporte.entity';
import { Empresa } from '../empresas/entities/empresa.entity';

@Injectable()
export class DevengadosService {
  constructor(
    @InjectRepository(PlanillasAporte)
    private planillaRepo: Repository<PlanillasAporte>,
    
    @InjectRepository(Empresa)
    private empresaRepo: Repository<Empresa>,
  ) {}

  /**
   * 📋 OBTENER LISTA DE LIQUIDACIONES DEVENGADAS
   * Solo planillas que tienen multas o recargos de ley (total_multas > 0 OR dias_retraso > 0)
   */
  async obtenerLiquidacionesDevengadas(filtros: any = {}): Promise<any> {
    try {
      const query = this.planillaRepo.createQueryBuilder('planilla')
        .leftJoinAndSelect('planilla.empresa', 'empresa')
        .where('planilla.fecha_liquidacion IS NOT NULL') // Solo liquidadas
        .andWhere(
          new Brackets(qb => {
            qb.where('planilla.total_multas > :cero', { cero: 0 })
              .orWhere('planilla.dias_retraso > :cero', { cero: 0 });
          })
        );

      // 🔍 FILTROS OPCIONALES
      if (filtros.fechaDesde) {
        query.andWhere('planilla.fecha_planilla >= :fechaDesde', { 
          fechaDesde: filtros.fechaDesde 
        });
      }

      if (filtros.fechaHasta) {
        query.andWhere('planilla.fecha_planilla <= :fechaHasta', { 
          fechaHasta: filtros.fechaHasta 
        });
      }

      if (filtros.codPatronal) {
        query.andWhere('planilla.cod_patronal ILIKE :codPatronal', { 
          codPatronal: `%${filtros.codPatronal}%` 
        });
      }

      if (filtros.empresa) {
        query.andWhere('empresa.emp_nom ILIKE :empresa', { 
          empresa: `%${filtros.empresa}%` 
        });
      }

      if (filtros.mes) {
        query.andWhere('planilla.mes = :mes', { mes: filtros.mes });
      }

      if (filtros.gestion) {
        query.andWhere('planilla.gestion = :gestion', { gestion: filtros.gestion });
      }

      // 📊 ORDENAMIENTO
      query.orderBy('planilla.fecha_planilla', 'DESC')
        .addOrderBy('planilla.total_multas', 'DESC');

      const planillas = await query.getMany();

      // 📝 MAPEAR RESPUESTA CON DATOS RELEVANTES
      const resultado = planillas.map(planilla => ({
        id_planilla_aportes: planilla.id_planilla_aportes,
        cod_patronal: planilla.cod_patronal,
        empresa: planilla.empresa?.emp_nom || 'Sin empresa',
        mes: planilla.mes,
        gestion: planilla.gestion,
        fecha_planilla: planilla.fecha_planilla,
        fecha_liquidacion: planilla.fecha_liquidacion,
        total_importe: planilla.total_importe,
        dias_retraso: planilla.dias_retraso,
        total_multas: planilla.total_multas,
        total_a_cancelar: planilla.total_a_cancelar,
        tipo_empresa: planilla.empresa?.tipo || 'N/A',
        // 🚨 INDICADORES DE SEVERIDAD
        nivel_multa: this.calcularNivelMulta(planilla.total_multas, planilla.total_importe),
        dias_mora_categoria: this.categorizarDiasMora(planilla.dias_retraso),
      }));

      return {
        mensaje: 'Liquidaciones devengadas obtenidas exitosamente',
        total: resultado.length,
        liquidaciones: resultado,
      };

    } catch (error) {
      throw new BadRequestException(`Error al obtener liquidaciones devengadas: ${error.message}`);
    }
  }

  /**
   * 📄 OBTENER DETALLE DE LIQUIDACIÓN DEVENGADA ESPECÍFICA
   * Formato idéntico al reporte oficial para visualización
   */
  async obtenerDetalleLiquidacionDevengada(idPlanilla: number): Promise<any> {
    try {
      const planilla = await this.planillaRepo.findOne({
        where: { id_planilla_aportes: idPlanilla },
        relations: ['empresa']
      });

      if (!planilla) {
        throw new BadRequestException('Planilla no encontrada');
      }

      // ✅ VALIDAR QUE SEA DEVENGADA
      if (!planilla.total_multas && !planilla.dias_retraso) {
        throw new BadRequestException('Esta planilla no tiene recargos de ley (no es devengada)');
      }

      if (!planilla.fecha_liquidacion) {
        throw new BadRequestException('Esta planilla no está liquidada');
      }

      // 📋 FORMATO PARA EL REPORTE (igual al de la imagen)
      return {
        // === INFORMACIÓN GENERAL ===
        tipo_empresa: planilla.empresa?.tipo === 'AP' ? 'Privada' : 'Privada',
        tasa: '10%',
        fecha_presentacion_oficial: this.formatearFecha(planilla.fecha_presentacion_oficial),
        fecha_deposito_presentacion: this.formatearFecha(planilla.fecha_deposito_presentacion),
        calculo_vigencia_hasta: this.formatearFecha(planilla.fecha_pago),
        salario_cotizable: planilla.total_importe,
        subtotal_aportes: planilla.aporte_porcentaje,

        // === EMPRESA ===
        empresa: planilla.empresa?.emp_nom || 'Sin nombre',
        regional: planilla.empresa?.emp_reg || 'LA PAZ',
        cod_patronal: planilla.cod_patronal,
        mes: planilla.mes,
        gestion: planilla.gestion,

        // === RECARGOS DE LEY ===
        dias_mora: planilla.dias_retraso,
        ap_ac: planilla.monto_actualizado,
        interes: planilla.intereses,
        multa_sobre_interes: planilla.multa_sobre_intereses,
        multa_no_presentacion: planilla.multa_no_presentacion,
        subtotal_recargos_ley: planilla.total_multas,

        // === DEDUCCIONES ===
        descuento_min_salud: planilla.total_aportes_min_salud || 0,
        otros_descuentos: planilla.otros_descuentos || 0,
        subtotal_deducciones: (planilla.total_aportes_min_salud || 0) + (planilla.otros_descuentos || 0),

        // === TOTALES ===
        total_a_cancelar: planilla.total_a_cancelar,

        // === METADATOS ===
        fecha_liquidacion: planilla.fecha_liquidacion,
        com_nro: planilla.com_nro,
        
        // === UFVs ===
        ufv_dia_formal: planilla.ufv_dia_formal,
        ufv_dia_presentacion: planilla.ufv_dia_presentacion,

        // === DATOS ADICIONALES PARA EL REPORTE ===
        nota_calculo: 'CÁLCULO CON VIGENCIA HASTA EL DÍA',
        presentacion_fecha: this.formatearFecha(planilla.fecha_deposito_presentacion),
      };

    } catch (error) {
      throw new BadRequestException(`Error al obtener detalle de liquidación devengada: ${error.message}`);
    }
  }

  /**
   * 📈 ESTADÍSTICAS DE LIQUIDACIONES DEVENGADAS
   */
  async obtenerEstadisticasDevengadas(): Promise<any> {
    try {
      const queryBase = this.planillaRepo.createQueryBuilder('planilla')
        .leftJoin('planilla.empresa', 'empresa')
        .where('planilla.fecha_liquidacion IS NOT NULL')
        .andWhere(
          new Brackets(qb => {
            qb.where('planilla.total_multas > :cero', { cero: 0 })
              .orWhere('planilla.dias_retraso > :cero', { cero: 0 });
          })
        );

      // Total de liquidaciones devengadas
      const totalDevengadas = await queryBase.getCount();

      // Por tipo de empresa
      const porTipoEmpresa = await queryBase
        .select('empresa.tipo', 'tipo')
        .addSelect('COUNT(*)', 'cantidad')
        .addSelect('SUM(planilla.total_multas)', 'total_multas')
        .groupBy('empresa.tipo')
        .getRawMany();

      // Por mes
      const porMes = await queryBase
        .select('planilla.mes', 'mes')
        .addSelect('planilla.gestion', 'gestion')
        .addSelect('COUNT(*)', 'cantidad')
        .addSelect('SUM(planilla.total_multas)', 'total_multas')
        .groupBy('planilla.mes, planilla.gestion')
        .orderBy('planilla.gestion', 'DESC')
        .addOrderBy('planilla.mes', 'DESC')
        .getRawMany();

      return {
        total_devengadas: totalDevengadas,
        por_tipo_empresa: porTipoEmpresa,
        por_mes: porMes.slice(0, 12), // Últimos 12 meses
      };

    } catch (error) {
      throw new BadRequestException(`Error al obtener estadísticas: ${error.message}`);
    }
  }

  // 🔧 MÉTODOS HELPER
  private calcularNivelMulta(totalMultas: number, totalImporte: number): string {
    if (!totalMultas || totalMultas === 0) return 'SIN_MULTA';
    
    const porcentaje = (totalMultas / totalImporte) * 100;
    
    if (porcentaje < 5) return 'BAJO';
    if (porcentaje < 15) return 'MEDIO';
    if (porcentaje < 30) return 'ALTO';
    return 'CRITICO';
  }

  private categorizarDiasMora(dias: number): string {
    if (!dias || dias === 0) return 'SIN_MORA';
    if (dias <= 30) return 'BAJA';
    if (dias <= 90) return 'MEDIA';
    if (dias <= 180) return 'ALTA';
    return 'CRITICA';
  }

  private formatearFecha(fecha: Date): string {
    if (!fecha) return null;
    return fecha.toISOString().split('T')[0];
  }
}