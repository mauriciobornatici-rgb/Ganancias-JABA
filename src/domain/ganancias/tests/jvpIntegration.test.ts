import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import type { TaxReturnCalculationInput } from '../types';
import { calculateTaxReturn } from '../calculations/determinacionImpuesto';

function baseInput(): TaxReturnCalculationInput {
  return {
    clientName: 'Cliente JVP',
    cuit: '20-44444444-4',
    fiscalYear: 2025,
    params: {
      year: 2025,
      deduccionesArt30: {
        minimoNoImponible: new Decimal(0),
        conyuge: new Decimal(0),
        hijo: new Decimal(0),
        hijoIncapacitado: new Decimal(0),
        especialAutonomo: new Decimal(0),
        especialEmprendedor: new Decimal(0),
        especialDependiente: new Decimal(0),
      },
      topesDeduccionesGenerales: {
        topeServicioDomestico: new Decimal(0),
        topeSeguroVida: new Decimal(0),
        topeSeguroRetiro: new Decimal(0),
        topeGastosSepelio: new Decimal(0),
        topeInteresHipoteca: new Decimal(0),
        topeGastosEducativos: new Decimal(0),
      },
      escalaArt94: [],
      indicesIPC: [
        { monthIndex: 1, ipcValue: new Decimal(100) },
        { monthIndex: 12, ipcValue: new Decimal(100) },
      ],
    },
    sales: [],
    purchases: [],
    fixedAssets: [],
    inventories: [],
    bankAccounts: [],
    cashHoldings: [],
    receivables: [],
    liabilities: [],
    withholdings: [],
    generalDeductions: [],
    personalDeductions: {
      tieneConyuge: false,
      cantidadHijos: 0,
      cantidadHijosIncapacitados: 0,
      tipoDeduccionEspecial: 'Ninguna',
    },
    personalAssets: [],
    personalLiabilities: [],
    otherJustifications: [],
    axiStatic: {
      activoTotalInicio: new Decimal(0),
      bienesNoComputablesInicio: new Decimal(0),
      pasivoTotalInicio: new Decimal(0),
    },
    axiDynamic: [],
  };
}

describe('JVP integration in calculateTaxReturn', () => {
  it('propaga advertencia de consumo nulo desde la auditoria patrimonial', () => {
    const result = calculateTaxReturn(baseInput());

    expect(result.consumoDiferencial.toNumber()).toBe(0);
    expect(result.warnings.some((warning) => warning.includes('Consumo Nulo'))).toBe(true);
  });

  it('usa el resultado impositivo neto de IG 25 para justificar recursos en JVP', () => {
    const input = baseInput();
    input.sales = [{ date: new Date('2025-01-01'), netAmount: new Decimal(1000), isExempt: false }];
    input.generalDeductions = [{
      autonomos: new Decimal(200),
      servicioDomestico: new Decimal(0),
      seguroVida: new Decimal(0),
      seguroRetiro: new Decimal(0),
      gastosSepelio: new Decimal(0),
      interesesHipoteca: new Decimal(0),
      gastosEducativos: new Decimal(0),
      alquilerCasaHabitacion: new Decimal(0),
      deduccionLocadorLocatario: new Decimal(0),
      donaciones: new Decimal(0),
      medicosAsistencial: new Decimal(0),
      honorariosMedicos: new Decimal(0),
    }];

    const result = calculateTaxReturn(input);

    expect(result.resultadoComercialNeto.toNumber()).toBe(1000);
    expect(result.resultadoImpositivoNeto.toNumber()).toBe(800);
    expect(result.consumoDiferencial.toNumber()).toBe(-200);
    expect(result.jvpTotalColumnaI.toNumber()).toBe(800);
    expect(result.jvpTotalColumnaII.toNumber()).toBe(800);
    expect(result.jvpJustificationDiff.toNumber()).toBe(0);
  });
});
