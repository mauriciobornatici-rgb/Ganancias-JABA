type SettlementStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'READY_TO_FILE'
  | 'FILED_EXTERNALLY'
  | 'CLOSED'
  | 'ANNULLED'
  | null;

export type MonthlyFiscalDashboardPeriod = {
  id: string;
  month: number;
  vatStatus: SettlementStatus;
  grossIncomeStatus: SettlementStatus;
  documentCount: number;
  hasOfficialDifference?: boolean;
};

export type MonthlyFiscalDashboardState = {
  status: string;
  blocking: boolean;
  tone: 'neutral' | 'warning' | 'success';
  alerts: string[];
};

function isCompleted(status: SettlementStatus): boolean {
  return status === 'FILED_EXTERNALLY' || status === 'CLOSED';
}

export function buildMonthlyDashboardState(
  period: MonthlyFiscalDashboardPeriod,
): MonthlyFiscalDashboardState {
  const alerts: string[] = [];

  if (period.hasOfficialDifference) {
    alerts.push('La diferencia con la declaracion oficial debe justificarse.');
  }

  if (period.documentCount === 0) {
    alerts.push('El periodo todavia no tiene comprobantes importados.');
  }

  if (!period.vatStatus) {
    return { status: 'Pendiente IVA', blocking: true, tone: 'warning', alerts };
  }

  if (!period.grossIncomeStatus) {
    return { status: 'Pendiente IIBB', blocking: true, tone: 'warning', alerts };
  }

  if (isCompleted(period.vatStatus) && isCompleted(period.grossIncomeStatus) && alerts.length === 0) {
    return { status: 'Completo', blocking: false, tone: 'success', alerts };
  }

  return {
    status: 'En revision',
    blocking: period.hasOfficialDifference === true,
    tone: period.hasOfficialDifference ? 'warning' : 'neutral',
    alerts,
  };
}
