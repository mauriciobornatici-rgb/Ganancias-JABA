import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { TaxReturnCalculationInput, TaxWithholdingInput } from '../types';
import { calculateTaxReturn } from '../calculations/determinacionImpuesto';

/**
 * P29 - Pagos a cuenta segun IG 25 F61:F67, F68 y F70.
 * Escala de un solo tramo al 35% para que el impuesto determinado sea predecible:
 * ventas 1.000.000, sin deducciones -> impuesto = 350.000.
 */
function buildInput(withholdings: TaxWithholdingInput[], saldoAFavorAnterior = new Decimal(0)): TaxReturnCalculationInput {
  return {
    clientName: 'Caso Pagos a Cuenta',
    cuit: '20-11111111-1',
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
      escalaArt94: [
        { fromAmount: new Decimal(0), toAmount: null, fixedAmount: new Decimal(0), percentage: new Decimal(0.35), excessOf: new Decimal(0) },
      ],
      indicesIPC: [],
    },
    sales: [{ date: new Date('2025-06-15'), netAmount: new Decimal(1000000), isExempt: false }],
    purchases: [],
    fixedAssets: [],
    inventories: [],
    bankAccounts: [],
    cashHoldings: [],
    receivables: [],
    liabilities: [],
    withholdings,
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
    saldoAFavorAnterior,
  };
}

describe('P29 - Pagos a cuenta IG 25 (F61:F67, F68, F70)', () => {
  it('computa retenciones de Ganancias (F67) y excluye codigo "Otros" con advertencia', () => {
    const result = calculateTaxReturn(buildInput([
      { amount: new Decimal(100000), taxCode: 'Ganancias' },
      { amount: new Decimal(50000), taxCode: 'Otros' },
    ]));

    expect(result.impuestoDeterminado.toNumber()).toBe(350000);
    expect(result.retencionesYPercepciones.toNumber()).toBe(100000);
    // F68 = 350.000 - 100.000; los 50.000 de "Otros" NO computan
    expect(result.impuestoAPagarOARCA.toNumber()).toBe(250000);
    expect(result.warnings.some(w => w.includes('"Otros"'))).toBe(true);
  });

  it('computa anticipos cancelados (F62/F63/F64) y combustibles (F66)', () => {
    const result = calculateTaxReturn(buildInput([
      { amount: new Decimal(100000), taxCode: 'Ganancias' },          // F67
      { amount: new Decimal(50000), taxCode: 'AnticipoEfectivo' },    // F63
      { amount: new Decimal(20000), taxCode: 'AnticipoMisFacilidades' }, // F64
      { amount: new Decimal(10000), taxCode: 'Combustibles' },        // F66
    ]));

    expect(result.anticiposCanceladosEfectivo.toNumber()).toBe(50000);
    expect(result.anticiposCanceladosMisFacilidades.toNumber()).toBe(20000);
    expect(result.computoCombustibles.toNumber()).toBe(10000);
    // F68 = 350.000 - 100.000 - 50.000 - 20.000 - 10.000 = 170.000
    expect(result.impuestoAPagarOARCA.toNumber()).toBe(170000);
    expect(result.saldoTrasladableIdcb.toNumber()).toBe(0);
  });

  it('limita el IDCB al impuesto determinado y deja el excedente como saldo trasladable (F70)', () => {
    // IDCB 400.000 > impuesto 350.000: computa 350.000, traslada 50.000.
    // Retenciones 100.000 quedan como saldo de libre disponibilidad.
    const result = calculateTaxReturn(buildInput([
      { amount: new Decimal(400000), taxCode: 'IDCB' },
      { amount: new Decimal(100000), taxCode: 'Ganancias' },
    ]));

    expect(result.computoIdcb.toNumber()).toBe(400000);
    expect(result.saldoTrasladableIdcb.toNumber()).toBe(50000);
    // F68 = 350.000 - 350.000 - 100.000 = -100.000 (saldo a favor del contribuyente)
    expect(result.impuestoAPagarOARCA.toNumber()).toBe(-100000);
    expect(result.warnings.some(w => w.includes('F70'))).toBe(true);
  });

  it('los anticipos cancelados con IDCB (F62) comparten el tope del impuesto determinado', () => {
    const result = calculateTaxReturn(buildInput([
      { amount: new Decimal(200000), taxCode: 'IDCB' },          // F65
      { amount: new Decimal(200000), taxCode: 'AnticipoIDCB' },  // F62
    ]));

    // IDCB total 400.000 > impuesto 350.000 -> trasladable 50.000, saldo final 0
    expect(result.anticiposCanceladosIdcb.toNumber()).toBe(200000);
    expect(result.saldoTrasladableIdcb.toNumber()).toBe(50000);
    expect(result.impuestoAPagarOARCA.toNumber()).toBe(0);
  });

  it('resta el saldo a favor del periodo anterior (F61)', () => {
    const result = calculateTaxReturn(buildInput(
      [{ amount: new Decimal(100000), taxCode: 'Ganancias' }],
      new Decimal(30000)
    ));

    // F68 = 350.000 - 30.000 - 100.000 = 220.000
    expect(result.impuestoAPagarOARCA.toNumber()).toBe(220000);
  });
});
