import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

const documentKeyModulePath = '../fiscalLedger/documentKey';

describe('fiscal document key', () => {
  it('does not change when the same AFIP voucher is reimported from another file name', async () => {
    const documentKeyModule = await import(documentKeyModulePath).catch(() => null);

    expect(documentKeyModule).not.toBeNull();
    if (!documentKeyModule) return;

    const baseDraft = {
      ownerCuit: '20-11111111-1',
      direction: 'SALE',
      issueDate: new Date('2025-01-02T00:00:00.000Z'),
      voucherType: '1',
      voucherNumber: '0003-00001457',
      counterpartyCuit: '20111222334',
      netAmount: new Decimal('3000'),
      totalAmount: new Decimal('3525'),
      vatLines: [],
      sourceFileName: 'ventas-enero.csv',
    };

    const firstKey = documentKeyModule.buildFiscalDocumentKey(baseDraft);
    const reimportedKey = documentKeyModule.buildFiscalDocumentKey({
      ...baseDraft,
      sourceFileName: 'copia-ventas-enero.csv',
    });

    expect(firstKey).toBe(reimportedKey);
    expect(documentKeyModule.buildFiscalDocumentKey({
      ...baseDraft,
      voucherNumber: '0003-00001458',
    })).not.toBe(firstKey);
  });
});
