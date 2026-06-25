import type { AnnualConsolidationAssembly } from '../fiscalLedger/annualConsolidationAssembler';

/**
 * Persistencia del snapshot de consolidación anual hacia una DDJJ de Ganancias (`TaxReturn`).
 *
 * El snapshot congela los totales por categoría (netos, IVA no computable, IIBB) que alimentan la
 * liquidación anual, junto con su `sourceHash`: si la base mensual cambia (se recotejó un mes, se
 * editó una imputación), el hash difiere y hay que regenerar el snapshot antes de usarlo en la DDJJ.
 *
 * Reglas de seguridad:
 *  - Solo se persiste si hay al menos un mes cotejado (consolidación no nula).
 *  - Se CONFIRMA (confirmedAt) únicamente si el año está completo y firme (todos los meses CLOSED).
 *  - Idempotente: si ya existe un snapshot con el mismo `sourceHash` para esa DDJJ, no se duplica.
 */

type SnapshotStore = {
  annualFiscalConsolidationSnapshot: {
    findFirst(args: unknown): Promise<{ id: string; sourceHash: string; confirmedAt: Date | null } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string; sourceHash: string; confirmedAt: Date | null }>;
  };
};

export type PersistSnapshotResult = {
  id: string;
  sourceHash: string;
  confirmed: boolean;
  reused: boolean;
};

export async function persistAnnualConsolidationSnapshot(
  store: SnapshotStore,
  taxReturnId: string,
  assembly: AnnualConsolidationAssembly,
  options?: { confirm?: boolean },
): Promise<PersistSnapshotResult> {
  const c = assembly.consolidation;
  if (!c) {
    throw new Error('No hay meses cotejados (CLOSED) para consolidar; no se puede generar el snapshot.');
  }

  // Idempotencia: si ya hay un snapshot vigente con el mismo hash para esta DDJJ, se reutiliza.
  const existing = await store.annualFiscalConsolidationSnapshot.findFirst({
    where: { taxReturnId, sourceHash: c.sourceHash },
    select: { id: true, sourceHash: true, confirmedAt: true },
  });
  if (existing) {
    return { id: existing.id, sourceHash: existing.sourceHash, confirmed: existing.confirmedAt !== null, reused: true };
  }

  // Solo se confirma si el año está completo y firme.
  const confirmedAt = options?.confirm && assembly.gate.canConsolidateYear ? new Date() : null;

  const created = await store.annualFiscalConsolidationSnapshot.create({
    data: {
      taxReturnId,
      sourceHash: c.sourceHash,
      salesNet: c.totals.salesNet.toFixed(2),
      inventoryPurchases: c.totals.inventoryPurchases.toFixed(2),
      deductibleExpenses: c.totals.deductibleExpenses.toFixed(2),
      fixedAssetPurchases: c.totals.fixedAssetPurchases.toFixed(2),
      nonDeductibleExpenses: c.totals.nonDeductibleExpenses.toFixed(2),
      vatNonComputable: c.totals.vatNonComputable.toFixed(2),
      grossIncomeTax: c.totals.grossIncomeTax.toFixed(2),
      confirmedAt,
      periods: {
        create: c.periods.map(p => ({
          fiscalPeriodId: p.fiscalPeriodId,
          month: p.month,
          salesNet: p.salesNet.toFixed(2),
          inventoryPurchases: p.inventoryPurchases.toFixed(2),
          deductibleExpenses: p.deductibleExpenses.toFixed(2),
          fixedAssetPurchases: p.fixedAssetPurchases.toFixed(2),
          nonDeductibleExpenses: p.nonDeductibleExpenses.toFixed(2),
          vatNonComputable: p.vatNonComputable.toFixed(2),
          grossIncomeTax: p.grossIncomeTax.toFixed(2),
        })),
      },
    },
  });

  return { id: created.id, sourceHash: created.sourceHash, confirmed: created.confirmedAt !== null, reused: false };
}

/**
 * Indica si un snapshot persistido quedó OBSOLETO frente a la base mensual actual.
 * Si el hash guardado difiere del recién calculado, hay que regenerar antes de usar en la DDJJ.
 */
export function isSnapshotStale(persistedSourceHash: string | null | undefined, current: AnnualConsolidationAssembly): boolean {
  if (!current.consolidation) return true;
  return persistedSourceHash !== current.consolidation.sourceHash;
}
