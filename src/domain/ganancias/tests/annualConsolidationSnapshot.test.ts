import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { assembleAnnualConsolidation, type LoadedPeriod } from '../fiscalLedger/annualConsolidationAssembler';
import { persistAnnualConsolidationSnapshot, isSnapshotStale } from '../persistence/annualConsolidationSnapshot';

const D = (v: string | number) => new Decimal(v);
const vl = (kind: string, base: string, vat: string, c = false) => ({ kind, taxableBase: D(base), vatAmount: D(vat), creditComputable: c });
const saleDoc = { id: 'd1', direction: 'SALE' as const, voucherType: '1', netAmount: D('100000'), vatLines: [vl('TAXED', '100000', '21000')], allocations: [] };

function makeStore() {
  const rows: Array<Record<string, unknown>> = [];
  return {
    rows,
    annualFiscalConsolidationSnapshot: {
      async findFirst(args: { where: { taxReturnId: string; sourceHash: string } }) {
        const r = rows.find(x => x.taxReturnId === args.where.taxReturnId && x.sourceHash === args.where.sourceHash);
        return r ? { id: r.id as string, sourceHash: r.sourceHash as string, confirmedAt: (r.confirmedAt as Date | null) ?? null } : null;
      },
      async create(args: { data: Record<string, unknown> }) {
        const row: Record<string, unknown> = { id: `snap-${rows.length + 1}`, ...args.data };
        rows.push(row);
        return { id: row.id as string, sourceHash: row.sourceHash as string, confirmedAt: (row.confirmedAt as Date | null) ?? null };
      },
    },
  };
}

const fullYear = (): LoadedPeriod[] =>
  Array.from({ length: 12 }, (_, i) => ({ fiscalPeriodId: `p${i + 1}`, month: i + 1, vatStatus: 'CLOSED' as const, grossIncomeTax: D('0'), documents: [saleDoc] }));

describe('persistAnnualConsolidationSnapshot', () => {
  it('persiste el snapshot y lo confirma si el año está completo (12 CLOSED)', async () => {
    const store = makeStore();
    const assembly = assembleAnnualConsolidation(fullYear());
    const res = await persistAnnualConsolidationSnapshot(store, 'tr-1', assembly, { confirm: true });
    expect(res.confirmed).toBe(true);
    expect(res.reused).toBe(false);
    expect(store.rows[0].salesNet).toBe('1200000.00'); // 100000 × 12
  });

  it('NO confirma si falta algún mes, aunque se pida confirm', async () => {
    const store = makeStore();
    const periods = fullYear();
    periods[3].vatStatus = 'DRAFT';
    const assembly = assembleAnnualConsolidation(periods);
    const res = await persistAnnualConsolidationSnapshot(store, 'tr-1', assembly, { confirm: true });
    expect(res.confirmed).toBe(false);
  });

  it('es idempotente: mismo sourceHash no duplica', async () => {
    const store = makeStore();
    const assembly = assembleAnnualConsolidation(fullYear());
    const a = await persistAnnualConsolidationSnapshot(store, 'tr-1', assembly, { confirm: true });
    const b = await persistAnnualConsolidationSnapshot(store, 'tr-1', assembly, { confirm: true });
    expect(b.reused).toBe(true);
    expect(b.id).toBe(a.id);
    expect(store.rows).toHaveLength(1);
  });

  it('sin meses cotejados no genera snapshot (lanza error)', async () => {
    const store = makeStore();
    const assembly = assembleAnnualConsolidation([{ fiscalPeriodId: 'p1', month: 1, vatStatus: 'DRAFT', grossIncomeTax: D('0'), documents: [saleDoc] }]);
    await expect(persistAnnualConsolidationSnapshot(store, 'tr-1', assembly)).rejects.toThrow(/cotejados/i);
  });
});

describe('isSnapshotStale', () => {
  it('detecta obsolescencia cuando cambia la base', () => {
    const assembly = assembleAnnualConsolidation(fullYear());
    const hash = assembly.consolidation!.sourceHash;
    expect(isSnapshotStale(hash, assembly)).toBe(false);
    expect(isSnapshotStale('hash-viejo', assembly)).toBe(true);
  });
});
