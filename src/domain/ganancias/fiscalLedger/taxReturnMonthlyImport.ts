import { Decimal } from 'decimal.js';
import { inferDocumentAllocation, type ImputationVatLine } from './gainsImputation';
import type { GainsAllocationKind } from './annualConsolidation';
import { DEFAULT_PURCHASE_EXPENSE_TYPE } from '../purchaseExpenseType';

/**
 * Mapeo del libro fiscal mensual (módulo IVA) hacia los registros transaccionales de la DDJJ anual
 * de Ganancias (SalesInvoice / PurchaseInvoice), comprobante por comprobante.
 *
 * Diseño: NO toca la matemática de la determinación. Solo genera los registros que el motor anual ya
 * sabe consumir, con el `expenseType` correcto para que cada comprobante caiga donde debe:
 *   - Mercadería (INVENTORY_PURCHASE) → expenseType 'Mercaderia' → entra al Costo de Ventas (CMV).
 *   - Gasto deducible (DEDUCTIBLE_EXPENSE) → gasto deducible.
 *   - No deducible (NON_DEDUCTIBLE) → gasto no deducible.
 *   - Bien de uso (FIXED_ASSET) → NO se crea como compra; se reporta como candidato a cargar en
 *     "bienes de uso" (requiere vida útil, dato que AFIP no provee).
 *
 * Notas de crédito: llegan con neto negativo, por lo que como registro reducen ventas/compras
 * (consistente con el F2002 y con el devengado de Ganancias). No se invierte el signo.
 *
 * Función PURA. La resolución de la imputación (persistida o inferida) se hace acá.
 */

export const MONTHLY_IMPORT_SOURCE = 'MONTHLY_LEDGER';

const AFIP_VOUCHER_LABELS: Record<number, string> = {
  1: 'Factura A', 2: 'Nota de Débito A', 3: 'Nota de Crédito A',
  6: 'Factura B', 7: 'Nota de Débito B', 8: 'Nota de Crédito B',
  11: 'Factura C', 12: 'Nota de Débito C', 13: 'Nota de Crédito C',
  51: 'Factura M', 52: 'Nota de Débito M', 53: 'Nota de Crédito M',
  201: 'FCE MiPyME A', 202: 'ND MiPyME A', 203: 'NC MiPyME A',
  206: 'FCE MiPyME B', 207: 'ND MiPyME B', 208: 'NC MiPyME B',
  211: 'FCE MiPyME C', 212: 'ND MiPyME C', 213: 'NC MiPyME C',
};

function voucherLabel(voucherType: string): string {
  const code = parseInt(String(voucherType).trim(), 10);
  return AFIP_VOUCHER_LABELS[code] ?? `Comprobante ${voucherType}`;
}

export type MonthlyImportDocument = {
  id: string;
  month: number;
  direction: 'SALE' | 'PURCHASE';
  voucherType: string;
  voucherNumber: string;
  issueDate: Date;
  counterpartyName: string | null;
  counterpartyCuit: string | null;
  netAmount: Decimal;
  totalAmount: Decimal;
  vatLines: ImputationVatLine[];
  /** Imputación persistida y confirmada (si existe). Si falta, se infiere. */
  persistedGainsKind?: GainsAllocationKind | null;
  persistedNeedsReview?: boolean;
};

export type SalesInvoiceDraft = {
  date: Date;
  invoiceType: string;
  invoiceNumber: string;
  customerName: string;
  counterpartyCuit: string | null;
  netAmount: string;
  ivaAmount: string;
  totalAmount: string;
  isExempt: boolean;
  importSource: string;
  sourceFiscalDocumentId: string;
};

export type PurchaseInvoiceDraft = {
  date: Date;
  invoiceType: string;
  invoiceNumber: string;
  vendorName: string;
  counterpartyCuit: string | null;
  netAmount: string;
  ivaAmount: string;
  totalAmount: string;
  isDeductible: boolean;
  isExempt: boolean;
  expenseType: string;
  importSource: string;
  sourceFiscalDocumentId: string;
};

export type FixedAssetCandidate = {
  sourceFiscalDocumentId: string;
  month: number;
  description: string;
  counterpartyName: string | null;
  cost: string;
  date: Date;
};

export type MonthlyImportResult = {
  sales: SalesInvoiceDraft[];
  purchases: PurchaseInvoiceDraft[];
  /** Bienes de uso a completar manualmente (vida útil, tipo) en el wizard. */
  fixedAssetCandidates: FixedAssetCandidate[];
  summary: {
    salesCount: number;
    purchasesCount: number;
    fixedAssetCount: number;
    pendingReview: number;
  };
};

const sumVat = (lines: ImputationVatLine[]): Decimal => lines.reduce((s, l) => s.add(l.vatAmount), new Decimal(0));
const isExemptDoc = (lines: ImputationVatLine[]): boolean => !lines.some(l => l.kind === 'TAXED');

function resolveGainsKind(doc: MonthlyImportDocument): { gainsKind: GainsAllocationKind; needsReview: boolean } {
  if (doc.persistedGainsKind) {
    return { gainsKind: doc.persistedGainsKind, needsReview: doc.persistedNeedsReview ?? false };
  }
  const inferred = inferDocumentAllocation({
    direction: doc.direction,
    voucherType: doc.voucherType,
    netAmount: doc.netAmount,
    vatLines: doc.vatLines,
  });
  return { gainsKind: inferred.gainsKind, needsReview: inferred.needsReview };
}

/** Mapea el expenseType de la DDJJ según la categoría de Ganancias del comprobante. */
function expenseTypeFor(gainsKind: GainsAllocationKind): { expenseType: string; isDeductible: boolean } {
  switch (gainsKind) {
    case 'INVENTORY_PURCHASE':
      return { expenseType: 'Mercaderia', isDeductible: true };
    case 'NON_DEDUCTIBLE':
      return { expenseType: 'No Deducible', isDeductible: false };
    case 'VAT_NON_COMPUTABLE':
      return { expenseType: 'IVA No Computable', isDeductible: true };
    case 'DEDUCTIBLE_EXPENSE':
    default:
      return { expenseType: DEFAULT_PURCHASE_EXPENSE_TYPE, isDeductible: true };
  }
}

export type IibbDeterminedEntry = {
  year: number;
  month: number;
  /** Impuesto determinado de IIBB del mes (liquidación CLOSED del módulo mensual). */
  determinedTax: Decimal;
};

/**
 * Crea las filas de gasto deducible por el IIBB determinado de cada mes cotejado
 * (criterio del usuario 2026-07-16: una fila por mes, con el impuesto determinado).
 * Llevan importSource=MONTHLY_LEDGER, por lo que la reimportación las reemplaza
 * de forma idempotente igual que los comprobantes.
 */
export function buildIibbDeterminedExpenseDrafts(entries: IibbDeterminedEntry[]): PurchaseInvoiceDraft[] {
  return entries
    .filter(entry => !entry.determinedTax.isZero())
    .map(entry => {
      const mm = String(entry.month).padStart(2, '0');
      return {
        // Último día del mes del período liquidado.
        date: new Date(Date.UTC(entry.year, entry.month, 0)),
        invoiceType: 'IIBB',
        invoiceNumber: `IIBB-${entry.year}-${mm}`,
        vendorName: `Ingresos Brutos determinado ${mm}/${entry.year}`,
        counterpartyCuit: null,
        netAmount: entry.determinedTax.toFixed(2),
        ivaAmount: '0.00',
        totalAmount: entry.determinedTax.toFixed(2),
        isDeductible: true,
        isExempt: false,
        expenseType: 'GastosGenerales',
        importSource: MONTHLY_IMPORT_SOURCE,
        sourceFiscalDocumentId: `IIBB-DETERMINADO-${entry.year}-${mm}`,
      };
    });
}

export function mapMonthlyDocumentsToTaxReturnInputs(documents: MonthlyImportDocument[]): MonthlyImportResult {
  const sales: SalesInvoiceDraft[] = [];
  const purchases: PurchaseInvoiceDraft[] = [];
  const fixedAssetCandidates: FixedAssetCandidate[] = [];
  let pendingReview = 0;

  for (const doc of documents) {
    const vat = sumVat(doc.vatLines);
    const exempt = isExemptDoc(doc.vatLines);

    if (doc.direction === 'SALE') {
      sales.push({
        date: doc.issueDate,
        invoiceType: voucherLabel(doc.voucherType),
        invoiceNumber: doc.voucherNumber,
        customerName: doc.counterpartyName ?? 'Consumidor Final',
        counterpartyCuit: doc.counterpartyCuit,
        netAmount: doc.netAmount.toFixed(2),
        ivaAmount: vat.toFixed(2),
        totalAmount: doc.totalAmount.toFixed(2),
        isExempt: exempt,
        importSource: MONTHLY_IMPORT_SOURCE,
        sourceFiscalDocumentId: doc.id,
      });
      continue;
    }

    // PURCHASE
    const { gainsKind, needsReview } = resolveGainsKind(doc);
    if (needsReview) pendingReview += 1;

    if (gainsKind === 'FIXED_ASSET') {
      // Bien de uso: no entra como compra; se completa en la sección de amortizaciones.
      fixedAssetCandidates.push({
        sourceFiscalDocumentId: doc.id,
        month: doc.month,
        description: voucherLabel(doc.voucherType),
        counterpartyName: doc.counterpartyName,
        cost: doc.netAmount.toFixed(2),
        date: doc.issueDate,
      });
      continue;
    }

    const { expenseType, isDeductible } = expenseTypeFor(gainsKind);
    purchases.push({
      date: doc.issueDate,
      invoiceType: voucherLabel(doc.voucherType),
      invoiceNumber: doc.voucherNumber,
      vendorName: doc.counterpartyName ?? 'Proveedor',
      counterpartyCuit: doc.counterpartyCuit,
      netAmount: doc.netAmount.toFixed(2),
      ivaAmount: vat.toFixed(2),
      totalAmount: doc.totalAmount.toFixed(2),
      isDeductible,
      isExempt: exempt,
      expenseType,
      importSource: MONTHLY_IMPORT_SOURCE,
      sourceFiscalDocumentId: doc.id,
    });
  }

  return {
    sales,
    purchases,
    fixedAssetCandidates,
    summary: {
      salesCount: sales.length,
      purchasesCount: purchases.length,
      fixedAssetCount: fixedAssetCandidates.length,
      pendingReview,
    },
  };
}
