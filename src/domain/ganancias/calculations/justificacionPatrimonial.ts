import { Decimal } from 'decimal.js';
import { PersonalAssetInput, PersonalLiabilityInput } from '../types';

export interface JvpCalculationOutput {
  patrimonioInicio: Decimal;
  patrimonioCierre: Decimal;
  totalColumnaI: Decimal;  // Erogaciones y patrimonio final
  totalColumnaII: Decimal; // Recursos y patrimonio inicial
  consumoDiferencial: Decimal;
  justificationDiff: Decimal; // Cuadre matemático (debe ser 0)
  warnings: string[];
}

/**
 * Calcula la Justificación de Variaciones Patrimoniales (JVP) y determina el Consumo Anual.
 * Realiza la auditoría de balanceo entre Columna I y Columna II, alertando ante consumos negativos.
 */
export function calculatePatrimonialJustification(params: {
  personalAssets: PersonalAssetInput[];
  personalLiabilities: PersonalLiabilityInput[];
  resultadoImpositivo: Decimal; // Resultado de la liquidación del período (Tercera Categoría + otros)
  amortizaciones: Decimal;       // Ajuste que justifica (amortizaciones que restaron resultado comercial pero no implican erogación de fondos)
  ingresosExentos: Decimal;      // Ventas e ingresos exentos
  gastosNoDeducibles: Decimal;   // Gastos no deducibles en ganancias (Columna I - no justifican)
  otrasJustificaciones: { concept: string; column: number; amount: Decimal }[];
}): JvpCalculationOutput {
  const warnings: string[] = [];

  // 1. Patrimonio al Inicio
  let activosInicio = new Decimal(0);
  let pasivosInicio = new Decimal(0);
  params.personalAssets.forEach(a => { activosInicio = activosInicio.add(a.valueInitial); });
  params.personalLiabilities.forEach(l => { pasivosInicio = pasivosInicio.add(l.valueInitial); });
  const patrimonioInicio = activosInicio.sub(pasivosInicio);

  // 2. Patrimonio al Cierre
  let activosCierre = new Decimal(0);
  let pasivosCierre = new Decimal(0);
  params.personalAssets.forEach(a => { activosCierre = activosCierre.add(a.valueFinal); });
  params.personalLiabilities.forEach(l => { pasivosCierre = pasivosCierre.add(l.valueFinal); });
  const patrimonioCierre = activosCierre.sub(pasivosCierre);

  // ==========================================
  // COLUMNA II: Recursos disponibles (Patrimonio Inicio + Ingresos + Justificaciones)
  // ==========================================
  let totalColumnaII = new Decimal(0);

  // Patrimonio Neto al Inicio (siempre justifica)
  totalColumnaII = totalColumnaII.add(patrimonioInicio);

  // Resultado Impositivo del período (si es beneficio/ganancia)
  if (params.resultadoImpositivo.isPositive()) {
    totalColumnaII = totalColumnaII.add(params.resultadoImpositivo);
  }

  // Ingresos exentos / no gravados (justifican erogaciones)
  totalColumnaII = totalColumnaII.add(params.ingresosExentos);

  // Amortizaciones (justifican porque restaron resultado pero no implican salida de fondos)
  totalColumnaII = totalColumnaII.add(params.amortizaciones);

  // Otras justificaciones cargadas en Columna II
  params.otrasJustificaciones
    .filter(j => j.column === 2)
    .forEach(j => { totalColumnaII = totalColumnaII.add(j.amount); });

  // ==========================================
  // COLUMNA I: Destino de recursos (Patrimonio Cierre + Erogaciones no deducibles)
  // ==========================================
  let totalColumnaI = new Decimal(0);

  // Patrimonio Neto al Cierre
  totalColumnaI = totalColumnaI.add(patrimonioCierre);

  // Gastos y conceptos que no justifican (egresos que restaron pero no son deducibles impositivamente)
  totalColumnaI = totalColumnaI.add(params.gastosNoDeducibles);

  // Pérdida impositiva (si el resultado del período fue quebranto/pérdida, se declara en Columna I)
  if (params.resultadoImpositivo.isNegative()) {
    totalColumnaI = totalColumnaI.add(params.resultadoImpositivo.abs());
  }

  // Otras justificaciones cargadas en Columna I
  params.otrasJustificaciones
    .filter(j => j.column === 1)
    .forEach(j => { totalColumnaI = totalColumnaI.add(j.amount); });

  // ==========================================
  // CÁLCULO DEL CONSUMO (DIFERENCIAL)
  // Consumo = Columna II (Recursos) - Columna I (Estructura declarada)
  // ==========================================
  const consumoDiferencial = totalColumnaII.sub(totalColumnaI);

  // Agregamos el Consumo a Columna I para balancear las columnas (Col I total debe ser igual a Col II)
  totalColumnaI = totalColumnaI.add(consumoDiferencial);

  // Validación de auditoría de Consumo Negativo
  if (consumoDiferencial.isNegative()) {
    warnings.push(
      `Inconsistencia Impositiva Crítica: El consumo anual calculado es negativo (-$${consumoDiferencial.abs().toFixed(2)}). ` +
      `Esto sugiere la existencia de ingresos omitidos, pasivos subvaluados o activos sobrevaluados.`
    );
  } else if (consumoDiferencial.isZero()) {
    warnings.push(
      `Advertencia de Consumo Nulo: El consumo anual calculado es exactamente $0.00. ` +
      `Esto es altamente inusual y puede llamar la atención de la ARCA durante una auditoría.`
    );
  }

  // Cuadre matemático final (debe ser cero ya que agregamos el consumo a Col I)
  const justificationDiff = totalColumnaII.sub(totalColumnaI);

  return {
    patrimonioInicio: patrimonioInicio.round(),
    patrimonioCierre: patrimonioCierre.round(),
    totalColumnaI: totalColumnaI.round(),
    totalColumnaII: totalColumnaII.round(),
    consumoDiferencial: consumoDiferencial.round(),
    justificationDiff: justificationDiff.round(),
    warnings,
  };
}
