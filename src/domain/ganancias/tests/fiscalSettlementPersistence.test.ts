import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { buildVatSettlement } from '../fiscalLedger/settlementBuilders';
import {
  checkVatCotejo,
  buildVatSettlementLines,
  persistVatSettlement,
} from '../persistence/fiscalSettlementPersistence';

const D = (v: string | number) => new Decimal(v);
const vatLine = (rate: string, base: string, vat: string, kind = 'TAXED', computable = false) => ({
  kind, taxableBase: D(base), rate: D(rate), vatAmount: D(vat), creditComputable: computable,
});

/** Store en memoria que imita prisma.vatSettlement para testear versionado y cotejo sin DB. */
function makeStore() {
  const rows: Array<Record<string, unknown>> = [];
  return {
    rows,
    vatSettlement: {
      async findFirst(args: { where: { fiscalPeriodId: string } }) {
        const matching = rows
          .filter(r => r.fiscalPeriodId === args.where.fiscalPeriodId)
          .sort((a, b) => (b.version as number) - (a.version as number));
        return matching[0] ? { version: matching[0].version as number } : null;
      },
      async create(args: { data: Record<string, unknown> }) {
        const row: Record<string, unknown> = { id: `vs-${rows.length + 1}`, ...args.data };
        rows.push(row);
        return { id: row.id as string, version: row.version as number, status: row.status as string };
      },
    },
  };
}

const sampleView = () =>
  buildVatSettlement({
    documents: [
      { direction: 'SALE', vatLines: [vatLine('0.21', '100000', '21000')] },
      { direction: 'PURCHASE', vatLines: [vatLine('0.21', '40000', '8400', 'TAXED', true)] },
    ],
    vatCredits: [],
    previousTechnicalBalance: D(0),
  });

describe('checkVatCotejo — conciliación contra AFIP', () => {
  it('coincide cuando los valores oficiales igualan a los calculados (tolerancia 1 centavo)', () => {
    const view = sampleView();
    const check = checkVatCotejo(view, { debitFiscal: '21000', creditFiscal: '8400', amountDue: '12600' });
    expect(check.matches).toBe(true);
    expect(check.diffs).toHaveLength(0);
  });

  it('marca diferencia cuando un valor oficial no coincide', () => {
    const view = sampleView();
    const check = checkVatCotejo(view, { debitFiscal: '21000', creditFiscal: '8000', amountDue: '12600' });
    expect(check.matches).toBe(false);
    expect(check.diffs.find(d => d.concept === 'creditFiscal')?.diff).toBe('400.00');
  });

  it('sin valores oficiales no coincide (no hay con qué cotejar)', () => {
    const c = checkVatCotejo(sampleView(), null);
    expect(c.matches).toBe(false);
    expect(c.complete).toBe(false);
  });

  it('cotejo PARCIAL (solo saldo correcto) NO habilita cierre: matches=false, complete=false', () => {
    const c = checkVatCotejo(sampleView(), { amountDue: '12600' });
    expect(c.complete).toBe(false);
    expect(c.matches).toBe(false);
    expect(c.missing).toContain('debitFiscal');
    expect(c.missing).toContain('creditFiscal');
  });

  it('cotejo COMPLETO y coincidente: matches=true, complete=true, sin faltantes', () => {
    const c = checkVatCotejo(sampleView(), { debitFiscal: '21000', creditFiscal: '8400', amountDue: '12600' });
    expect(c.complete).toBe(true);
    expect(c.matches).toBe(true);
    expect(c.missing).toHaveLength(0);
  });
});

describe('buildVatSettlementLines — desglose persistible', () => {
  it('genera líneas de débito y crédito por alícuota', () => {
    const lines = buildVatSettlementLines(sampleView());
    expect(lines.find(l => l.concept === 'DEBITO_FISCAL')?.amount).toBe('21000.00');
    expect(lines.find(l => l.concept === 'CREDITO_FISCAL')?.amount).toBe('8400.00');
  });
});

describe('persistVatSettlement — versionado y estado por cotejo', () => {
  it('primera liquidación arranca en version 0 y queda CLOSED si coteja OK', async () => {
    const store = makeStore();
    const res = await persistVatSettlement(store, {
      fiscalPeriodId: 'p1',
      view: sampleView(),
      previousTechnicalBalance: D(0),
      previousFreeAvailabilityBalance: D('250'),
      official: { debitFiscal: '21000', creditFiscal: '8400', amountDue: '12600' },
    });
    expect(res.version).toBe(0);
    expect(res.status).toBe('CLOSED');
    expect(res.cotejo.matches).toBe(true);
    expect(store.rows[0].amountDue).toBe('12600.00');
    expect(store.rows[0].previousFreeAvailabilityBalance).toBe('250.00');
    expect(store.rows[0].smallTaxpayerBenefitRate).toBe('0.000000');
    expect(store.rows[0].filedAt).toBeInstanceOf(Date);
  });

  it('si no coteja queda IN_REVIEW y la segunda liquidación incrementa la versión', async () => {
    const store = makeStore();
    await persistVatSettlement(store, { fiscalPeriodId: 'p1', view: sampleView(), previousTechnicalBalance: D(0) });
    const res2 = await persistVatSettlement(store, {
      fiscalPeriodId: 'p1',
      view: sampleView(),
      previousTechnicalBalance: D(0),
      official: { amountDue: '99999' },
    });
    expect(res2.version).toBe(1);
    expect(res2.status).toBe('IN_REVIEW');
  });

  it('sin valores oficiales se guarda como DRAFT', async () => {
    const store = makeStore();
    const res = await persistVatSettlement(store, { fiscalPeriodId: 'p2', view: sampleView(), previousTechnicalBalance: D(0) });
    expect(res.status).toBe('DRAFT');
  });

  it('cotejo parcial (solo saldo, aunque sea correcto) NO cierra: queda IN_REVIEW', async () => {
    const store = makeStore();
    const res = await persistVatSettlement(store, {
      fiscalPeriodId: 'p3',
      view: sampleView(),
      previousTechnicalBalance: D(0),
      official: { amountDue: '12600' }, // correcto pero incompleto
    });
    expect(res.status).toBe('IN_REVIEW');
    expect(res.cotejo.complete).toBe(false);
  });
});
