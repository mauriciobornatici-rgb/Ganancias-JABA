import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import type { TaxParameters, TaxReturnCalculationInput } from '../types';
import { calculateTaxReturn } from '../calculations/determinacionImpuesto';

function zeroTaxParameters(): TaxParameters {
  return {
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
      { monthIndex: 1, ipcValue: new Decimal(7864.1257) },
      { monthIndex: 12, ipcValue: new Decimal(10121.3715) },
    ],
  };
}

function minimalInput(params: TaxParameters): TaxReturnCalculationInput {
  return {
    clientName: 'Cliente AXI',
    cuit: '20-33333333-3',
    fiscalYear: 2025,
    params,
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
      activoTotalInicio: new Decimal(1_000_000),
      bienesNoComputablesInicio: new Decimal(0),
      pasivoTotalInicio: new Decimal(0),
    },
    axiDynamic: [],
  };
}

describe('AXI static inflation rate', () => {
  it('usa el coeficiente dic-anterior a dic-actual importado desde indices utiles', () => {
    const params = {
      ...zeroTaxParameters(),
      usefulCoefficients: {
        decPreviousToDecCurrent: new Decimal(1.3154876051264572),
      },
    } as TaxParameters;

    const result = calculateTaxReturn(minimalInput(params));

    expect(result.axiStaticResult.toNumber()).toBe(-315488);
  });
});
