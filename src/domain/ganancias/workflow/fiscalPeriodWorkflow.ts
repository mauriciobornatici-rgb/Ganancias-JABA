export type FiscalPeriodMutationDecision =
  | { allowed: true }
  | { allowed: false; httpStatus: 409; error: string };

export function buildFiscalPeriodSourceMutationDecision({
  vatStatus,
  grossIncomeStatus,
}: {
  vatStatus?: string | null;
  grossIncomeStatus?: string | null;
}): FiscalPeriodMutationDecision {
  const closedTaxes = [
    vatStatus === 'CLOSED' ? 'IVA' : null,
    grossIncomeStatus === 'CLOSED' ? 'IIBB' : null,
  ].filter((value): value is string => Boolean(value));

  if (closedTaxes.length === 0) return { allowed: true };

  return {
    allowed: false,
    httpStatus: 409,
    error: `El período está cerrado para ${closedTaxes.join(' e ')}. Reabrí o rectificá la liquidación antes de modificar comprobantes o créditos fiscales.`,
  };
}

export type SettlementReopenPlan = {
  reopenVat: boolean;
  reopenGrossIncome: boolean;
};

/**
 * Qué liquidaciones hay que reabrir (CLOSED → IN_REVIEW) cuando el usuario entra a
 * "Reliquidar / Modificar". Solo las cerradas: una en borrador o revisión ya permite
 * modificar las fuentes del período. El cierre nuevo se crea después como versión+1.
 */
export function buildSettlementReopenPlan({
  vatStatus,
  grossIncomeStatus,
}: {
  vatStatus?: string | null;
  grossIncomeStatus?: string | null;
}): SettlementReopenPlan {
  return {
    reopenVat: vatStatus === 'CLOSED',
    reopenGrossIncome: grossIncomeStatus === 'CLOSED',
  };
}
