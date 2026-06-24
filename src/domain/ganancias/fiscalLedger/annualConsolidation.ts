import { Decimal } from 'decimal.js';

/**
 * Consolidación anual del libro fiscal mensual hacia Ganancias 3ª categoría.
 *
 * Toma los 12 períodos mensuales (cada uno con sus comprobantes ya imputados a una categoría de
 * Ganancias) y agrega los netos por categoría, produciendo el snapshot que alimenta el motor anual.
 * Es una función PURA: la imputación de cada comprobante (gainsKind) es input, no se decide aquí.
 *
 * Fidelidad fiscal:
 *  - El IVA es neutro en Ganancias: solo viajan los NETOS (sin IVA).
 *  - El IVA de compras NO computable se suma al costo deducible (`vatNonComputable`).
 *  - El IIBB pagado del mes (`grossIncomeTax`) es gasto deducible en Ganancias.
 *  - Las percepciones/retenciones de IVA/IIBB NO entran a Ganancias; solo las de Ganancias.
 */

export type GainsAllocationKind =
  | 'SALE_TAXED'
  | 'SALE_EXEMPT'
  | 'INVENTORY_PURCHASE'
  | 'DEDUCTIBLE_EXPENSE'
  | 'FIXED_ASSET'
  | 'NON_DEDUCTIBLE'
  | 'VAT_NON_COMPUTABLE'
  | 'OTHER';

export type PeriodAllocation = {
  gainsKind: GainsAllocationKind;
  allocatedNetAmount: Decimal;
};

export type PeriodConsolidationInput = {
  fiscalPeriodId: string;
  month: number;
  allocations: PeriodAllocation[];
  /** IIBB pagado/determinado del mes (gasto deducible en Ganancias). */
  grossIncomeTax?: Decimal;
};

export type ConsolidationTotals = {
  salesNet: Decimal;
  salesExempt: Decimal;
  inventoryPurchases: Decimal;
  deductibleExpenses: Decimal;
  fixedAssetPurchases: Decimal;
  nonDeductibleExpenses: Decimal;
  vatNonComputable: Decimal;
  grossIncomeTax: Decimal;
};

export type PeriodConsolidationResult = ConsolidationTotals & {
  fiscalPeriodId: string;
  month: number;
};

export type AnnualConsolidationResult = {
  periods: PeriodConsolidationResult[];
  totals: ConsolidationTotals;
  /** Huella de la base consolidada: si cambia, hay que reconsolidar antes de usar en Ganancias. */
  sourceHash: string;
  warnings: string[];
};

function zeroTotals(): ConsolidationTotals {
  return {
    salesNet: new Decimal(0),
    salesExempt: new Decimal(0),
    inventoryPurchases: new Decimal(0),
    deductibleExpenses: new Decimal(0),
    fixedAssetPurchases: new Decimal(0),
    nonDeductibleExpenses: new Decimal(0),
    vatNonComputable: new Decimal(0),
    grossIncomeTax: new Decimal(0),
  };
}

function addAllocation(totals: ConsolidationTotals, allocation: PeriodAllocation): void {
  const amount = allocation.allocatedNetAmount;
  switch (allocation.gainsKind) {
    case 'SALE_TAXED':
      totals.salesNet = totals.salesNet.add(amount);
      break;
    case 'SALE_EXEMPT':
      totals.salesExempt = totals.salesExempt.add(amount);
      break;
    case 'INVENTORY_PURCHASE':
      totals.inventoryPurchases = totals.inventoryPurchases.add(amount);
      break;
    case 'DEDUCTIBLE_EXPENSE':
      totals.deductibleExpenses = totals.deductibleExpenses.add(amount);
      break;
    case 'FIXED_ASSET':
      totals.fixedAssetPurchases = totals.fixedAssetPurchases.add(amount);
      break;
    case 'NON_DEDUCTIBLE':
      totals.nonDeductibleExpenses = totals.nonDeductibleExpenses.add(amount);
      break;
    case 'VAT_NON_COMPUTABLE':
      totals.vatNonComputable = totals.vatNonComputable.add(amount);
      break;
    case 'OTHER':
    default:
      // 'OTHER' no se agrega a ninguna categoría fiscal; se contabiliza vía warning.
      break;
  }
}

/** Hash determinista (djb2) sobre la serialización ordenada de la base consolidada. */
function buildSourceHash(periods: PeriodConsolidationResult[]): string {
  const serialized = periods
    .slice()
    .sort((a, b) => a.month - b.month)
    .map(p =>
      [
        p.fiscalPeriodId,
        p.month,
        p.salesNet.toFixed(2),
        p.salesExempt.toFixed(2),
        p.inventoryPurchases.toFixed(2),
        p.deductibleExpenses.toFixed(2),
        p.fixedAssetPurchases.toFixed(2),
        p.nonDeductibleExpenses.toFixed(2),
        p.vatNonComputable.toFixed(2),
        p.grossIncomeTax.toFixed(2),
      ].join(':'),
    )
    .join('|');

  let hash = 5381;
  for (let i = 0; i < serialized.length; i += 1) {
    hash = ((hash << 5) + hash + serialized.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Estado de cotejo de un mes para decidir si puede alimentar la liquidación anual de Ganancias. */
export type PeriodCotejoStatus = {
  month: number;
  /** Estado de la última liquidación de IVA del mes (CLOSED = cotejada contra AFIP). */
  vatStatus: 'DRAFT' | 'IN_REVIEW' | 'READY_TO_FILE' | 'FILED_EXTERNALLY' | 'CLOSED' | 'ANNULLED' | null;
};

export type AnnualGateResult = {
  /** Meses cotejados (CLOSED): los únicos cuyos valores pueden usarse en la liquidación anual. */
  usableMonths: number[];
  /** Meses que NO pueden usarse todavía, con el motivo. */
  blockedMonths: Array<{ month: number; reason: string }>;
  /** true solo si los 12 meses están cotejados: el año puede liquidarse con datos firmes. */
  canConsolidateYear: boolean;
  warnings: string[];
};

const VAT_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'borrador sin cotejar',
  IN_REVIEW: 'en revisión (cotejo con diferencias)',
  READY_TO_FILE: 'lista para presentar pero sin cerrar',
  FILED_EXTERNALLY: 'presentada pero no marcada como cerrada',
  ANNULLED: 'anulada',
};

/**
 * Compuerta de integración mensual → anual.
 *
 * Regla de negocio (pedido del contador): a la liquidación anual de Ganancias SOLO entran los meses
 * cuya liquidación de IVA fue COTEJADA contra AFIP y guardada como CLOSED. Un mes en borrador, en
 * revisión o inexistente no aporta sus valores: se informa para que el usuario lo cierre antes de
 * liquidar el año. Esto evita arrastrar a Ganancias números que todavía no coinciden con ARCA.
 */
export function selectCotejadoPeriodsForAnnual(periods: PeriodCotejoStatus[]): AnnualGateResult {
  const byMonth = new Map(periods.map(p => [p.month, p]));
  const usableMonths: number[] = [];
  const blockedMonths: Array<{ month: number; reason: string }> = [];

  for (let month = 1; month <= 12; month += 1) {
    const entry = byMonth.get(month);
    if (!entry || entry.vatStatus === null) {
      blockedMonths.push({ month, reason: 'Sin liquidación de IVA cargada.' });
    } else if (entry.vatStatus === 'CLOSED') {
      usableMonths.push(month);
    } else {
      blockedMonths.push({ month, reason: `IVA ${VAT_STATUS_LABEL[entry.vatStatus] ?? entry.vatStatus}; falta cotejar y cerrar.` });
    }
  }

  const warnings: string[] = [];
  if (blockedMonths.length > 0) {
    warnings.push(
      `No se puede liquidar el año con datos firmes: ${blockedMonths.length} mes(es) sin cotejar (${blockedMonths
        .map(b => String(b.month).padStart(2, '0'))
        .join(', ')}).`,
    );
  }

  return {
    usableMonths,
    blockedMonths,
    canConsolidateYear: blockedMonths.length === 0,
    warnings,
  };
}

export function consolidateAnnualFiscalLedger(
  periodsInput: PeriodConsolidationInput[],
): AnnualConsolidationResult {
  const warnings: string[] = [];

  const seenMonths = new Set<number>();
  for (const period of periodsInput) {
    if (seenMonths.has(period.month)) {
      warnings.push(`Mes ${String(period.month).padStart(2, '0')} repetido en la consolidación.`);
    }
    seenMonths.add(period.month);
  }
  if (periodsInput.length > 0 && periodsInput.length < 12) {
    const faltantes = [];
    for (let m = 1; m <= 12; m += 1) {
      if (!seenMonths.has(m)) faltantes.push(String(m).padStart(2, '0'));
    }
    if (faltantes.length > 0) {
      warnings.push(`Faltan períodos mensuales para consolidar el año: ${faltantes.join(', ')}.`);
    }
  }

  const periods: PeriodConsolidationResult[] = periodsInput.map(period => {
    const totals = zeroTotals();
    period.allocations.forEach(allocation => addAllocation(totals, allocation));
    totals.grossIncomeTax = totals.grossIncomeTax.add(period.grossIncomeTax ?? new Decimal(0));

    const hasOther = period.allocations.some(a => a.gainsKind === 'OTHER');
    if (hasOther) {
      warnings.push(
        `Mes ${String(period.month).padStart(2, '0')}: hay comprobantes con imputación "OTHER" sin categoría fiscal; revíselos antes de cerrar el año.`,
      );
    }

    return { fiscalPeriodId: period.fiscalPeriodId, month: period.month, ...totals };
  });

  const totals = periods.reduce<ConsolidationTotals>((acc, period) => {
    acc.salesNet = acc.salesNet.add(period.salesNet);
    acc.salesExempt = acc.salesExempt.add(period.salesExempt);
    acc.inventoryPurchases = acc.inventoryPurchases.add(period.inventoryPurchases);
    acc.deductibleExpenses = acc.deductibleExpenses.add(period.deductibleExpenses);
    acc.fixedAssetPurchases = acc.fixedAssetPurchases.add(period.fixedAssetPurchases);
    acc.nonDeductibleExpenses = acc.nonDeductibleExpenses.add(period.nonDeductibleExpenses);
    acc.vatNonComputable = acc.vatNonComputable.add(period.vatNonComputable);
    acc.grossIncomeTax = acc.grossIncomeTax.add(period.grossIncomeTax);
    return acc;
  }, zeroTotals());

  return {
    periods,
    totals,
    sourceHash: buildSourceHash(periods),
    warnings,
  };
}
