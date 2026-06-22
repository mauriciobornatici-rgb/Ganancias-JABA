import { describe, expect, it } from 'vitest';

const importerModulePath = '../mappers/afipFiscalLedgerImporter';

const salesHeader = [
  'Fecha de Emisión',
  'Tipo de Comprobante',
  'Punto de Venta',
  'Número de Comprobante',
  'Tipo Doc. Comprador',
  'Nro. Doc. Comprador',
  'Denominación Comprador',
  'Importe Total',
  'Neto Gravado IVA 10,5%',
  'Importe IVA 10,5%',
  'Neto Gravado IVA 21%',
  'Importe IVA 21%',
  'Importe Exento',
];

const purchaseHeader = [
  'Fecha de Emisión',
  'Tipo de Comprobante',
  'Punto de Venta',
  'Número de Comprobante',
  'Tipo Doc. Vendedor',
  'Nro. Doc. Vendedor',
  'Denominación Vendedor',
  'Importe Total',
  'Neto Gravado IVA 21%',
  'Importe IVA 21%',
];

function afipCsv(headers: string[], row: string[]): Buffer {
  return Buffer.from([headers.join(';'), row.join(';')].join('\r\n'), 'latin1');
}

describe('AFIP fiscal monthly ledger importer', () => {
  it('keeps 10.5% and 21% taxable bases and VAT separate for one sales voucher', async () => {
    const importerModule = await import(importerModulePath).catch(() => null);

    expect(importerModule).not.toBeNull();
    if (!importerModule) return;

    const result = importerModule.parseAfipFiscalLedgerDocuments({
      fileName: 'ventas-enero.csv',
      fileBuffer: afipCsv(salesHeader, [
        '2025-01-02', '1', '3', '1457', '80', '20111222334', 'CLIENTE PRUEBA SA',
        '3525,00', '1000,00', '105,00', '2000,00', '420,00', '0,00',
      ]),
    }, { ownerCuit: '20-11111111-1' });

    expect(result.errors).toEqual([]);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]).toMatchObject({
      direction: 'SALE',
      voucherType: '1',
      voucherNumber: '0003-00001457',
      counterpartyCuit: '20111222334',
    });
    expect(result.documents[0].netAmount.toString()).toBe('3000');
    expect(result.documents[0].totalAmount.toString()).toBe('3525');
    expect(result.documents[0].vatLines.map((line: { rate: { toString(): string }; taxableBase: { toString(): string }; vatAmount: { toString(): string }; kind: string; creditComputable: boolean }) => ({
      rate: line.rate.toString(),
      taxableBase: line.taxableBase.toString(),
      vatAmount: line.vatAmount.toString(),
      kind: line.kind,
      creditComputable: line.creditComputable,
    }))).toEqual([
      { rate: '0.105', taxableBase: '1000', vatAmount: '105', kind: 'TAXED', creditComputable: false },
      { rate: '0.21', taxableBase: '2000', vatAmount: '420', kind: 'TAXED', creditComputable: false },
    ]);
  });

  it('marks purchase VAT as computable without collapsing it into one annual purchase row', async () => {
    const importerModule = await import(importerModulePath).catch(() => null);

    expect(importerModule).not.toBeNull();
    if (!importerModule) return;

    const result = importerModule.parseAfipFiscalLedgerDocuments({
      fileName: 'compras-enero.csv',
      fileBuffer: afipCsv(purchaseHeader, [
        '2025-01-03', '1', '4', '243', '80', '307141419', 'PROVEEDOR SA',
        '1210,00', '1000,00', '210,00',
      ]),
    }, { ownerCuit: '20-11111111-1' });

    expect(result.errors).toEqual([]);
    expect(result.documents[0]).toMatchObject({ direction: 'PURCHASE', voucherNumber: '0004-00000243' });
    expect(result.documents[0].vatLines).toHaveLength(1);
    expect(result.documents[0].vatLines[0].creditComputable).toBe(true);
    expect(result.documents[0].vatLines[0].rate.toString()).toBe('0.21');
  });
});
