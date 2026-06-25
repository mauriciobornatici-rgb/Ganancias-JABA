import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

const modulePath = '../persistence/fiscalLedgerPersistence';

describe('fiscal ledger persistence', () => {
  it('reports duplicates without inserting the same monthly voucher twice', async () => {
    const persistence = await import(modulePath).catch(() => null);
    expect(persistence).not.toBeNull();
    if (!persistence) return;

    const inserted: string[] = [];
    const db = {
      fiscalDocument: {
        findMany: async () => inserted.map(documentKey => ({ documentKey })),
        create: async ({ data }: { data: { documentKey: string } }) => {
          inserted.push(data.documentKey);
          return data;
        },
      },
    };
    const draft = {
      documentKey: 'SALE|2025-01-02|1|000300001457', ownerCuit: '20-11111111-1', direction: 'SALE',
      issueDate: new Date('2025-01-02'), voucherType: '1', voucherNumber: '0003-00001457',
      netAmount: new Decimal('1000'), totalAmount: new Decimal('1210'), vatLines: [],
    };

    expect(await persistence.persistFiscalDocuments(db, 'period-1', [draft])).toMatchObject({ inserted: 1, duplicates: 0 });
    expect(await persistence.persistFiscalDocuments(db, 'period-1', [draft])).toMatchObject({ inserted: 0, duplicates: 1 });
    expect(inserted).toHaveLength(1);
  });
});
