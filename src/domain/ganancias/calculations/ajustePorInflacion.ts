import { Decimal } from 'decimal.js';
import { AxiStaticInput, AxiDynamicInput, AxiResult, AxiStaticResult, AxiDynamicLineResult, UpdateIndexValue } from '../types';

/**
 * Calcula el Ajuste por Inflación Impositivo Estático.
 * Si el Capital Computable al inicio es positivo, la inflación genera una PÉRDIDA impositiva (Ajuste Negativo).
 * Si el Capital Computable al inicio es negativo, la inflación genera una GANANCIA impositiva (Ajuste Positivo).
 */
export function calculateAxiStatic(
  input: AxiStaticInput,
  inflationRate: Decimal
): AxiStaticResult {
  const totalActivo = new Decimal(input.activoTotalInicio);
  const bienesNoComputables = new Decimal(input.bienesNoComputablesInicio);
  const totalPasivo = new Decimal(input.pasivoTotalInicio);

  // Activo Computable = Activo Total - Bienes No Computables
  const activoComputable = totalActivo.sub(bienesNoComputables);

  // Capital Computable = Activo Computable - Pasivo Computable (Pasivo Total)
  const capitalComputable = activoComputable.sub(totalPasivo);

  let resultadoAxiStatico = new Decimal(0);
  if (capitalComputable.isPositive()) {
    // Computable Capital es > 0: Pérdida por inflación (se reporta como ajuste negativo que resta del resultado)
    resultadoAxiStatico = capitalComputable.mul(inflationRate).negated();
  } else if (capitalComputable.isNegative()) {
    // Computable Capital es < 0: Ganancia por inflación (se reporta como ajuste positivo que suma al resultado)
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

/**
 * Calcula las líneas del Ajuste por Inflación Impositivo Dinámico.
 * Para retiros de socios, dividendos, etc., se calcula como: Monto * (Coeficiente_Mensual - 1)
 */
export function calculateAxiDynamic(
  items: AxiDynamicInput[],
  indicesIPC: UpdateIndexValue[] = []
): {
  lines: AxiDynamicLineResult[];
  totalDynamic: Decimal;
  warnings: string[];
} {
  let totalDynamic = new Decimal(0);
  const warnings: string[] = [];

  // Obtener IPC de diciembre para el cálculo del coeficiente
  const ipcDiciembre = indicesIPC.find(i => i.monthIndex === 12);

  const lines = items.map(item => {
    const amount = new Decimal(item.amount);

    // Calcular coeficiente: IPC_diciembre / IPC_mes_del_movimiento
    let coef = new Decimal(1);
    if (ipcDiciembre && indicesIPC.length > 0) {
      const mesMovimiento = item.date.getMonth() + 1; // getMonth() es 0-indexed
      const ipcMes = indicesIPC.find(i => i.monthIndex === mesMovimiento);
      if (ipcMes) {
        coef = new Decimal(ipcDiciembre.ipcValue).div(new Decimal(ipcMes.ipcValue));
      } else {
        warnings.push(`AXI Dinámico: No se encontró índice IPC para el mes ${mesMovimiento} del movimiento "${item.concept}". Se usó coeficiente 1.0.`);
      }
    } else if (indicesIPC.length === 0) {
      warnings.push(`AXI Dinámico: No se cargaron índices IPC. El coeficiente del movimiento "${item.concept}" será 1.0.`);
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
 * Consolida el Ajuste por Inflación Impositivo Neto (Estático + Dinámico).
 */
export function calculateTotalAxi(
  staticInput: AxiStaticInput,
  dynamicItems: AxiDynamicInput[],
  staticInflationRate: Decimal,
  indicesIPC: UpdateIndexValue[] = []
): AxiResult & { warnings: string[] } {
  const staticResult = calculateAxiStatic(staticInput, staticInflationRate);
  const dynamicResult = calculateAxiDynamic(dynamicItems, indicesIPC);
  
  // AXI Neto = AXI Estático + AXI Dinámico
  const netAxiResult = staticResult.resultadoAxiStatico.add(dynamicResult.totalDynamic);

  return {
    staticResult,
    dynamicLines: dynamicResult.lines,
    totalAxiDynamic: dynamicResult.totalDynamic,
    netAxiResult: netAxiResult.round(),
    warnings: dynamicResult.warnings,
  };
}
