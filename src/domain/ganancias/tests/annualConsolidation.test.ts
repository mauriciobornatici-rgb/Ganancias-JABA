import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import {
  consolidateAnnualFiscalLedger,
  selectCotejadoPeriodsForAnnual,
  type GainsAllocationKind,
  type PeriodAllocation,
  type PeriodConsolidationInput,
} from '../fiscalLedger/annualConsolidation';

describe('selectCotejadoPeriodsForAnnual — solo meses cotejados alimentan Ganancias', () => {
  it('con los 12 meses CLOSED, el año puede consolidarse', () => {
    const periods = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, vatStatus: 'CLOSED' as const }));
    const gate = selectCotejadoPeriodsForAnnual(periods);
    expect(gate.canConsolidateYear).toBe(true);
    expect(gate.usableMonths).toHaveLength(12);
    expect(gate.blockedMonths).toHaveLength(0);
    expect(gate.warnings).toHaveLength(0);
  });

  it('un mes en borrador y otro faltante quedan bloqueados con motivo', () => {
    const periods = [
      { month: 1, vatStatus: 'CLOSED' as const },
      { month: 2, vatStatus: 'DRAFT' as const },
      // mes 3 ausente
      ...Array.from({ length: 9 }, (_, i) => ({ month: i + 4, vatStatus: 'CLOSED' as const })),
    ];
    const gate = selectCotejadoPeriodsForAnnual(periods);
    expect(gate.canConsolidateYear).toBe(false);
    expect(gate.usableMonths).not.toContain(2);
    expect(gate.usableMonths).not.toContain(3);
    expect(gate.blockedMonths.find(b => b.month === 2)?.reason).toMatch(/cotejar/i);
    expect(gate.blockedMonths.find(b => b.month === 3)?.reason).toMatch(/Sin liquidación/i);
  });

  it('IN_REVIEW (cotejo con diferencias) no es usable', () => {
    const periods = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, vatStatus: i === 5 ? ('IN_REVIEW' as const) : ('CLOSED' as const) }));
    const gate = selectCotejadoPeriodsForAnnual(periods);
    expect(gate.usableMonths).not.toContain(6);
    expect(gate.canConsolidateYear).toBe(false);
  });
});

const D = (v: string | number) => new Decimal(v);
const alloc = (gainsKind: GainsAllocationKind, amount: string | number): PeriodAllocation => ({ gainsKind, allocatedNetAmount: D(amount) });

function monthsFull(extra: PeriodConsolidationInput[] = []): PeriodConsolidationInput[] {
  // 12 meses minimos para no disparar el warning de faltantes
  const base: PeriodConsolidationInput[] = Array.from({ length: 12 }, (_, i) => ({
    fiscalPeriodId: `p${i + 1}`,
    month: i + 1,
    allocations: [],
  }));
  return [...base, ...extra];
}

describe('consolidateAnnualFiscalLedger', () => {
  it('agrega netos por categoría de Ganancias en un mes', () => {
    const r = consolidateAnnualFiscalLedger([
      {
        fiscalPeriodId: 'p1',
        month: 1,
        allocations: [
          alloc('SALE_TAXED', '100000'),
          alloc('SALE_EXEMPT', '5000'),
          alloc('INVENTORY_PURCHASE', '40000'),
          alloc('DEDUCTIBLE_EXPENSE', '12000'),
          alloc('FIXED_ASSET', '8000'),
          alloc('NON_DEDUCTIBLE', '1500'),
          alloc('VAT_NON_COMPUTABLE', '630'),
        ],
        grossIncomeTax: D('3000'),
      },
    ]);
    expect(r.totals.salesNet.toString()).toBe('100000');
    expect(r.totals.salesExempt.toString()).toBe('5000');
    expect(r.totals.inventoryPurchases.toString()).toBe('40000');
    expect(r.totals.deductibleExpenses.toString()).toBe('12000');
    expect(r.totals.fixedAssetPurchases.toString()).toBe('8000');
    expect(r.totals.nonDeductibleExpenses.toString()).toBe('1500');
    expect(r.totals.vatNonComputable.toString()).toBe('630');
    expect(r.totals.grossIncomeTax.toString()).toBe('3000');
  });

  it('suma los 12 meses', () => {
    const periods = monthsFull().map(p => ({
      ...p,
      allocations: [alloc('SALE_TAXED', '10000'), alloc('INVENTORY_PURCHASE', '4000')],
      grossIncomeTax: D('500'),
    }));
    const r = consolidateAnnualFiscalLedger(periods);
    expect(r.totals.salesNet.toString()).toBe('120000'); // 10.000 × 12
    expect(r.totals.inventoryPurchases.toString()).toBe('48000');
    expect(r.totals.grossIncomeTax.toString()).toBe('6000');
    expect(r.warnings).toHaveLength(0);
  });

  it('avisa si faltan meses para consolidar el año', () => {
    const r = consolidateAnnualFiscalLedger([
      { fiscalPeriodId: 'p1', month: 1, allocations: [alloc('SALE_TAXED', '1000')] },
      { fiscalPeriodId: 'p2', month: 2, allocations: [alloc('SALE_TAXED', '1000')] },
    ]);
    expect(r.warnings.some(w => w.includes('Faltan períodos'))).toBe(true);
  });

  it('avisa si un mes está repetido', () => {
    const r = consolidateAnnualFiscalLedger([
      ...monthsFull(),
      { fiscalPeriodId: 'p1bis', month: 1, allocations: [] },
    ]);
    expect(r.warnings.some(w => w.includes('repetido'))).toBe(true);
  });

  it('avisa cuando hay imputaciones OTHER sin categoría', () => {
    const r = consolidateAnnualFiscalLedger(
      monthsFull().map((p, i) => (i === 0 ? { ...p, allocations: [alloc('OTHER', '999')] } : p)),
    );
    expect(r.warnings.some(w => w.includes('OTHER'))).toBe(true);
    // OTHER no entra en ninguna categoría
    expect(r.totals.salesNet.toString()).toBe('0');
    expect(r.totals.deductibleExpenses.toString()).toBe('0');
  });

  it('el sourceHash cambia si cambia la base', () => {
    const a = consolidateAnnualFiscalLedger([
      { fiscalPeriodId: 'p1', month: 1, allocations: [alloc('SALE_TAXED', '1000')] },
    ]);
    const b = consolidateAnnualFiscalLedger([
      { fiscalPeriodId: 'p1', month: 1, allocations: [alloc('SALE_TAXED', '1001')] },
    ]);
    expect(a.sourceHash).not.toBe(b.sourceHash);
  });

  it('el sourceHash es estable ante el mismo input', () => {
    const input = [{ fiscalPeriodId: 'p1', month: 1, allocations: [alloc('SALE_TAXED', '1000')] }];
    expect(consolidateAnnualFiscalLedger(input).sourceHash).toBe(consolidateAnnualFiscalLedger(input).sourceHash);
  });
});
