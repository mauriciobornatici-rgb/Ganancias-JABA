import { Decimal } from 'decimal.js';
import {
  assembleAnnualConsolidation,
  type AnnualConsolidationAssembly,
  type LoadedPeriod,
} from '../fiscalLedger/annualConsolidationAssembler';
import type { GainsAllocationKind, PeriodCotejoStatus } from '../fiscalLedger/annualConsolidation';

/**
 * Lee de la base los 12 períodos mensuales de un contribuyente/año y arma la consolidación anual
 * hacia Ganancias, aplicando la compuerta (solo meses con IVA CLOSED). Es la única capa que toca
 * Prisma; toda la lógica vive en el ensamblador puro `assembleAnnualConsolidation`.
 */

// findMany devuelve `unknown[]` para ser compatible con el PrismaClient real (cuya firma genérica
// no encaja con una forma con relaciones fijas). La forma esperada se asienta luego con un cast.
type PrismaLike = {
  fiscalPeriod: {
    findMany(args: unknown): Promise<unknown[]>;
  };
};

type FiscalPeriodRow = {
  id: string;
  month: number;
  vatSettlements: Array<{ status: string }>;
  grossIncomeSettlements: Array<{ totalDeterminedTax: unknown }>;
  documents: Array<{
    id: string;
    direction: string;
    voucherType: string;
    netAmount: unknown;
    vatLines: Array<{ kind: string; taxableBase: unknown; vatAmount: unknown; creditComputable: boolean }>;
    allocations: Array<{ gainsKind: string; allocatedNetAmount: unknown; needsReview: boolean }>;
  }>;
};

export async function readAnnualConsolidation(
  prisma: PrismaLike,
  clientId: string,
  year: number,
): Promise<AnnualConsolidationAssembly> {
  const periods = (await prisma.fiscalPeriod.findMany({
    where: { clientId, year },
    orderBy: { month: 'asc' },
    select: {
      id: true,
      month: true,
      // Última liquidación de IVA del mes: su estado define si el mes está cotejado (CLOSED).
      vatSettlements: { orderBy: { version: 'desc' }, take: 1, select: { status: true } },
      // IIBB del mes solo si está CLOSED (gasto deducible en Ganancias).
      grossIncomeSettlements: { where: { status: 'CLOSED' }, orderBy: { version: 'desc' }, take: 1, select: { totalDeterminedTax: true } },
      documents: {
        where: { includedInSettlement: true },
        select: {
          id: true,
          direction: true,
          voucherType: true,
          netAmount: true,
          vatLines: { select: { kind: true, taxableBase: true, vatAmount: true, creditComputable: true } },
          allocations: { select: { gainsKind: true, allocatedNetAmount: true, needsReview: true } },
        },
      },
    },
  })) as FiscalPeriodRow[];

  const loaded: LoadedPeriod[] = periods.map(p => ({
    fiscalPeriodId: p.id,
    month: p.month,
    vatStatus: (p.vatSettlements[0]?.status ?? null) as PeriodCotejoStatus['vatStatus'],
    grossIncomeTax: p.grossIncomeSettlements[0]
      ? new Decimal(String(p.grossIncomeSettlements[0].totalDeterminedTax))
      : new Decimal(0),
    documents: p.documents.map(d => ({
      id: d.id,
      direction: d.direction as 'SALE' | 'PURCHASE',
      voucherType: d.voucherType,
      netAmount: new Decimal(String(d.netAmount)),
      vatLines: d.vatLines.map(l => ({
        kind: String(l.kind),
        taxableBase: new Decimal(String(l.taxableBase)),
        vatAmount: new Decimal(String(l.vatAmount)),
        creditComputable: l.creditComputable,
      })),
      allocations: d.allocations.map(a => ({
        gainsKind: a.gainsKind as GainsAllocationKind,
        allocatedNetAmount: new Decimal(String(a.allocatedNetAmount)),
        needsReview: a.needsReview,
      })),
    })),
  }));

  return assembleAnnualConsolidation(loaded);
}

/** Serializa la consolidación a JSON plano (strings de 2 decimales) para la API. */
export function serializeAnnualConsolidation(assembly: AnnualConsolidationAssembly) {
  const c = assembly.consolidation;
  return {
    gate: assembly.gate,
    usedMonths: assembly.usedMonths,
    pendingReviewByMonth: assembly.pendingReviewByMonth,
    consolidation: c
      ? {
          sourceHash: c.sourceHash,
          warnings: c.warnings,
          totals: {
            salesNet: c.totals.salesNet.toFixed(2),
            salesExempt: c.totals.salesExempt.toFixed(2),
            inventoryPurchases: c.totals.inventoryPurchases.toFixed(2),
            deductibleExpenses: c.totals.deductibleExpenses.toFixed(2),
            fixedAssetPurchases: c.totals.fixedAssetPurchases.toFixed(2),
            nonDeductibleExpenses: c.totals.nonDeductibleExpenses.toFixed(2),
            vatNonComputable: c.totals.vatNonComputable.toFixed(2),
            grossIncomeTax: c.totals.grossIncomeTax.toFixed(2),
          },
          periods: c.periods.map(p => ({
            fiscalPeriodId: p.fiscalPeriodId,
            month: p.month,
            salesNet: p.salesNet.toFixed(2),
            salesExempt: p.salesExempt.toFixed(2),
            inventoryPurchases: p.inventoryPurchases.toFixed(2),
            deductibleExpenses: p.deductibleExpenses.toFixed(2),
            fixedAssetPurchases: p.fixedAssetPurchases.toFixed(2),
            nonDeductibleExpenses: p.nonDeductibleExpenses.toFixed(2),
            vatNonComputable: p.vatNonComputable.toFixed(2),
            grossIncomeTax: p.grossIncomeTax.toFixed(2),
          })),
        }
      : null,
  };
}
