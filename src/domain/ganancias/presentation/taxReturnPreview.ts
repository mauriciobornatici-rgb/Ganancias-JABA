import { Decimal } from 'decimal.js';
import { calculateTaxReturn } from '../calculations/determinacionImpuesto';
import { buildTaxReturnCalculationInput } from '../mappers/calculationInputMapper';
import type {
  GeneralDeductionsOutput,
  PersonalDeductionsOutput,
  TaxCalculationResult,
} from '../types';

export type TaxReturnPreviewStatusKind = 'idle' | 'backend' | 'pending' | 'fallback';

export type TaxReturnPreviewStatus = {
  kind: TaxReturnPreviewStatusKind;
  label: string;
  detail: string;
};

function decimalToNumber(value: Decimal): number {
  return value.toNumber();
}

function numberToDecimal(value: unknown): Decimal {
  return new Decimal(typeof value === 'number' || typeof value === 'string' ? value : 0);
}

function serializeGeneralDeductions(value: GeneralDeductionsOutput) {
  return {
    autonomosAdmitidos: decimalToNumber(value.autonomosAdmitidos),
    servicioDomesticoTope: decimalToNumber(value.servicioDomesticoTope),
    seguroVidaTope: decimalToNumber(value.seguroVidaTope),
    seguroRetiroTope: decimalToNumber(value.seguroRetiroTope),
    gastosSepelioTope: decimalToNumber(value.gastosSepelioTope),
    interesesHipotecaTope: decimalToNumber(value.interesesHipotecaTope),
    gastosEducativosTope: decimalToNumber(value.gastosEducativosTope),
    medicosAsistencialTope: decimalToNumber(value.medicosAsistencialTope),
    honorariosMedicosTope: decimalToNumber(value.honorariosMedicosTope),
    alquilerCasaHabitacionTope: decimalToNumber(value.alquilerCasaHabitacionTope),
    locadorLocatarioTope: decimalToNumber(value.locadorLocatarioTope),
    donacionesTope: decimalToNumber(value.donacionesTope),
    totalDeduccionesGeneralesAdmitidas: decimalToNumber(value.totalDeduccionesGeneralesAdmitidas),
  };
}

function serializePersonalDeductions(value: PersonalDeductionsOutput) {
  return {
    minimoNoImponible: decimalToNumber(value.minimoNoImponible),
    conyuge: decimalToNumber(value.conyuge),
    hijos: decimalToNumber(value.hijos),
    hijosIncapacitados: decimalToNumber(value.hijosIncapacitados),
    deduccionEspecial: decimalToNumber(value.deduccionEspecial),
    totalDeduccionesPersonalesAdmitidas: decimalToNumber(value.totalDeduccionesPersonalesAdmitidas),
  };
}

export function serializeTaxCalculationResult(result: TaxCalculationResult) {
  return {
    clientName: result.clientName,
    cuit: result.cuit,
    fiscalYear: result.fiscalYear,
    ventasGravadas: decimalToNumber(result.ventasGravadas),
    ventasExentas: decimalToNumber(result.ventasExentas),
    costoVentas: decimalToNumber(result.costoVentas),
    gastosDeducibles: decimalToNumber(result.gastosDeducibles),
    gastosNoDeducibles: decimalToNumber(result.gastosNoDeducibles),
    amortizacionesBienesDeUso: decimalToNumber(result.amortizacionesBienesDeUso),
    resultadoAjustePorInflacion: decimalToNumber(result.resultadoAjustePorInflacion),
    axiStaticResult: decimalToNumber(result.axiStaticResult),
    axiDynamicResult: decimalToNumber(result.axiDynamicResult),
    resultadoComercialNeto: decimalToNumber(result.resultadoComercialNeto),
    resultadoNetoTodasCategorias: decimalToNumber(result.resultadoNetoTodasCategorias),
    deduccionesGenerales: serializeGeneralDeductions(result.deduccionesGenerales),
    resultadoNetoAntesQuebrantos: decimalToNumber(result.resultadoNetoAntesQuebrantos),
    resultadoImpositivoNeto: decimalToNumber(result.resultadoImpositivoNeto),
    deduccionesPersonales: serializePersonalDeductions(result.deduccionesPersonales),
    gananciaNetaSujetaImpuesto: decimalToNumber(result.gananciaNetaSujetaImpuesto),
    impuestoDeterminado: decimalToNumber(result.impuestoDeterminado),
    retencionesYPercepciones: decimalToNumber(result.retencionesYPercepciones),
    anticiposSiguientePeriodo: result.anticiposSiguientePeriodo.map(decimalToNumber),
    saldoAFavorAnterior: decimalToNumber(result.saldoAFavorAnterior),
    impuestoAPagarOARCA: decimalToNumber(result.impuestoAPagarOARCA),
    patrimonioInicioTotal: decimalToNumber(result.patrimonioInicioTotal),
    patrimonioCierreTotal: decimalToNumber(result.patrimonioCierreTotal),
    consumoDiferencial: decimalToNumber(result.consumoDiferencial),
    warnings: result.warnings,
    errors: result.errors,
  };
}

export function buildTaxReturnPreview(declarationData: unknown, taxParameters: unknown) {
  const calculationInput = buildTaxReturnCalculationInput(declarationData, taxParameters);
  return serializeTaxCalculationResult(calculateTaxReturn(calculationInput));
}

export function buildTaxReturnPreviewRequest({
  declarationData,
  taxParameters,
}: {
  declarationData: unknown;
  taxParameters: unknown;
}): { url: string; init: RequestInit } {
  return {
    url: '/api/declaraciones/preview',
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ declarationData, taxParameters }),
    },
  };
}

export function buildTaxReturnPreviewStatus({
  hasRequiredPreviewIdentity,
  calculationRequestKey,
  backendPreviewKey,
  isBackendPreviewPending,
  backendPreviewError,
}: {
  hasRequiredPreviewIdentity: boolean;
  calculationRequestKey: string;
  backendPreviewKey: string | null;
  isBackendPreviewPending: boolean;
  backendPreviewError: string | null;
}): TaxReturnPreviewStatus {
  if (!hasRequiredPreviewIdentity) {
    return {
      kind: 'idle',
      label: 'Sin calculo disponible',
      detail: 'Complete contribuyente y CUIT para activar el motor de calculo.',
    };
  }

  if (backendPreviewKey === calculationRequestKey) {
    return {
      kind: 'backend',
      label: 'Motor backend actualizado',
      detail: 'Resultado calculado por el endpoint backend con el mismo payload vigente.',
    };
  }

  if (isBackendPreviewPending) {
    return {
      kind: 'pending',
      label: 'Esperando confirmacion backend',
      detail: 'Se muestra el calculo local mientras el backend actualiza el preview.',
    };
  }

  return {
    kind: 'fallback',
    label: 'Preview local de respaldo',
    detail: backendPreviewError
      ? `Se muestra el calculo local. Ultimo intento backend: ${backendPreviewError}.`
      : 'Se muestra el calculo local hasta recibir una respuesta backend vigente.',
  };
}

export function hydrateTaxReturnPreviewResult(value: ReturnType<typeof serializeTaxCalculationResult>): TaxCalculationResult {
  return {
    clientName: value.clientName,
    cuit: value.cuit,
    fiscalYear: value.fiscalYear,
    ventasGravadas: numberToDecimal(value.ventasGravadas),
    ventasExentas: numberToDecimal(value.ventasExentas),
    costoVentas: numberToDecimal(value.costoVentas),
    gastosDeducibles: numberToDecimal(value.gastosDeducibles),
    gastosNoDeducibles: numberToDecimal(value.gastosNoDeducibles),
    amortizacionesBienesDeUso: numberToDecimal(value.amortizacionesBienesDeUso),
    resultadoAjustePorInflacion: numberToDecimal(value.resultadoAjustePorInflacion),
    axiStaticResult: numberToDecimal(value.axiStaticResult),
    axiDynamicResult: numberToDecimal(value.axiDynamicResult),
    resultadoComercialNeto: numberToDecimal(value.resultadoComercialNeto),
    resultadoNetoTodasCategorias: numberToDecimal(value.resultadoNetoTodasCategorias),
    deduccionesGenerales: {
      autonomosAdmitidos: numberToDecimal(value.deduccionesGenerales.autonomosAdmitidos),
      servicioDomesticoTope: numberToDecimal(value.deduccionesGenerales.servicioDomesticoTope),
      seguroVidaTope: numberToDecimal(value.deduccionesGenerales.seguroVidaTope),
      seguroRetiroTope: numberToDecimal(value.deduccionesGenerales.seguroRetiroTope),
      gastosSepelioTope: numberToDecimal(value.deduccionesGenerales.gastosSepelioTope),
      interesesHipotecaTope: numberToDecimal(value.deduccionesGenerales.interesesHipotecaTope),
      gastosEducativosTope: numberToDecimal(value.deduccionesGenerales.gastosEducativosTope),
      medicosAsistencialTope: numberToDecimal(value.deduccionesGenerales.medicosAsistencialTope),
      honorariosMedicosTope: numberToDecimal(value.deduccionesGenerales.honorariosMedicosTope),
      alquilerCasaHabitacionTope: numberToDecimal(value.deduccionesGenerales.alquilerCasaHabitacionTope),
      locadorLocatarioTope: numberToDecimal(value.deduccionesGenerales.locadorLocatarioTope),
      donacionesTope: numberToDecimal(value.deduccionesGenerales.donacionesTope),
      totalDeduccionesGeneralesAdmitidas: numberToDecimal(value.deduccionesGenerales.totalDeduccionesGeneralesAdmitidas),
    },
    resultadoNetoAntesQuebrantos: numberToDecimal(value.resultadoNetoAntesQuebrantos),
    resultadoImpositivoNeto: numberToDecimal(value.resultadoImpositivoNeto),
    deduccionesPersonales: {
      minimoNoImponible: numberToDecimal(value.deduccionesPersonales.minimoNoImponible),
      conyuge: numberToDecimal(value.deduccionesPersonales.conyuge),
      hijos: numberToDecimal(value.deduccionesPersonales.hijos),
      hijosIncapacitados: numberToDecimal(value.deduccionesPersonales.hijosIncapacitados),
      deduccionEspecial: numberToDecimal(value.deduccionesPersonales.deduccionEspecial),
      totalDeduccionesPersonalesAdmitidas: numberToDecimal(value.deduccionesPersonales.totalDeduccionesPersonalesAdmitidas),
    },
    gananciaNetaSujetaImpuesto: numberToDecimal(value.gananciaNetaSujetaImpuesto),
    impuestoDeterminado: numberToDecimal(value.impuestoDeterminado),
    retencionesYPercepciones: numberToDecimal(value.retencionesYPercepciones),
    anticiposSiguientePeriodo: value.anticiposSiguientePeriodo.map(numberToDecimal),
    saldoAFavorAnterior: numberToDecimal(value.saldoAFavorAnterior),
    impuestoAPagarOARCA: numberToDecimal(value.impuestoAPagarOARCA),
    patrimonioInicioTotal: numberToDecimal(value.patrimonioInicioTotal),
    patrimonioCierreTotal: numberToDecimal(value.patrimonioCierreTotal),
    consumoDiferencial: numberToDecimal(value.consumoDiferencial),
    warnings: value.warnings,
    errors: value.errors,
  };
}
