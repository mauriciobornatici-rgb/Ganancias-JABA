import type { Decimal } from 'decimal.js';
import { calculateTaxReturn } from '../calculations/determinacionImpuesto';
import { buildTaxReturnCalculationInput } from '../mappers/calculationInputMapper';
import type {
  GeneralDeductionsOutput,
  PersonalDeductionsOutput,
  TaxCalculationResult,
} from '../types';

function decimalToNumber(value: Decimal): number {
  return value.toNumber();
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
