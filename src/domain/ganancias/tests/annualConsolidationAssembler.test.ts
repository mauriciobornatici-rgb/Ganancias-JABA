import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { inferDocumentAllocation } from '../fiscalLedger/gainsImputation';
import { assembleAnnualConsolidation, type LoadedPeriod } from '../fiscalLedger/annualConsolidationAssembler';

const D = (v: string | number) => new Decimal(v);
const vl = (kind: string, base: string, vat: string, computable = false) => ({
  kind, taxableBase: D(base), vatAmount: D(vat), creditComputable: computable,
});

describe('inferDocumentAllocation — imputación inferida', () => {
  it('venta con IVA débito → SALE_TAXED, sin revisión', () => {
    const a = inferDocumentAllocation({ direction: 'SALE', voucherType: '1', netAmount: D('100000'), vatLines: [vl('TAXED', '100000', '21000')] });
    expect(a.gainsKind).toBe('SALE_TAXED');
    expect(a.needsReview).toBe(false);
    expect(a.isGrossIncomeTaxable).toBe(true);
  });

  it('venta exenta → SALE_EXEMPT, sin revisión', () => {
    const a = inferDocumentAllocation({ direction: 'SALE', voucherType: '1', netAmount: D('50000'), vatLines: [vl('EXEMPT', '50000', '0')] });
    expect(a.gainsKind).toBe('SALE_EXEMPT');
    expect(a.needsReview).toBe(false);
  });

  it('compra → DEDUCTIBLE_EXPENSE por default, con revisión pendiente', () => {
    const a = inferDocumentAllocation({ direction: 'PURCHASE', voucherType: '1', netAmount: D('40000'), vatLines: [vl('TAXED', '40000', '8400', true)] });
    expect(a.gainsKind).toBe('DEDUCTIBLE_EXPENSE');
    expect(a.needsReview).toBe(true);
    expect(a.isDeductible).toBe(true);
  });
});

describe('assembleAnnualConsolidation — compuerta + consolidación', () => {
  const docSaleTaxed = { id: 'd1', direction: 'SALE' as const, voucherType: '1', netAmount: D('100000'), vatLines: [vl('TAXED', '100000', '21000')], allocations: [] };
  const docPurchase = { id: 'd2', direction: 'PURCHASE' as const, voucherType: '1', netAmount: D('40000'), vatLines: [vl('TAXED', '40000', '8400', true)], allocations: [] };

  function period(month: number, vatStatus: LoadedPeriod['vatStatus'], extra?: Partial<LoadedPeriod>): LoadedPeriod {
    return {
      fiscalPeriodId: `p${month}`,
      month,
      vatStatus,
      grossIncomeTax: D('0'),
      documents: [docSaleTaxed, docPurchase],
      ...extra,
    };
  }

  it('solo los meses CLOSED entran a la consolidación', () => {
    const periods = [period(1, 'CLOSED'), period(2, 'DRAFT'), period(3, 'CLOSED')];
    const out = assembleAnnualConsolidation(periods);
    expect(out.usedMonths).toEqual([1, 3]);
    expect(out.gate.canConsolidateYear).toBe(false);
    // ventas de 2 meses CLOSED = 200.000; gasto = 80.000
    expect(out.consolidation?.totals.salesNet.toString()).toBe('200000');
    expect(out.consolidation?.totals.deductibleExpenses.toString()).toBe('80000');
  });

  it('cuenta comprobantes de compra como pendientes de revisión', () => {
    const out = assembleAnnualConsolidation([period(1, 'CLOSED')]);
    expect(out.pendingReviewByMonth).toEqual([{ month: 1, pending: 1 }]);
  });

  it('respeta una imputación persistida (sin inferir) y suma el IIBB del mes', () => {
    const confirmed: LoadedPeriod = {
      fiscalPeriodId: 'p1',
      month: 1,
      vatStatus: 'CLOSED',
      grossIncomeTax: D('5000'),
      documents: [
        { id: 'd2', direction: 'PURCHASE', voucherType: '1', netAmount: D('40000'), vatLines: [vl('TAXED', '40000', '8400', true)], allocations: [{ gainsKind: 'INVENTORY_PURCHASE', allocatedNetAmount: D('40000'), needsReview: false }] },
      ],
    };
    const out = assembleAnnualConsolidation([confirmed]);
    expect(out.consolidation?.totals.inventoryPurchases.toString()).toBe('40000');
    expect(out.consolidation?.totals.deductibleExpenses.toString()).toBe('0');
    expect(out.consolidation?.totals.grossIncomeTax.toString()).toBe('5000');
    expect(out.pendingReviewByMonth).toHaveLength(0); // ya confirmado
  });

  it('sin meses CLOSED la consolidación es null', () => {
    const out = assembleAnnualConsolidation([period(1, 'DRAFT'), period(2, 'IN_REVIEW')]);
    expect(out.consolidation).toBeNull();
    expect(out.usedMonths).toHaveLength(0);
  });

  it('una NC de venta (neto negativo) reduce las ventas netas', () => {
    const withNc: LoadedPeriod = {
      fiscalPeriodId: 'p1', month: 1, vatStatus: 'CLOSED', grossIncomeTax: D('0'),
      documents: [
        docSaleTaxed,
        { id: 'd3', direction: 'SALE', voucherType: '3', netAmount: D('-30000'), vatLines: [vl('TAXED', '-30000', '-6300')], allocations: [] },
      ],
    };
    const out = assembleAnnualConsolidation([withNc]);
    expect(out.consolidation?.totals.salesNet.toString()).toBe('70000'); // 100000 - 30000
  });
});
