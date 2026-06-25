import { Decimal } from 'decimal.js';
import {
  consolidateAnnualFiscalLedger,
  selectCotejadoPeriodsForAnnual,
  type AnnualConsolidationResult,
  type AnnualGateResult,
  type GainsAllocationKind,
  type PeriodAllocation,
  type PeriodCotejoStatus,
} from './annualConsolidation';
import { inferDocumentAllocation, type ImputationDocument } from './gainsImputation';

/**
 * Ensamblador mensual → anual.
 *
 * Toma los 12 períodos ya cargados (estado de cotejo de IVA, IIBB del mes, comprobantes incluidos con
 * su imputación persistida si existe), aplica la COMPUERTA (solo meses con IVA CLOSED alimentan
 * Ganancias) y consolida los meses habilitados. Es PURO: recibe datos ya leídos de la base.
 */

export type LoadedAllocation = {
  gainsKind: GainsAllocationKind;
  allocatedNetAmount: Decimal;
  needsReview: boolean;
};

export type LoadedDocument = ImputationDocument & {
  allocations: LoadedAllocation[];
};

export type LoadedPeriod = {
  fiscalPeriodId: string;
  month: number;
  /** Estado de la última liquidación de IVA del mes (CLOSED = cotejada). */
  vatStatus: PeriodCotejoStatus['vatStatus'];
  /** IIBB determinado del mes (gasto deducible en Ganancias), solo si su liquidación está CLOSED. */
  grossIncomeTax: Decimal;
  documents: LoadedDocument[];
};

export type AnnualConsolidationAssembly = {
  gate: AnnualGateResult;
  /** Consolidación de los meses habilitados; null si ningún mes está cotejado. */
  consolidation: AnnualConsolidationResult | null;
  /** Comprobantes con imputación pendiente de revisión por mes (compras inferidas sin confirmar). */
  pendingReviewByMonth: Array<{ month: number; pending: number }>;
  /** Meses efectivamente usados en la consolidación (los CLOSED). */
  usedMonths: number[];
};

function periodAllocations(doc: LoadedDocument): { allocations: PeriodAllocation[]; pending: number } {
  // Si el comprobante ya tiene imputación persistida, se respeta (puede venir dividida en varias).
  if (doc.allocations.length > 0) {
    const pending = doc.allocations.some(a => a.needsReview) ? 1 : 0;
    return {
      allocations: doc.allocations.map(a => ({ gainsKind: a.gainsKind, allocatedNetAmount: a.allocatedNetAmount })),
      pending,
    };
  }
  // Sin imputación: se infiere y se cuenta como pendiente de revisión si corresponde.
  const inferred = inferDocumentAllocation(doc);
  return {
    allocations: [{ gainsKind: inferred.gainsKind, allocatedNetAmount: inferred.allocatedNetAmount }],
    pending: inferred.needsReview ? 1 : 0,
  };
}

export function assembleAnnualConsolidation(periods: LoadedPeriod[]): AnnualConsolidationAssembly {
  const gate = selectCotejadoPeriodsForAnnual(periods.map(p => ({ month: p.month, vatStatus: p.vatStatus })));
  const usable = new Set(gate.usableMonths);

  const pendingReviewByMonth: Array<{ month: number; pending: number }> = [];
  const consolidationInput = periods
    .filter(p => usable.has(p.month))
    .map(period => {
      let pending = 0;
      const allocations: PeriodAllocation[] = [];
      for (const doc of period.documents) {
        const built = periodAllocations(doc);
        allocations.push(...built.allocations);
        pending += built.pending;
      }
      if (pending > 0) pendingReviewByMonth.push({ month: period.month, pending });
      return {
        fiscalPeriodId: period.fiscalPeriodId,
        month: period.month,
        allocations,
        grossIncomeTax: period.grossIncomeTax ?? new Decimal(0),
      };
    });

  const consolidation = consolidationInput.length > 0 ? consolidateAnnualFiscalLedger(consolidationInput) : null;

  return {
    gate,
    consolidation,
    pendingReviewByMonth,
    usedMonths: gate.usableMonths,
  };
}
