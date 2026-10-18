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

  // Formato "Mis Comprobantes" de la consulta web de ARCA: UTF-8, columnas Emisor/Receptor,
  // "Número Desde", e importe de IVA sin la palabra "Importe" ("IVA 21%"). Incidente 2026-07-20.
  const misComprobantesRecibidosHeader = [
    'Fecha de Emisión', 'Tipo de Comprobante', 'Punto de Venta', 'Número Desde', 'Número Hasta',
    'Cód. Autorización', 'Tipo Doc. Emisor', 'Nro. Doc. Emisor', 'Denominación Emisor',
    'Tipo Doc. Receptor', 'Nro. Doc. Receptor', 'Tipo Cambio', 'Moneda',
    'Imp. Neto Gravado IVA 0%', 'IVA 2,5%', 'Imp. Neto Gravado IVA 2,5%', 'IVA 5%', 'Imp. Neto Gravado IVA 5%',
    'IVA 10,5%', 'Imp. Neto Gravado IVA 10,5%', 'IVA 21%', 'Imp. Neto Gravado IVA 21%',
    'IVA 27%', 'Imp. Neto Gravado IVA 27%', 'Imp. Neto Gravado Total', 'Imp. Neto No Gravado',
    'Imp. Op. Exentas', 'Otros Tributos', 'Total IVA', 'Imp. Total',
  ];

  const misComprobantesEmitidosHeader = [
    'Fecha de Emisión', 'Tipo de Comprobante', 'Punto de Venta', 'Número Desde', 'Número Hasta',
    'Cód. Autorización', 'Tipo Doc. Receptor', 'Nro. Doc. Receptor', 'Denominación Receptor',
    'Tipo Cambio', 'Moneda',
    'Imp. Neto Gravado IVA 0%', 'IVA 2,5%', 'Imp. Neto Gravado IVA 2,5%', 'IVA 5%', 'Imp. Neto Gravado IVA 5%',
    'IVA 10,5%', 'Imp. Neto Gravado IVA 10,5%', 'IVA 21%', 'Imp. Neto Gravado IVA 21%',
    'IVA 27%', 'Imp. Neto Gravado IVA 27%', 'Imp. Neto Gravado Total', 'Imp. Neto No Gravado',
    'Imp. Op. Exentas', 'Otros Tributos', 'Total IVA', 'Imp. Total',
  ];

  function misComprobantesCsv(headers: string[], row: string[]): Buffer {
    // UTF-8, comillas dobles en cada campo, como los baja la web de ARCA.
    const quote = (cells: string[]) => cells.map(c => `"${c}"`).join(';');
    return Buffer.from([quote(headers), quote(row)].join('\r\n'), 'utf-8');
  }

  it('importa el formato "Mis Comprobantes" recibidos (UTF-8, Emisor, IVA 21%) como compra', async () => {
    const importerModule = await import(importerModulePath).catch(() => null);
    if (!importerModule) return;

    const result = importerModule.parseAfipFiscalLedgerDocuments({
      fileName: 'recibidos.csv',
      fileBuffer: misComprobantesCsv(misComprobantesRecibidosHeader, [
        '2026-06-01', '1', '5', '49093', '49093', '86227907598217', '80', '30708383550', 'DISTRIBUIDORA EL CERRO S.R.L.',
        '80', '20352424731', '1,00', '$',
        '', '', '', '', '', '', '', '47853,49', '227873,77', '', '', '227873,77', '0,00',
        '0,00', '6836,21', '47853,49', '282563,47',
      ]),
    }, { ownerCuit: '20-35242473-1' });

    expect(result.errors).toEqual([]);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]).toMatchObject({
      direction: 'PURCHASE',
      voucherType: '1',
      voucherNumber: '0005-00049093',
      counterpartyCuit: '30708383550',
      counterpartyName: 'DISTRIBUIDORA EL CERRO S.R.L.',
    });
    expect(result.documents[0].netAmount.toString()).toBe('227873.77');
    expect(result.documents[0].totalAmount.toString()).toBe('282563.47');
    expect(result.documents[0].vatLines).toHaveLength(1);
    expect(result.documents[0].vatLines[0]).toMatchObject({ kind: 'TAXED', creditComputable: true });
    expect(result.documents[0].vatLines[0].vatAmount.toString()).toBe('47853.49');
    expect(result.documents[0].vatLines[0].rate.toString()).toBe('0.21');
  });

  it('conserva el total de comprobantes B/C sin desglose de IVA como importe no gravado', async () => {
    const importerModule = await import(importerModulePath).catch(() => null);
    if (!importerModule) return;

    const result = importerModule.parseAfipFiscalLedgerDocuments({
      fileName: 'recibidos-tipo-c.csv',
      fileBuffer: misComprobantesCsv(misComprobantesRecibidosHeader, [
        '2026-06-16', '11', '1', '499', '499', '86240000000000', '80', '27123456789', 'PROVEEDOR TIPO C',
        '80', '20352424731', '1,00', '$',
        '', '', '', '', '', '', '', '', '', '', '', '0,00', '0,00',
        '0,00', '100000,00', '0,00', '600000,00',
      ]),
    }, { ownerCuit: '20-35242473-1' });

    expect(result.errors).toEqual([]);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].netAmount.toString()).toBe('600000');
    expect(result.documents[0].totalAmount.toString()).toBe('600000');
    expect(result.documents[0].vatLines).toHaveLength(1);
    expect(result.documents[0].vatLines[0]).toMatchObject({
      kind: 'NON_TAXED',
      creditComputable: false,
    });
    expect(result.documents[0].vatLines[0].taxableBase.toString()).toBe('600000');
  });

  it('importa el formato "Mis Comprobantes" emitidos como venta y separa dos alícuotas', async () => {
    const importerModule = await import(importerModulePath).catch(() => null);
    if (!importerModule) return;

    // Factura con parte a IVA 0% y parte a IVA 21% (caso real del archivo del usuario).
    const result = importerModule.parseAfipFiscalLedgerDocuments({
      fileName: 'emitidos.csv',
      fileBuffer: misComprobantesCsv(misComprobantesEmitidosHeader, [
        '2026-06-08', '1', '2', '7732', '7732', '86238893479200', '80', '20214702445', 'PALOMO ENRIQUE',
        '1,00', '$',
        '59039,65', '', '', '', '', '', '', '89871,70', '427960,49', '', '', '487000,14', '0,00',
        '0,00', '0,00', '89871,70', '576871,85',
      ]),
    }, { ownerCuit: '20-35242473-1' });

    expect(result.errors).toEqual([]);
    expect(result.documents[0]).toMatchObject({ direction: 'SALE', voucherNumber: '0002-00007732', counterpartyCuit: '20214702445' });
    expect(result.documents[0].netAmount.toString()).toBe('487000.14');
    expect(result.documents[0].vatLines).toHaveLength(2);
    expect(result.documents[0].vatLines.map((l: { rate: { toString(): string } }) => l.rate.toString())).toEqual(['0', '0.21']);
    // Las ventas no generan crédito computable.
    expect(result.documents[0].vatLines.every((l: { creditComputable: boolean }) => l.creditComputable === false)).toBe(true);
  });
});
