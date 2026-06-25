import { Decimal } from 'decimal.js';
import type { GainsAllocationKind, PeriodAllocation } from './annualConsolidation';

/**
 * Imputación inferida de comprobantes a categorías de Ganancias 3ª categoría.
 *
 * AFIP no informa si una compra es mercadería, gasto o bien de uso: esa decisión es contable. Por
 * eso la inferencia da un DEFAULT razonable y marca `needsReview` para que el contador confirme u
 * override antes de cerrar el año. Las VENTAS sí se infieren con certeza (gravada vs exenta) a
 * partir del desglose de IVA, por lo que no requieren revisión.
 *
 * Convención de signos: las notas de crédito llegan con neto negativo desde AFIP, de modo que al
 * sumarse reducen la categoría correspondiente (una NC de venta baja las ventas; una NC de compra
 * baja el gasto/mercadería). No se invierte el signo aquí.
 *
 * Función PURA: no accede a base ni decide el cierre; solo clasifica.
 */

export type ImputationVatLine = {
  kind: string; // TAXED | EXEMPT | NON_TAXED
  taxableBase: Decimal;
  vatAmount: Decimal;
  creditComputable: boolean;
};

export type ImputationDocument = {
  id?: string;
  direction: 'SALE' | 'PURCHASE';
  voucherType: string;
  netAmount: Decimal;
  vatLines: ImputationVatLine[];
};

export type InferredAllocation = {
  gainsKind: GainsAllocationKind;
  allocatedNetAmount: Decimal;
  isDeductible: boolean;
  isGrossIncomeTaxable: boolean;
  needsReview: boolean;
  reason: string;
};

const hasTaxed = (doc: ImputationDocument): boolean => doc.vatLines.some(l => l.kind === 'TAXED');

/** Infiere la imputación de un comprobante a una categoría de Ganancias. */
export function inferDocumentAllocation(doc: ImputationDocument): InferredAllocation {
  if (doc.direction === 'SALE') {
    if (hasTaxed(doc)) {
      return {
        gainsKind: 'SALE_TAXED',
        allocatedNetAmount: doc.netAmount,
        isDeductible: false,
        isGrossIncomeTaxable: true,
        needsReview: false,
        reason: 'Venta gravada (con IVA débito).',
      };
    }
    return {
      gainsKind: 'SALE_EXEMPT',
      allocatedNetAmount: doc.netAmount,
      isDeductible: false,
      isGrossIncomeTaxable: false,
      needsReview: false,
      reason: 'Venta exenta o no gravada (sin IVA débito).',
    };
  }

  // PURCHASE: default a gasto deducible; el contador confirma si es mercadería o bien de uso.
  return {
    gainsKind: 'DEDUCTIBLE_EXPENSE',
    allocatedNetAmount: doc.netAmount,
    isDeductible: true,
    isGrossIncomeTaxable: false,
    needsReview: true,
    reason: 'Compra: default gasto deducible. Confirmar si es mercadería (INVENTORY_PURCHASE) o bien de uso (FIXED_ASSET).',
  };
}

/**
 * Construye las imputaciones de un período para la consolidación anual, a partir de los comprobantes
 * incluidos. Si un comprobante ya tiene una imputación confirmada (persistida y sin needsReview), se
 * respeta; en caso contrario se infiere.
 */
export function buildPeriodAllocations(
  documents: ImputationDocument[],
  confirmed?: Map<string, { gainsKind: GainsAllocationKind; allocatedNetAmount: Decimal }>,
): { allocations: PeriodAllocation[]; pendingReview: number } {
  const allocations: PeriodAllocation[] = [];
  let pendingReview = 0;

  for (const doc of documents) {
    const persisted = doc.id ? confirmed?.get(doc.id) : undefined;
    if (persisted) {
      allocations.push({ gainsKind: persisted.gainsKind, allocatedNetAmount: persisted.allocatedNetAmount });
      continue;
    }
    const inferred = inferDocumentAllocation(doc);
    if (inferred.needsReview) pendingReview += 1;
    allocations.push({ gainsKind: inferred.gainsKind, allocatedNetAmount: inferred.allocatedNetAmount });
  }

  return { allocations, pendingReview };
}
