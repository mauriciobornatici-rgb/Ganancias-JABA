import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { persistFiscalDocuments } from '../persistence/fiscalLedgerPersistence';

type Row = Record<string, unknown>;

function makeStore() {
  const documents: Row[] = [];
  const vatLines: Row[] = [];
  return {
    documents,
    vatLines,
    db: {
      fiscalDocument: {
        findMany: async () => documents.map(d => ({ documentKey: String(d.documentKey) })),
        createMany: async ({ data }: { data: Row[] }) => {
          documents.push(...data);
          return { count: data.length };
        },
      },
      fiscalDocumentVatLine: {
        createMany: async ({ data }: { data: Row[] }) => {
          vatLines.push(...data);
          return { count: data.length };
        },
      },
    },
  };
}

const draft = (key: string) => ({
  documentKey: key,
  ownerCuit: '20-11111111-1',
  direction: 'SALE' as const,
  issueDate: new Date('2025-01-02'),
  voucherType: '1',
  voucherNumber: '0003-00001457',
  netAmount: new Decimal('1000'),
  totalAmount: new Decimal('1210'),
  vatLines: [
    { kind: 'TAXED' as const, rate: new Decimal('21'), taxableBase: new Decimal('1000'), vatAmount: new Decimal('210'), creditComputable: false },
  ],
});

describe('fiscal ledger persistence (insercion en lote, incidente 2026-07-19)', () => {
  it('inserta documentos y lineas de IVA en lote, vinculadas por id generado en cliente', async () => {
    const store = makeStore();
    const result = await persistFiscalDocuments(store.db, 'period-1', [draft('K1'), draft('K2')]);

    expect(result).toMatchObject({ inserted: 2, duplicates: 0 });
    expect(store.documents).toHaveLength(2);
    expect(store.vatLines).toHaveLength(2);

    // Cada linea referencia el id de su documento (la FK queda satisfecha por construccion).
    const documentIds = new Set(store.documents.map(d => d.id));
    for (const line of store.vatLines) {
      expect(documentIds.has(line.fiscalDocumentId)).toBe(true);
    }
  });

  it('reporta duplicados sin insertar el mismo comprobante dos veces (idempotencia)', async () => {
    const store = makeStore();
    expect(await persistFiscalDocuments(store.db, 'period-1', [draft('K1')])).toMatchObject({ inserted: 1, duplicates: 0 });
    expect(await persistFiscalDocuments(store.db, 'period-1', [draft('K1')])).toMatchObject({ inserted: 0, duplicates: 1 });
    expect(store.documents).toHaveLength(1);
    expect(store.vatLines).toHaveLength(1);
  });

  it('deduplica dentro del mismo lote (dos archivos con el mismo comprobante)', async () => {
    const store = makeStore();
    const result = await persistFiscalDocuments(store.db, 'period-1', [draft('K1'), draft('K1')]);
    expect(result).toMatchObject({ inserted: 1, duplicates: 1 });
    expect(store.documents).toHaveLength(1);
  });
});
