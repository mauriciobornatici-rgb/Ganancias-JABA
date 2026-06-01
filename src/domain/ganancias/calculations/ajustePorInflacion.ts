import { Decimal } from 'decimal.js';
import {
  AxiStaticInput,
  AxiDynamicInput,
  AxiResult,
  AxiStaticResult,
  AxiDynamicLineResult,
  UpdateIndexValue,
  UsefulTaxCoefficients,
} from '../types';

/**
 * Calcula el Ajuste por Inflacion Impositivo Estatico.
 * Si el capital computable inicial es positivo, la inflacion genera una perdida impositiva.
 * Si el capital computable inicial es negativo, la inflacion genera una ganancia impositiva.
 */
export function calculateAxiStatic(
  input: AxiStaticInput,
  inflationRate: Decimal
): AxiStaticResult {
  const totalActivo = new Decimal(input.activoTotalInicio);
  const bienesNoComputables = new Decimal(input.bienesNoComputablesInicio);
  const totalPasivo = new Decimal(input.pasivoTotalInicio);

  const activoComputable = totalActivo.sub(bienesNoComputables);
  const capitalComputable = activoComputable.sub(totalPasivo);

  let resultadoAxiStatico = new Decimal(0);
  if (capitalComputable.isPositive()) {
    resultadoAxiStatico = capitalComputable.mul(inflationRate).negated();
  } else if (capitalComputable.isNegative()) {
    resultadoAxiStatico = capitalComputable.abs().mul(inflationRate);
  }

  return {
    activoComputableInicio: activoComputable.round(),
    pasivoComputableInicio: totalPasivo.round(),
    capitalComputableInicio: capitalComputable.round(),
    factorActualizacion: inflationRate,
    resultadoAxiStatico: resultadoAxiStatico.round(),
  };
}

function shouldUseAverageDynamicCoefficient(item: AxiDynamicInput): boolean {
  return item.type === 'RetiroSocio' || item.type === 'AporteCapital';
}

/**
 * Calcula las lineas del Ajuste por Inflacion Impositivo Dinamico.
 * Retiros y aportes agregados siguen la planilla: coeficiente promedio anual.
 * El resto de movimientos conserva coeficiente mensual por fecha.
 */
export function calculateAxiDynamic(
  items: AxiDynamicInput[],
  indicesIPC: UpdateIndexValue[] = [],
  usefulCoefficients: UsefulTaxCoefficients = {}
): {
  lines: AxiDynamicLineResult[];
  totalDynamic: Decimal;
  warnings: string[];
} {
  let totalDynamic = new Decimal(0);
  const warnings: string[] = [];
  const ipcDiciembre = indicesIPC.find(i => i.monthIndex === 12);

  const lines = items.map(item => {
    const amount = new Decimal(item.amount);
    const useAverageCoefficient = shouldUseAverageDynamicCoefficient(item);

    let coef = new Decimal(1);
    if (useAverageCoefficient && usefulCoefficients.currentYearAverage) {
      coef = new Decimal(usefulCoefficients.currentYearAverage);
    } else if (ipcDiciembre && indicesIPC.length > 0) {
      const mesMovimiento = item.date.getMonth() + 1;
      const ipcMes = indicesIPC.find(i => i.monthIndex === mesMovimiento);
      if (ipcMes) {
        coef = new Decimal(ipcDiciembre.ipcValue).div(new Decimal(ipcMes.ipcValue));
      } else {
        warnings.push(`AXI Dinamico: No se encontro indice IPC para el mes ${mesMovimiento} del movimiento "${item.concept}". Se uso coeficiente 1.0.`);
      }
    } else if (useAverageCoefficient) {
      warnings.push(`AXI Dinamico: No se encontro coeficiente promedio anual para el movimiento agregado "${item.concept}". Se uso coeficiente 1.0.`);
    } else if (indicesIPC.length === 0) {
      warnings.push(`AXI Dinamico: No se cargaron indices IPC. El coeficiente del movimiento "${item.concept}" sera 1.0.`);
    }

    const factor = item.type === 'AporteCapital' ? -1 : 1;
    const computedAxi = amount.mul(coef.sub(1)).mul(factor);
    totalDynamic = totalDynamic.add(computedAxi);

    return {
      concept: item.concept,
      amount: amount.round(),
      factorActualizacion: coef,
      computedAxi: computedAxi.round(),
    };
  });

  return {
    lines,
    totalDynamic: totalDynamic.round(),
    warnings,
  };
}

/**
 * Consolida el Ajuste por Inflacion Impositivo Neto: estatico + dinamico.
 */
export function calculateTotalAxi(
  staticInput: AxiStaticInput,
  dynamicItems: AxiDynamicInput[],
  staticInflationRate: Decimal,
  indicesIPC: UpdateIndexValue[] = [],
  usefulCoefficients: UsefulTaxCoefficients = {}
): AxiResult & { warnings: string[] } {
  const staticResult = calculateAxiStatic(staticInput, staticInflationRate);
  const dynamicResult = calculateAxiDynamic(dynamicItems, indicesIPC, usefulCoefficients);
  const netAxiResult = staticResult.resultadoAxiStatico.add(dynamicResult.totalDynamic);

  return {
    staticResult,
    dynamicLines: dynamicResult.lines,
    totalAxiDynamic: dynamicResult.totalDynamic,
    netAxiResult: netAxiResult.round(),
    warnings: dynamicResult.warnings,
  };
}
