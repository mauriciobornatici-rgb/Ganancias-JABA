import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import { GeneralDeductionsOutput } from '../types';
import { buildGeneralDeductionsBreakdown } from '../presentation/deductionsBreakdown';

function createDeductionsOutput(): GeneralDeductionsOutput {
  return {
    autonomosAdmitidos: new Decimal(120_000),
    servicioDomesticoTope: new Decimal(0),
    seguroVidaTope: new Decimal(10_000),
    seguroRetiroTope: new Decimal(0),
    gastosSepelioTope: new Decimal(0),
    interesesHipotecaTope: new Decimal(0),
    gastosEducativosTope: new Decimal(0),
    alquilerCasaHabitacionTope: new Decimal(0),
    locadorLocatarioTope: new Decimal(75_000),
    medicosAsistencialTope: new Decimal(30_000),
    honorariosMedicosTope: new Decimal(0),
    donacionesTope: new Decimal(5_000),
    totalDeduccionesGeneralesAdmitidas: new Decimal(240_000),
  };
}

describe('buildGeneralDeductionsBreakdown', () => {
  it('devuelve solo rubros admitidos con referencia IG 25 en orden de planilla', () => {
    const breakdown = buildGeneralDeductionsBreakdown(createDeductionsOutput());

    expect(breakdown.map(item => [item.label, item.reference, item.amount.toNumber()])).toEqual([
      ['Autonomos', 'IG 25!F20', 120_000],
      ['Seguro de vida', 'IG 25!F22', 10_000],
      ['Locador / locatario 10%', 'IG 25!F28', 75_000],
      ['Cuota medico asistencial', 'IG 25!F29', 30_000],
      ['Donaciones', 'IG 25!F31', 5_000],
    ]);
  });

  it('devuelve una lista vacia si no hay calculo de deducciones', () => {
    expect(buildGeneralDeductionsBreakdown(null)).toEqual([]);
  });
});
