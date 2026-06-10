import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { TaxReturnCalculationInput, PersonalDeductionsInput, TaxParameters } from '../types';
import { calculateTaxReturn } from '../calculations/determinacionImpuesto';

/**
 * P29 - Quebranto trasladable (IG 25 F38/G38), doceava parte (F50)
 * y deduccion especifica de jubilados parametrizable (E53).
 */
function buildParams(overrides: Partial<TaxParameters> = {}): TaxParameters {
  return {
    year: 2025,
    deduccionesArt30: {
      minimoNoImponible: new Decimal(4507505.52),
      conyuge: new Decimal(4245166.13),
      hijo: new Decimal(2140852.77),
      hijoIncapacitado: new Decimal(4281705.53),
      especialAutonomo: new Decimal(15776269.32),
      especialEmprendedor: new Decimal(18030022.08),
      especialDependiente: new Decimal(21636026.50),
    },
    topesDeduccionesGenerales: {
      topeServicioDomestico: new Decimal(0),
      topeSeguroVida: new Decimal(0),
      topeSeguroRetiro: new Decimal(0),
      topeGastosSepelio: new Decimal(0),
      topeInteresHipoteca: new Decimal(0),
      topeGastosEducativos: new Decimal(0),
    },
    escalaArt94: [
      { fromAmount: new Decimal(0), toAmount: null, fixedAmount: new Decimal(0), percentage: new Decimal(0.35), excessOf: new Decimal(0) },
    ],
    indicesIPC: [],
    ...overrides,
  };
}

function buildInput(options: {
  ventas: Decimal;
  quebrantosAnteriores?: Decimal;
  personalDeductions?: PersonalDeductionsInput;
  params?: TaxParameters;
}): TaxReturnCalculationInput {
  return {
    clientName: 'Caso Quebrantos y Personales',
    cuit: '20-33333333-3',
    fiscalYear: 2025,
    params: options.params ?? buildParams(),
    sales: [{ date: new Date('2025-06-15'), netAmount: options.ventas, isExempt: false }],
    purchases: [],
    fixedAssets: [],
    inventories: [],
    bankAccounts: [],
    cashHoldings: [],
    receivables: [],
    liabilities: [],
    withholdings: [],
    generalDeductions: [],
    personalDeductions: options.personalDeductions ?? {
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
    quebrantosAnteriores: options.quebrantosAnteriores,
  };
}

describe('P29 - Quebranto trasladable (IG 25 F38)', () => {
  it('expone el quebranto cuando los quebrantos anteriores superan el resultado', () => {
    const result = calculateTaxReturn(buildInput({
      ventas: new Decimal(1000000),
      quebrantosAnteriores: new Decimal(1500000),
    }));

    // F38 = 1.000.000 - 1.500.000 = -500.000 -> quebranto trasladable
    expect(result.quebrantoTrasladable.toNumber()).toBe(500000);
    expect(result.resultadoImpositivoNeto.toNumber()).toBe(0);
    expect(result.gananciaNetaSujetaImpuesto.toNumber()).toBe(0);
    expect(result.impuestoDeterminado.toNumber()).toBe(0);
    expect(result.warnings.some(w => w.includes('Quebranto del ejercicio'))).toBe(true);
  });

  it('no informa quebranto cuando el resultado absorbe los quebrantos anteriores', () => {
    const result = calculateTaxReturn(buildInput({
      ventas: new Decimal(1000000),
      quebrantosAnteriores: new Decimal(400000),
    }));

    expect(result.quebrantoTrasladable.toNumber()).toBe(0);
    expect(result.resultadoImpositivoNeto.toNumber()).toBe(600000);
  });
});

describe('P29 - Doceava parte dependientes (IG 25 F50)', () => {
  it('adiciona (MNI + conyuge + hijos + especial dependiente) / 12 solo para dependientes', () => {
    const result = calculateTaxReturn(buildInput({
      ventas: new Decimal(50000000),
      personalDeductions: {
        tieneConyuge: true,
        cantidadHijos: 1,
        cantidadHijosIncapacitados: 0,
        tipoDeduccionEspecial: 'Dependiente',
      },
    }));

    const esperadoBase = new Decimal(4507505.52)   // MNI
      .add(4245166.13)                             // conyuge
      .add(2140852.77)                             // 1 hijo
      .add(21636026.50);                           // especial dependiente
    const doceavaEsperada = esperadoBase.div(12).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

    expect(result.deduccionesPersonales.deduccionEspecialDoceavaParte.toNumber()).toBe(doceavaEsperada.toNumber());
    expect(result.deduccionesPersonales.totalDeduccionesPersonalesAdmitidas.toNumber())
      .toBe(esperadoBase.add(esperadoBase.div(12)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber());
  });

  it('no aplica doceava parte a autonomos', () => {
    const result = calculateTaxReturn(buildInput({
      ventas: new Decimal(50000000),
      personalDeductions: {
        tieneConyuge: false,
        cantidadHijos: 0,
        cantidadHijosIncapacitados: 0,
        tipoDeduccionEspecial: 'Autonomo',
      },
    }));

    expect(result.deduccionesPersonales.deduccionEspecialDoceavaParte.toNumber()).toBe(0);
  });
});

describe('P29 - Deduccion especifica jubilados parametrizable (IG 25 E53)', () => {
  const jubilado: PersonalDeductionsInput = {
    tieneConyuge: false,
    cantidadHijos: 0,
    cantidadHijosIncapacitados: 0,
    tipoDeduccionEspecial: 'Ninguna',
    esJubiladoOchoHaberes: true,
  };

  it('usa el parametro normativo cuando esta cargado, sin warning de fallback', () => {
    const result = calculateTaxReturn(buildInput({
      ventas: new Decimal(50000000),
      personalDeductions: jubilado,
      params: buildParams({ deduccionEspecificaJubilados: new Decimal(25000000) }),
    }));

    expect(result.deduccionesPersonales.minimoNoImponible.toNumber()).toBe(25000000);
    expect(result.warnings.some(w => w.includes('deduccionEspecificaJubilados'))).toBe(false);
  });

  it('usa el fallback por anio con warning cuando no hay parametro', () => {
    const result = calculateTaxReturn(buildInput({
      ventas: new Decimal(50000000),
      personalDeductions: jubilado,
    }));

    expect(result.deduccionesPersonales.minimoNoImponible.toNumber()).toBe(24800000); // fallback 2025
    expect(result.warnings.some(w => w.includes('deduccionEspecificaJubilados'))).toBe(true);
  });
});
