import { describe, expect, it } from 'vitest';
import { buildMonthlyDashboardState } from '../fiscalLedger/monthlyFiscalDashboardState';

describe('buildMonthlyDashboardState', () => {
  it('marca un periodo con IVA sin IIBB como pendiente y bloqueante', () => {
    expect(buildMonthlyDashboardState({
      id: 'periodo-1',
      month: 6,
      vatStatus: 'IN_REVIEW',
      grossIncomeStatus: null,
      documentCount: 12,
    })).toMatchObject({
      status: 'Pendiente IIBB',
      blocking: true,
      tone: 'warning',
    });
  });

  it('alerta una diferencia pendiente contra la presentacion oficial', () => {
    expect(buildMonthlyDashboardState({
      id: 'periodo-2',
      month: 7,
      vatStatus: 'FILED_EXTERNALLY',
      grossIncomeStatus: 'FILED_EXTERNALLY',
      documentCount: 25,
      hasOfficialDifference: true,
    }).alerts).toContain('La diferencia con la declaracion oficial debe justificarse.');
  });
});
