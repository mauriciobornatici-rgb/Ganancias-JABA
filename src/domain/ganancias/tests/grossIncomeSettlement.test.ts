import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { calculateGrossIncomeSettlement } from '../fiscalLedger/grossIncomeSettlement';

const D = (v: string | number) => new Decimal(v);

describe('calculateGrossIncomeSettlement — liquidación mensual de IIBB', () => {
  it('régimen local: toda la base tributa en una jurisdicción', () => {
    const r = calculateGrossIncomeSettlement({
      regime: 'ARBA_LOCAL',
      taxableBase: D('1000000'),
      jurisdictions: [
        { jurisdictionCode: '902', taxRate: D('0.05') }, // 5% Buenos Aires
      ],
    });
    expect(r.jurisdictionLines).toHaveLength(1);
    expect(r.jurisdictionLines[0].assignedBase.toString()).toBe('1000000');
    expect(r.jurisdictionLines[0].determinedTax.toString()).toBe('50000'); // 1.000.000 × 5%
    expect(r.totalBalanceDue.toString()).toBe('50000');
    expect(r.warnings).toHaveLength(0);
  });

  it('local con dos actividades: reparte la base por monto y aplica cada alícuota (criterio 2026-07-20)', () => {
    // $1.000.000 gravado: $600.000 de actividad A (3,5%) + $400.000 de actividad B (5%).
    const r = calculateGrossIncomeSettlement({
      regime: 'ARBA_LOCAL',
      taxableBase: D('1000000'),
      jurisdictions: [
        { jurisdictionCode: '902', activityCode: 'A', taxRate: D('0.035'), assignedBaseOverride: D('600000') },
        { jurisdictionCode: '902', activityCode: 'B', taxRate: D('0.05'), assignedBaseOverride: D('400000') },
      ],
    });
    expect(r.jurisdictionLines).toHaveLength(2);
    expect(r.jurisdictionLines[0].assignedBase.toString()).toBe('600000');
    expect(r.jurisdictionLines[0].determinedTax.toString()).toBe('21000'); // 600.000 × 3,5%
    expect(r.jurisdictionLines[1].assignedBase.toString()).toBe('400000');
    expect(r.jurisdictionLines[1].determinedTax.toString()).toBe('20000'); // 400.000 × 5%
    expect(r.totalDeterminedTax.toString()).toBe('41000');
    // No debe aparecer el aviso de "más de una jurisdicción" (es la misma con dos actividades)
    expect(r.warnings).toHaveLength(0);
  });

  it('avisa si las bases por actividad no suman la base gravada del mes', () => {
    const r = calculateGrossIncomeSettlement({
      regime: 'ARBA_LOCAL',
      taxableBase: D('1000000'),
      jurisdictions: [
        { jurisdictionCode: '902', activityCode: 'A', taxRate: D('0.035'), assignedBaseOverride: D('600000') },
        { jurisdictionCode: '902', activityCode: 'B', taxRate: D('0.05'), assignedBaseOverride: D('300000') }, // falta 100.000
      ],
    });
    expect(r.warnings.some(w => w.includes('no coincide'))).toBe(true);
  });

  it('régimen local: percepciones/retenciones reducen el saldo a pagar', () => {
    const r = calculateGrossIncomeSettlement({
      regime: 'ARBA_LOCAL',
      taxableBase: D('1000000'),
      jurisdictions: [
        { jurisdictionCode: '902', taxRate: D('0.05'), credits: [{ amount: D('12000') }, { amount: D('8000') }] },
      ],
    });
    // impuesto 50.000 - 20.000 percep/ret = 30.000 a pagar
    expect(r.jurisdictionLines[0].determinedTax.toString()).toBe('50000');
    expect(r.totalCreditsApplied.toString()).toBe('20000');
    expect(r.totalBalanceDue.toString()).toBe('30000');
    expect(r.totalFavorCarryForward.toString()).toBe('0');
  });

  it('local: percepciones que exceden el impuesto generan saldo a favor que se arrastra', () => {
    const r = calculateGrossIncomeSettlement({
      regime: 'ARBA_LOCAL',
      taxableBase: D('1000000'),
      jurisdictions: [
        { jurisdictionCode: '902', taxRate: D('0.05'), credits: [{ amount: D('60000') }] },
      ],
    });
    expect(r.totalBalanceDue.toString()).toBe('0');
    expect(r.totalFavorCarryForward.toString()).toBe('10000'); // 60.000 - 50.000
  });

  it('local: saldo a favor anterior se suma a los créditos del período', () => {
    const r = calculateGrossIncomeSettlement({
      regime: 'ARBA_LOCAL',
      taxableBase: D('1000000'),
      jurisdictions: [
        { jurisdictionCode: '902', taxRate: D('0.05'), credits: [{ amount: D('20000') }], previousFavorBalance: D('15000') },
      ],
    });
    // impuesto 50.000 - (20.000 + 15.000) = 15.000 a pagar
    expect(r.totalBalanceDue.toString()).toBe('15000');
  });

  it('Convenio Multilateral: reparte la base por coeficiente y aplica alícuota por jurisdicción', () => {
    const r = calculateGrossIncomeSettlement({
      regime: 'CM_REGIMEN_GENERAL',
      taxableBase: D('1000000'),
      jurisdictions: [
        { jurisdictionCode: '902', taxRate: D('0.05'), coefficient: D('0.6') }, // Bs As 60%
        { jurisdictionCode: '901', taxRate: D('0.04'), coefficient: D('0.4') }, // CABA 40%
      ],
    });
    // Bs As: base 600.000 × 5% = 30.000 ; CABA: base 400.000 × 4% = 16.000
    expect(r.jurisdictionLines[0].assignedBase.toString()).toBe('600000');
    expect(r.jurisdictionLines[0].determinedTax.toString()).toBe('30000');
    expect(r.jurisdictionLines[1].assignedBase.toString()).toBe('400000');
    expect(r.jurisdictionLines[1].determinedTax.toString()).toBe('16000');
    expect(r.totalDeterminedTax.toString()).toBe('46000');
    expect(r.warnings).toHaveLength(0);
  });

  it('Convenio Multilateral: avisa si los coeficientes no suman 1', () => {
    const r = calculateGrossIncomeSettlement({
      regime: 'CM_REGIMEN_GENERAL',
      taxableBase: D('1000000'),
      jurisdictions: [
        { jurisdictionCode: '902', taxRate: D('0.05'), coefficient: D('0.6') },
        { jurisdictionCode: '901', taxRate: D('0.04'), coefficient: D('0.3') }, // suma 0.9
      ],
    });
    expect(r.warnings.some(w => w.includes('coeficientes suman'))).toBe(true);
  });

  it('Convenio Multilateral: percepciones se aplican por jurisdicción de forma independiente', () => {
    const r = calculateGrossIncomeSettlement({
      regime: 'CM_REGIMEN_GENERAL',
      taxableBase: D('1000000'),
      jurisdictions: [
        { jurisdictionCode: '902', taxRate: D('0.05'), coefficient: D('0.6'), credits: [{ amount: D('40000') }] }, // 30.000 imp, 40.000 cred -> 10.000 a favor
        { jurisdictionCode: '901', taxRate: D('0.04'), coefficient: D('0.4'), credits: [{ amount: D('5000') }] },  // 16.000 imp, 5.000 cred -> 11.000 a pagar
      ],
    });
    expect(r.jurisdictionLines[0].balanceDue.toString()).toBe('0');
    expect(r.jurisdictionLines[0].favorCarryForward.toString()).toBe('10000');
    expect(r.jurisdictionLines[1].balanceDue.toString()).toBe('11000');
    expect(r.totalBalanceDue.toString()).toBe('11000');
    expect(r.totalFavorCarryForward.toString()).toBe('10000');
  });

  it('régimen NONE no liquida IIBB', () => {
    const r = calculateGrossIncomeSettlement({
      regime: 'NONE',
      taxableBase: D('1000000'),
      jurisdictions: [{ jurisdictionCode: '902', taxRate: D('0.05') }],
    });
    expect(r.jurisdictionLines).toHaveLength(0);
    expect(r.totalDeterminedTax.toString()).toBe('0');
    expect(r.totalBalanceDue.toString()).toBe('0');
  });
});
