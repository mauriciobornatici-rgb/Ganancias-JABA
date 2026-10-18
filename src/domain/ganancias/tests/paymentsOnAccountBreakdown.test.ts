import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  buildPaymentsOnAccountBreakdown,
  buildTaxBalanceCreditBreakdown,
  reconcileTaxBalance,
  sumPaymentsOnAccountBreakdown,
} from '../presentation/paymentsOnAccountBreakdown';

const D = (v: string) => new Decimal(v);

const base = {
  anticiposCanceladosIdcb: D('0'),
  anticiposCanceladosEfectivo: D('0'),
  anticiposCanceladosMisFacilidades: D('0'),
  computoIdcb: D('0'),
  computoCombustibles: D('0'),
  retencionesYPercepciones: D('0'),
  saldoTrasladableIdcb: D('0'),
  saldoAFavorAnterior: D('0'),
  impuestoDeterminado: D('0'),
  impuestoAPagarOARCA: D('0'),
};

describe('buildPaymentsOnAccountBreakdown', () => {
  it('sin pagos a cuenta no devuelve filas', () => {
    expect(buildPaymentsOnAccountBreakdown(base)).toEqual([]);
    expect(buildPaymentsOnAccountBreakdown(null)).toEqual([]);
  });

  it('muestra el impuesto al cheque computable con su referencia', () => {
    const rows = buildPaymentsOnAccountBreakdown({ ...base, computoIdcb: D('33000') });
    expect(rows).toHaveLength(1);
    expect(rows[0].reference).toBe('IG 25!F62+F65');
    expect(rows[0].amount.toFixed(2)).toBe('33000.00');
  });

  it('descuenta del IDCB el excedente no computable (F70)', () => {
    const rows = buildPaymentsOnAccountBreakdown({
      ...base,
      computoIdcb: D('50000'),
      anticiposCanceladosIdcb: D('10000'),
      saldoTrasladableIdcb: D('20000'),
    });
    // 50.000 + 10.000 - 20.000 trasladables = 40.000 computables.
    expect(rows[0].amount.toFixed(2)).toBe('40000.00');
  });

  it('nunca informa un computable negativo', () => {
    const rows = buildPaymentsOnAccountBreakdown({
      ...base,
      computoIdcb: D('10000'),
      saldoTrasladableIdcb: D('15000'),
    });
    expect(rows).toEqual([]);
  });

  it('lista anticipos y combustibles en el orden de la planilla', () => {
    const rows = buildPaymentsOnAccountBreakdown({
      ...base,
      computoIdcb: D('1000'),
      anticiposCanceladosEfectivo: D('2000'),
      anticiposCanceladosMisFacilidades: D('3000'),
      computoCombustibles: D('4000'),
    });
    expect(rows.map(row => row.reference)).toEqual([
      'IG 25!F62+F65',
      'IG 25!F63',
      'IG 25!F64',
      'IG 25!F66',
    ]);
    expect(sumPaymentsOnAccountBreakdown(rows).toFixed(2)).toBe('10000.00');
  });

  it('las retenciones NO entran en el desglose (se muestran por separado)', () => {
    const rows = buildPaymentsOnAccountBreakdown({ ...base, retencionesYPercepciones: D('188368') });
    expect(rows).toEqual([]);
  });

  it('compone todos los creditos F61:F67 desde una unica fuente', () => {
    const rows = buildTaxBalanceCreditBreakdown({
      ...base,
      retencionesYPercepciones: D('100000'),
      computoIdcb: D('50000'),
      anticiposCanceladosIdcb: D('10000'),
      saldoTrasladableIdcb: D('20000'),
      anticiposCanceladosEfectivo: D('30000'),
      anticiposCanceladosMisFacilidades: D('5000'),
      computoCombustibles: D('4000'),
      saldoAFavorAnterior: D('6000'),
    });

    expect(rows.map(row => row.reference)).toEqual([
      'IG 25!F67',
      'IG 25!F62+F65',
      'IG 25!F63',
      'IG 25!F64',
      'IG 25!F66',
      'IG 25!F61',
    ]);
    expect(sumPaymentsOnAccountBreakdown(rows).toFixed(2)).toBe('185000.00');
  });

  it('reconcilia la ecuacion completa que consumen pantalla, papel y Excel', () => {
    const reconciliation = reconcileTaxBalance({
      ...base,
      impuestoDeterminado: D('350000'),
      retencionesYPercepciones: D('100000'),
      computoIdcb: D('33000'),
      anticiposCanceladosEfectivo: D('50000'),
      anticiposCanceladosMisFacilidades: D('20000'),
      computoCombustibles: D('10000'),
      saldoAFavorAnterior: D('30000'),
      impuestoAPagarOARCA: D('107000'),
    });

    expect(reconciliation.totalCredits.toFixed(2)).toBe('243000.00');
    expect(reconciliation.calculatedBalance.toFixed(2)).toBe('107000.00');
    expect(reconciliation.difference.toFixed(2)).toBe('0.00');
    expect(reconciliation.isBalanced).toBe(true);
  });

  it('detecta un saldo informado que no cierra con sus componentes', () => {
    const reconciliation = reconcileTaxBalance({
      ...base,
      impuestoDeterminado: D('350000'),
      retencionesYPercepciones: D('100000'),
      impuestoAPagarOARCA: D('249999'),
    });

    expect(reconciliation.isBalanced).toBe(false);
    expect(reconciliation.difference.toFixed(2)).toBe('1.00');
  });
});
