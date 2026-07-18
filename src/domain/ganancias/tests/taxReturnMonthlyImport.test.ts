import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import {
  buildIibbDeterminedExpenseDrafts,
  mapMonthlyDocumentsToTaxReturnInputs,
  type MonthlyImportDocument,
} from '../fiscalLedger/taxReturnMonthlyImport';

const D = (v: string | number) => new Decimal(v);
const vl = (kind: string, base: string, vat: string, c = false) => ({ kind, taxableBase: D(base), vatAmount: D(vat), creditComputable: c });

function doc(over: Partial<MonthlyImportDocument>): MonthlyImportDocument {
  return {
    id: 'doc-1', month: 5, direction: 'SALE', voucherType: '1', voucherNumber: '0001-00000001',
    issueDate: new Date('2025-05-10'), counterpartyName: 'ACME SA', counterpartyCuit: '30-1-5',
    netAmount: D('100000'), totalAmount: D('121000'), vatLines: [vl('TAXED', '100000', '21000')],
    ...over,
  };
}

describe('mapMonthlyDocumentsToTaxReturnInputs', () => {
  it('venta gravada → SalesInvoice no exento, con etiqueta y vínculo al comprobante', () => {
    const r = mapMonthlyDocumentsToTaxReturnInputs([doc({})]);
    expect(r.sales).toHaveLength(1);
    expect(r.sales[0].invoiceType).toBe('Factura A');
    expect(r.sales[0].isExempt).toBe(false);
    expect(r.sales[0].netAmount).toBe('100000.00');
    expect(r.sales[0].ivaAmount).toBe('21000.00');
    expect(r.sales[0].sourceFiscalDocumentId).toBe('doc-1');
    expect(r.sales[0].importSource).toBe('MONTHLY_LEDGER');
  });

  it('venta exenta → isExempt true', () => {
    const r = mapMonthlyDocumentsToTaxReturnInputs([doc({ vatLines: [vl('EXEMPT', '50000', '0')] })]);
    expect(r.sales[0].isExempt).toBe(true);
  });

  it('compra sin imputación → gasto deducible (GastosGenerales) y cuenta como pendiente de revisión', () => {
    const r = mapMonthlyDocumentsToTaxReturnInputs([
      doc({ id: 'c1', direction: 'PURCHASE', voucherType: '1', vatLines: [vl('TAXED', '40000', '8400', true)] }),
    ]);
    expect(r.purchases).toHaveLength(1);
    expect(r.purchases[0].expenseType).toBe('MateriaPrima');
    expect(r.purchases[0].isDeductible).toBe(true);
    expect(r.summary.pendingReview).toBe(1);
  });

  it('compra imputada a mercadería → expenseType Mercaderia (irá al CMV), sin pendiente', () => {
    const r = mapMonthlyDocumentsToTaxReturnInputs([
      doc({ id: 'c2', direction: 'PURCHASE', persistedGainsKind: 'INVENTORY_PURCHASE', persistedNeedsReview: false, vatLines: [vl('TAXED', '40000', '8400', true)] }),
    ]);
    expect(r.purchases[0].expenseType).toBe('Mercaderia');
    expect(r.summary.pendingReview).toBe(0);
  });

  it('compra imputada a bien de uso → candidato (no entra como compra)', () => {
    const r = mapMonthlyDocumentsToTaxReturnInputs([
      doc({ id: 'c3', direction: 'PURCHASE', persistedGainsKind: 'FIXED_ASSET', persistedNeedsReview: false, netAmount: D('500000'), vatLines: [vl('TAXED', '500000', '105000', true)] }),
    ]);
    expect(r.purchases).toHaveLength(0);
    expect(r.fixedAssetCandidates).toHaveLength(1);
    expect(r.fixedAssetCandidates[0].cost).toBe('500000.00');
    expect(r.fixedAssetCandidates[0].sourceFiscalDocumentId).toBe('c3');
  });

  it('nota de crédito de venta (tipo 8, neto negativo) → registro con neto negativo', () => {
    const r = mapMonthlyDocumentsToTaxReturnInputs([
      doc({ id: 'nc', voucherType: '8', netAmount: D('-30000'), totalAmount: D('-36300'), vatLines: [vl('TAXED', '-30000', '-6300')] }),
    ]);
    expect(r.sales[0].invoiceType).toBe('Nota de Crédito B');
    expect(r.sales[0].netAmount).toBe('-30000.00');
  });

  it('tipo de comprobante desconocido → etiqueta genérica', () => {
    const r = mapMonthlyDocumentsToTaxReturnInputs([doc({ voucherType: '999' })]);
    expect(r.sales[0].invoiceType).toBe('Comprobante 999');
  });
});

describe('buildIibbDeterminedExpenseDrafts', () => {
  it('crea una fila de gasto deducible por mes con el impuesto determinado (criterio 2026-07-16)', () => {
    const drafts = buildIibbDeterminedExpenseDrafts([
      { year: 2025, month: 3, determinedTax: D('15420.55') },
      { year: 2025, month: 4, determinedTax: D('18200.00') },
    ]);

    expect(drafts).toHaveLength(2);
    const marzo = drafts[0];
    expect(marzo.netAmount).toBe('15420.55');
    expect(marzo.totalAmount).toBe('15420.55');
    expect(marzo.ivaAmount).toBe('0.00');
    expect(marzo.isDeductible).toBe(true);
    expect(marzo.isExempt).toBe(false);
    expect(marzo.expenseType).toBe('GastosGenerales');
    expect(marzo.invoiceNumber).toBe('IIBB-2025-03');
    expect(marzo.vendorName).toContain('03/2025');
    // Fechado el último día del mes del período (se ve en la tarjeta de ese mes).
    expect(marzo.date.toISOString().startsWith('2025-03-31')).toBe(true);
    // Idempotencia: la reimportación borra y recrea por importSource.
    expect(marzo.importSource).toBe('MONTHLY_LEDGER');
    expect(marzo.sourceFiscalDocumentId).toBe('IIBB-DETERMINADO-2025-03');
  });

  it('omite meses con impuesto determinado en cero', () => {
    const drafts = buildIibbDeterminedExpenseDrafts([
      { year: 2025, month: 1, determinedTax: D('0') },
      { year: 2025, month: 2, determinedTax: D('100') },
    ]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].invoiceNumber).toBe('IIBB-2025-02');
  });

  it('febrero queda fechado el último día correcto (año no bisiesto)', () => {
    const drafts = buildIibbDeterminedExpenseDrafts([
      { year: 2025, month: 2, determinedTax: D('100') },
    ]);
    expect(drafts[0].date.toISOString().startsWith('2025-02-28')).toBe(true);
  });
});
