import { Decimal } from 'decimal.js';
import type {
  AxiDynamicInput,
  FixedAssetInput,
  PayableInput,
  PersonalDeductionsInput,
  ReceivableInput,
  TaxReturnCalculationInput,
  TaxWithholdingInput,
} from '../types';

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord {
  return value !== null && typeof value === 'object' ? value as RawRecord : {};
}

function asRecordArray(value: unknown): RawRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function stringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return fallback;
}

function decimalValue(value: unknown, fallback: string | number = 0): Decimal {
  if (value instanceof Decimal) return value;
  if (value === null || value === undefined || value === '') return new Decimal(fallback);
  if (typeof value === 'string' || typeof value === 'number') return new Decimal(value);
  if (typeof value === 'object' && 'toString' in value) {
    const asString = value.toString();
    if (asString !== '[object Object]') return new Decimal(asString);
  }
  return new Decimal(fallback);
}

function optionalDecimalValue(value: unknown): Decimal | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return decimalValue(value);
}

function usefulCoefficientValues(value: unknown): { decPreviousToDecCurrent?: Decimal; currentYearAverage?: Decimal } | undefined {
  const raw = asRecord(value);
  const coefficients = {
    decPreviousToDecCurrent: optionalDecimalValue(raw.decPreviousToDecCurrent),
    currentYearAverage: optionalDecimalValue(raw.currentYearAverage),
  };

  return coefficients.decPreviousToDecCurrent || coefficients.currentYearAverage ? coefficients : undefined;
}

function dateValue(value: unknown): Date {
  const candidate = value instanceof Date
    ? value
    : new Date(typeof value === 'string' || typeof value === 'number' ? value : Date.now());

  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

function fixedAssetType(value: unknown): FixedAssetInput['type'] {
  const rawType = stringValue(value, 'Otro');
  if (rawType === 'Rodado' || rawType === 'Inmueble' || rawType === 'Equipamiento' || rawType === 'Otro') {
    return rawType;
  }
  return 'Otro';
}

function taxCode(value: unknown): TaxWithholdingInput['taxCode'] {
  return stringValue(value, 'Ganancias') === 'Otros' ? 'Otros' : 'Ganancias';
}

function personalDeductionType(value: unknown): PersonalDeductionsInput['tipoDeduccionEspecial'] {
  const rawType = stringValue(value, 'Ninguna');
  if (rawType === 'Autonomo' || rawType === 'Emprendedor' || rawType === 'Dependiente' || rawType === 'Ninguna') {
    return rawType;
  }
  return 'Ninguna';
}

function axiDynamicType(value: unknown): AxiDynamicInput['type'] {
  const rawType = stringValue(value, 'Otro');
  if (rawType === 'RetiroSocio' || rawType === 'AporteCapital' || rawType === 'Dividendo' || rawType === 'Otro') {
    return rawType;
  }
  return 'Otro';
}

function receivableType(value: unknown): ReceivableInput['type'] {
  const rawType = stringValue(value, 'Comercial');
  if (rawType === 'Comercial' || rawType === 'Fiscal' || rawType === 'Financiero') {
    return rawType;
  }
  return 'Comercial';
}

function payableType(value: unknown): PayableInput['type'] {
  const rawType = stringValue(value, 'Otros');
  if (rawType === 'Proveedores' || rawType === 'Otros') {
    return rawType;
  }
  return 'Otros';
}

function patrimonialColumn(value: unknown): number {
  return numberValue(value, 2) === 1 ? 1 : 2;
}

export function buildTaxReturnCalculationInput(
  declarationData: unknown,
  taxParameters: unknown
): TaxReturnCalculationInput {
  const data = asRecord(declarationData);
  const params = asRecord(taxParameters);
  const parameterSet = asRecord(params.parameterSet);
  const taxValues = Object.keys(parameterSet).length > 0 ? parameterSet : params;
  const ipcValues = params.ipcIndices ?? params.indices;
  const usefulCoefficients = usefulCoefficientValues(params.usefulCoefficients);
  const generalDeductions = asRecord(data.generalDeductions);
  const personalDeductions = asRecord(data.personalDeductions);

  const fiscalYear = numberValue(data.fiscalYear, 2025);

  return {
    clientName: stringValue(data.clientName),
    cuit: stringValue(data.cuit),
    fiscalYear,
    params: {
      year: fiscalYear,
      deduccionesArt30: {
        minimoNoImponible: decimalValue(taxValues.minimoNoImponible),
        conyuge: decimalValue(taxValues.conyuge),
        hijo: decimalValue(taxValues.hijo),
        hijoIncapacitado: decimalValue(taxValues.hijoIncapacitado),
        especialAutonomo: decimalValue(taxValues.especialAutonomo),
        especialEmprendedor: decimalValue(taxValues.especialEmprendedor),
        especialDependiente: decimalValue(taxValues.especialDependiente),
      },
      topesDeduccionesGenerales: {
        topeServicioDomestico: decimalValue(taxValues.topeServicioDomestico),
        topeSeguroVida: decimalValue(taxValues.topeSeguroVida),
        topeSeguroRetiro: decimalValue(taxValues.topeSeguroRetiro),
        topeGastosSepelio: decimalValue(taxValues.topeGastosSepelio),
        topeInteresHipoteca: decimalValue(taxValues.topeInteresHipoteca),
        topeGastosEducativos: decimalValue(taxValues.topeGastosEducativos),
      },
      escalaArt94: asRecordArray(params.brackets).map(bracket => ({
        fromAmount: decimalValue(bracket.fromAmount),
        toAmount: bracket.toAmount === null || bracket.toAmount === undefined || bracket.toAmount === ''
          ? null
          : decimalValue(bracket.toAmount),
        fixedAmount: decimalValue(bracket.fixedAmount),
        percentage: decimalValue(bracket.percentage),
        excessOf: decimalValue(bracket.excessOf),
      })),
      indicesIPC: asRecordArray(ipcValues).map(index => ({
        monthIndex: numberValue(index.monthIndex),
        ipcValue: decimalValue(index.ipcValue),
      })),
      ...(usefulCoefficients ? { usefulCoefficients } : {}),
    },
    sales: asRecordArray(data.sales).map(sale => ({
      date: dateValue(sale.date),
      netAmount: decimalValue(sale.netAmount),
      isExempt: booleanValue(sale.isExempt),
    })),
    purchases: asRecordArray(data.purchases).map(purchase => ({
      date: dateValue(purchase.date),
      netAmount: decimalValue(purchase.netAmount),
      isDeductible: purchase.isDeductible !== false,
      isExempt: booleanValue(purchase.isExempt),
      expenseType: stringValue(purchase.expenseType, 'GastosGenerales'),
    })),
    fixedAssets: asRecordArray(data.fixedAssets).map(asset => ({
      id: stringValue(asset.id),
      name: stringValue(asset.name),
      type: fixedAssetType(asset.type),
      purchaseDate: dateValue(asset.purchaseDate),
      originalCost: decimalValue(asset.originalCost),
      usefulLife: numberValue(asset.usefulLife, 10),
      yearsElapsed: numberValue(asset.yearsElapsed),
      customReexpIndex: decimalValue(asset.customReexpIndex, 1),
    })),
    inventories: [
      {
        concept: 'Bienes de Cambio',
        initialStock: decimalValue(data.initialStock),
        finalStock: decimalValue(data.finalStock),
      },
    ],
    bankAccounts: asRecordArray(data.bankAccounts).map(bank => ({
      id: stringValue(bank.id),
      nominalInitial: decimalValue(bank.nominalInitial),
      nominalFinal: decimalValue(bank.nominalFinal),
      tcInitial: decimalValue(bank.tcInitial, 1),
      tcFinal: decimalValue(bank.tcFinal, 1),
      interests: decimalValue(bank.interests),
    })),
    cashHoldings: asRecordArray(data.cashHoldings).map(cash => ({
      currency: stringValue(cash.currency, 'ARS'),
      nominalInitial: decimalValue(cash.nominalInitial),
      nominalFinal: decimalValue(cash.nominalFinal),
      tcFinal: decimalValue(cash.tcFinal, 1),
    })),
    receivables: asRecordArray(data.receivables).map(receivable => ({
      description: stringValue(receivable.description),
      type: receivableType(receivable.type),
      balanceInitial: decimalValue(receivable.balanceInitial),
      balanceFinal: decimalValue(receivable.balanceFinal),
    })),
    liabilities: asRecordArray(data.liabilities).map(liability => ({
      description: stringValue(liability.description),
      type: payableType(liability.type),
      balanceInitial: decimalValue(liability.balanceInitial),
      balanceFinal: decimalValue(liability.balanceFinal),
    })),
    withholdings: asRecordArray(data.withholdings).map(withholding => ({
      amount: decimalValue(withholding.amount),
      taxCode: taxCode(withholding.taxCode),
    })),
    generalDeductions: [
      {
        autonomos: decimalValue(generalDeductions.autonomos),
        servicioDomestico: decimalValue(generalDeductions.servicioDomestico),
        seguroVida: decimalValue(generalDeductions.seguroVida),
        seguroRetiro: decimalValue(generalDeductions.seguroRetiro),
        gastosSepelio: decimalValue(generalDeductions.gastosSepelio),
        interesesHipoteca: decimalValue(generalDeductions.interesesHipoteca),
        gastosEducativos: decimalValue(generalDeductions.gastosEducativos),
        alquilerCasaHabitacion: decimalValue(generalDeductions.alquilerCasaHabitacion),
        deduccionLocadorLocatario: decimalValue(generalDeductions.deduccionLocadorLocatario),
        donaciones: decimalValue(generalDeductions.donaciones),
        medicosAsistencial: decimalValue(generalDeductions.medicosAsistencial),
        honorariosMedicos: decimalValue(generalDeductions.honorariosMedicos),
      },
    ],
    personalDeductions: {
      tieneConyuge: booleanValue(personalDeductions.tieneConyuge),
      cantidadHijos: numberValue(personalDeductions.cantidadHijos),
      cantidadHijosIncapacitados: numberValue(personalDeductions.cantidadHijosIncapacitados),
      tipoDeduccionEspecial: personalDeductionType(personalDeductions.tipoDeduccionEspecial),
      esJubiladoOchoHaberes: booleanValue(personalDeductions.esJubiladoOchoHaberes),
    },
    personalAssets: asRecordArray(data.personalAssets).map(asset => ({
      description: stringValue(asset.description),
      type: stringValue(asset.type, 'Otros'),
      valueInitial: decimalValue(asset.valueInitial),
      valueFinal: decimalValue(asset.valueFinal),
    })),
    personalLiabilities: asRecordArray(data.personalLiabilities).map(liability => ({
      description: stringValue(liability.description),
      valueInitial: decimalValue(liability.valueInitial),
      valueFinal: decimalValue(liability.valueFinal),
    })),
    otherJustifications: asRecordArray(data.otherJustifications).map(justification => ({
      concept: stringValue(justification.concept),
      column: patrimonialColumn(justification.column),
      amount: decimalValue(justification.amount),
    })),
    axiStatic: {
      activoTotalInicio: decimalValue(data.activoTotalInicio),
      bienesNoComputablesInicio: decimalValue(data.bienesNoComputablesInicio),
      pasivoTotalInicio: decimalValue(data.pasivoTotalInicio),
    },
    axiDynamic: asRecordArray(data.axiDynamic).map(item => ({
      concept: stringValue(item.concept),
      type: axiDynamicType(item.type),
      amount: decimalValue(item.amount),
      date: dateValue(item.date),
    })),
    saldoAFavorAnterior: decimalValue(data.saldoAFavorAnterior),
    quebrantosAnteriores: decimalValue(data.quebrantosAnteriores),
  };
}
