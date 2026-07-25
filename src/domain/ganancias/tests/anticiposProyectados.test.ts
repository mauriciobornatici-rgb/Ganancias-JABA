import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { TaxReturnCalculationInput, UpdateIndexValue } from '../types';
import { calculateTaxReturn } from '../calculations/determinacionImpuesto';

/**
 * P29 - Proyeccion de anticipos segun hoja "Anticipos" del Excel y RG 5211:
 * - Coeficiente Anticipos!D5 = IPC diciembre / IPC julio (la planilla usa 10121.3715 / 8855.56813 = 1,142939).
 * - Cuota (E24) = (Impuesto proyectado - Retenciones actualizadas - ITC actualizado) / 5.
 * - Si la cuota no supera $5.000, no corresponde ingresar anticipos.
 */
function buildInput(options: {
  ventas: Decimal;
  retenciones?: Decimal;
  combustibles?: Decimal;
  indicesIPC?: UpdateIndexValue[];
}): TaxReturnCalculationInput {
  const withholdings = [];
  if (options.retenciones) withholdings.push({ amount: options.retenciones, taxCode: 'Ganancias' as const });
  if (options.combustibles) withholdings.push({ amount: options.combustibles, taxCode: 'Combustibles' as const });

  return {
    clientName: 'Caso Anticipos',
    cuit: '20-22222222-2',
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
      indicesIPC: options.indicesIPC ?? [],
    },
    sales: [{ date: new Date('2025-06-15'), netAmount: options.ventas, isExempt: false }],
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
  };
}

// Indices con julio y diciembre reales de la planilla 2025
const indicesPlanilla: UpdateIndexValue[] = [
  { monthIndex: 7, ipcValue: new Decimal('8855.56813') },
  { monthIndex: 12, ipcValue: new Decimal('10121.3715') },
];

describe('P29 - Anticipos proyectados (hoja Anticipos / RG 5211)', () => {
  it('usa el coeficiente IPC julio -> diciembre de la planilla (Anticipos!D5 = 1,142939)', () => {
    const result = calculateTaxReturn(buildInput({
      ventas: new Decimal(1000000),
      indicesIPC: indicesPlanilla,
    }));

    const coef = new Decimal('1.142939'); // ROUND(10121.3715/8855.56813, 6)
    // Base E5 = 1.000.000 * coef; impuesto proyectado E20 = 35% de la base (escala de un tramo)
    const impuestoProyectadoEsperado = new Decimal(1000000).mul(coef).mul('0.35')
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    expect(result.impuestoProyectadoAnticipos.toNumber()).toBe(impuestoProyectadoEsperado.toNumber());
  });

  it('actualiza por IPC las retenciones y el ITC antes de calcular la cuota', () => {
    const retenciones = new Decimal(100000);
    const combustibles = new Decimal(10000);
    const result = calculateTaxReturn(buildInput({
      ventas: new Decimal(1000000),
      retenciones,
      combustibles,
      indicesIPC: indicesPlanilla,
    }));

    const cuotaEsperada = result.impuestoProyectadoAnticipos
      .sub(retenciones.mul('1.142939'))
      .sub(combustibles.mul('1.142939'))
      .div(5)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

    expect(result.anticiposSiguientePeriodo).toHaveLength(5);
    result.anticiposSiguientePeriodo.forEach(cuota => {
      expect(cuota.toNumber()).toBe(cuotaEsperada.toNumber());
    });
  });

  it('no genera anticipos cuando las retenciones actualizadas absorben el impuesto proyectado', () => {
    const result = calculateTaxReturn(buildInput({
      ventas: new Decimal(1000000),
      retenciones: new Decimal(350000),
      indicesIPC: indicesPlanilla,
    }));

    expect(result.anticiposSiguientePeriodo).toHaveLength(0);
  });

  it('no proyecta anticipos si la cuota no supera $5.000 (Anticipos!E24)', () => {
    // Impuesto chico: ventas 70.000 -> impuesto 24.500 -> cuota 4.900 <= 5.000
    const result = calculateTaxReturn(buildInput({
      ventas: new Decimal(70000),
      indicesIPC: [],
    }));

    expect(result.anticiposSiguientePeriodo).toHaveLength(0);
    expect(result.warnings.some(w => w.includes('No se deberan ingresar anticipos'))).toBe(true);
  });

  it('no proyecta anticipos cuando las retenciones superan el impuesto proyectado', () => {
    const result = calculateTaxReturn(buildInput({
      ventas: new Decimal(1000000),
      retenciones: new Decimal(500000), // > impuesto proyectado 350.000 (sin coef)
      indicesIPC: [],
    }));

    expect(result.anticiposSiguientePeriodo).toHaveLength(0);
  });

  it('advierte cuando faltan indices de julio/diciembre y proyecta sin actualizar', () => {
    const result = calculateTaxReturn(buildInput({
      ventas: new Decimal(1000000),
      indicesIPC: [],
    }));

    // Sin coeficiente: impuesto proyectado = impuesto determinado = 350.000
    expect(result.impuestoProyectadoAnticipos.toNumber()).toBe(350000);
    expect(result.warnings.some(w => w.includes('Anticipos!D5') || w.includes('julio'))).toBe(true);
  });
});
