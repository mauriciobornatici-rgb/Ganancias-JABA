import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import type { SocietyParticipationInput, TaxReturnCalculationInput } from '../types';
import { calculateTaxReturn } from '../calculations/determinacionImpuesto';

/**
 * Punto 3 del PDF de correcciones (2026-07-24): el resultado atribuido por participación en
 * sociedades tiene que impactar el resultado neto de la determinación, no quedar solo informado.
 */
function buildInput(societyParticipations: SocietyParticipationInput[]): TaxReturnCalculationInput {
  return {
    clientName: 'Caso Participaciones',
    cuit: '20-34590216-4',
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
    withholdings: [],
    societyParticipations,
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

describe('Punto 3 - participacion en sociedades en la determinacion', () => {
  it('suma el resultado atribuido al neto de todas las categorias', () => {
    const result = calculateTaxReturn(buildInput([
      { cuit: '30-71234567-8', denomination: 'Sociedad A', participationPercent: new Decimal(50), societyResult: new Decimal(600000) },
    ]));

    expect(result.resultadoComercialNeto.toNumber()).toBe(1000000);
    expect(result.resultadoParticipacionSociedades.toNumber()).toBe(300000);
    expect(result.resultadoNetoTodasCategorias.toNumber()).toBe(1300000);
    // El impuesto se determina sobre el neto con la participación incluida (35% de un solo tramo).
    expect(result.impuestoDeterminado.toNumber()).toBe(455000);
  });

  it('un quebranto de la sociedad resta del neto', () => {
    const result = calculateTaxReturn(buildInput([
      { cuit: '30-71234567-8', denomination: 'Sociedad con quebranto', participationPercent: new Decimal(40), societyResult: new Decimal(-500000) },
    ]));

    expect(result.resultadoParticipacionSociedades.toNumber()).toBe(-200000);
    expect(result.resultadoNetoTodasCategorias.toNumber()).toBe(800000);
  });

  it('sin participaciones el resultado no cambia y no agrega advertencias', () => {
    const sinParticipaciones = calculateTaxReturn(buildInput([]));
    expect(sinParticipaciones.resultadoParticipacionSociedades.toNumber()).toBe(0);
    expect(sinParticipaciones.resultadoNetoTodasCategorias.toNumber()).toBe(1000000);
    expect(sinParticipaciones.warnings.some(w => w.includes('Participación'))).toBe(false);
  });

  it('propaga a la determinacion el aviso de la verificacion cruzada', () => {
    const result = calculateTaxReturn(buildInput([
      {
        cuit: '30-71234567-8',
        denomination: 'Sociedad A',
        participationPercent: new Decimal(50),
        societyResult: new Decimal(600000),
        attributedResultOverride: new Decimal(250000),
      },
    ]));

    expect(result.resultadoParticipacionSociedades.toNumber()).toBe(250000);
    expect(result.resultadoNetoTodasCategorias.toNumber()).toBe(1250000);
    expect(result.warnings.some(w => w.includes('difiere'))).toBe(true);
  });
});
