import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import type { TaxReturnCalculationInput } from '../types';
import { calculateTaxReturn } from '../calculations/determinacionImpuesto';

function zeroTaxParameters() {
  return {
    year: 2024,
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
      { monthIndex: 1, ipcValue: new Decimal('100') },
      { monthIndex: 12, ipcValue: new Decimal('217.763') },
    ],
    usefulCoefficients: {
      decPreviousToDecCurrent: new Decimal('2.177634221285926652676600022'),
    },
  };
}

describe('Simulacion con capturas actuales del usuario', () => {
  it('replica CMV, resultado, patrimonio y JVP de las capturas del 06-06-2026', () => {
    const input: TaxReturnCalculationInput = {
      clientName: 'Capturas usuario 2024',
      cuit: '20-12345678-9',
      fiscalYear: 2024,
      params: zeroTaxParameters(),
      sales: [
        { date: new Date('2024-12-31'), netAmount: new Decimal('55188790.74'), isExempt: false },
      ],
      purchases: [
        { date: new Date('2024-12-31'), netAmount: new Decimal('55516958.16'), isDeductible: true, isExempt: false, expenseType: 'MateriaPrima' },
        { date: new Date('2024-12-31'), netAmount: new Decimal('1265940.70'), isDeductible: true, isExempt: false, expenseType: 'GastosGenerales' },
        { date: new Date('2024-12-31'), netAmount: new Decimal('656834.40'), isDeductible: true, isExempt: false, expenseType: 'GastosGenerales' },
      ],
      fixedAssets: [],
      inventories: [
        { concept: 'Bienes de Cambio', initialStock: new Decimal('155496.41'), finalStock: new Decimal('7856322.00') },
      ],
      bankAccounts: [
        {
          id: 'Disponibilidades-Bancos',
          nominalInitial: new Decimal('580157.00'),
          nominalFinal: new Decimal('1416741.00'),
          tcInitial: new Decimal(1),
          tcFinal: new Decimal(1),
          interests: new Decimal(0),
        },
      ],
      cashHoldings: [],
      receivables: [
        { description: 'Creditos comerciales', type: 'Comercial', balanceInitial: new Decimal('825842.83'), balanceFinal: new Decimal('299858.95') },
        { description: 'Creditos fiscales', type: 'Fiscal', balanceInitial: new Decimal('195527.81'), balanceFinal: new Decimal('533667.49') },
      ],
      liabilities: [
        { description: 'Deudas comerciales y fiscales', type: 'Proveedores', balanceInitial: new Decimal('1565731.18'), balanceFinal: new Decimal('2950866.99') },
      ],
      withholdings: [],
      generalDeductions: [{
        autonomos: new Decimal(0),
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
      }],
      personalDeductions: {
        tieneConyuge: false,
        cantidadHijos: 0,
        cantidadHijosIncapacitados: 0,
        tipoDeduccionEspecial: 'Ninguna',
      },
      personalAssets: [
        { description: 'Depositos bancarios', type: 'Depositos Bancarios', valueInitial: new Decimal('771902.84'), valueFinal: new Decimal('380000.00') },
        { description: 'Efectivo', type: 'Efectivo', valueInitial: new Decimal('795000.00'), valueFinal: new Decimal('0.00') },
      ],
      personalLiabilities: [
        { description: 'Deudas personales', valueInitial: new Decimal('6278512.29'), valueFinal: new Decimal('14686238.56') },
      ],
      otherJustifications: [
        { concept: 'Intereses prestamo', column: 1, amount: new Decimal('956882.98') },
        { concept: 'Impuesto determinado anio anterior', column: 1, amount: new Decimal('392146.90') },
        { concept: 'Blanqueo', column: 2, amount: new Decimal('3300000.00') },
      ],
      axiStatic: {
        activoTotalInicio: new Decimal('1757024.05'),
        bienesNoComputablesInicio: new Decimal('0.00'),
        pasivoTotalInicio: new Decimal('1565731.18'),
      },
      axiDynamic: [],
    };

    const result = calculateTaxReturn(input);

    expect(result.ventasGravadas.toNumber()).toBe(55188791);
    expect(result.costoVentas.toNumber()).toBe(47816133);
    expect(result.gastosDeducibles.toNumber()).toBe(1922775);
    expect(result.amortizacionesBienesDeUso.toNumber()).toBe(0);
    expect(result.resultadoAjustePorInflacion.toNumber()).toBe(-225273);
    expect(result.resultadoComercialNeto.toNumber()).toBe(5224610);
    expect(result.resultadoImpositivoNeto.toNumber()).toBe(5224610);

    expect(result.patrimonioInicioTotal.toNumber()).toBe(-4520317);
    expect(result.patrimonioCierreTotal.toNumber()).toBe(-7150516);
    expect(result.consumoDiferencial.toNumber()).toBe(10031053);
    expect(result.jvpTotalColumnaI.toNumber()).toBe(4229566);
    expect(result.jvpTotalColumnaII.toNumber()).toBe(4229566);
    expect(result.jvpJustificationDiff.toNumber()).toBe(0);
  });
});
