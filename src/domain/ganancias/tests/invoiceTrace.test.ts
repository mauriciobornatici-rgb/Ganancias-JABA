import { describe, expect, it } from 'vitest';
import { buildInvoiceTraceSummary } from '../presentation/invoiceTrace';

describe('buildInvoiceTraceSummary', () => {
  it('resume comprobante y contraparte importados', () => {
    const summary = buildInvoiceTraceSummary({
      invoiceType: 'Factura A',
      invoiceNumber: '0001-00002345',
      counterpartyName: 'Comercializadora SA',
      counterpartyCuit: '30700000001',
      ivaAmount: '31500',
      totalAmount: '181500',
    });

    expect(summary.hasTrace).toBe(true);
    expect(summary.primary).toBe('Factura A 0001-00002345');
    expect(summary.secondary).toBe('Comercializadora SA - CUIT 30700000001');
    expect(summary.amounts).toBe('IVA $31.500,00 - Total $181.500,00');
  });

  it('devuelve una referencia clara para filas manuales sin detalle importado', () => {
    const summary = buildInvoiceTraceSummary({});

    expect(summary.hasTrace).toBe(false);
    expect(summary.primary).toBe('Carga manual');
    expect(summary.secondary).toBe('Sin contraparte importada');
    expect(summary.amounts).toBe('');
  });
});
