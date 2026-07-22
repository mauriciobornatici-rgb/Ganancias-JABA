import { describe, expect, it } from 'vitest';
import {
  buildFiscalPeriodSourceMutationDecision,
  buildSettlementReopenPlan,
} from '../workflow/fiscalPeriodWorkflow';

describe('fiscalPeriodWorkflow', () => {
  it('permite modificar fuentes mientras no haya liquidaciones cerradas', () => {
    expect(buildFiscalPeriodSourceMutationDecision({ vatStatus: 'DRAFT', grossIncomeStatus: 'DRAFT' }))
      .toEqual({ allowed: true });
  });

  it.each([
    ['CLOSED', 'DRAFT', 'IVA'],
    ['DRAFT', 'CLOSED', 'IIBB'],
    ['CLOSED', 'CLOSED', 'IVA e IIBB'],
  ])('congela el período cuando IVA o IIBB están cerrados', (vatStatus, grossIncomeStatus, expected) => {
    const decision = buildFiscalPeriodSourceMutationDecision({ vatStatus, grossIncomeStatus });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('El período cerrado debió quedar congelado.');
    expect(decision.httpStatus).toBe(409);
    expect(decision.error).toContain(expected);
  });
});

describe('buildSettlementReopenPlan (Reliquidar / Modificar)', () => {
  it('reabre solo lo que está CERRADO', () => {
    expect(buildSettlementReopenPlan({ vatStatus: 'CLOSED', grossIncomeStatus: 'CLOSED' }))
      .toEqual({ reopenVat: true, reopenGrossIncome: true });
    expect(buildSettlementReopenPlan({ vatStatus: 'CLOSED', grossIncomeStatus: 'IN_REVIEW' }))
      .toEqual({ reopenVat: true, reopenGrossIncome: false });
  });

  it('no toca nada si no hay liquidaciones cerradas (idempotente)', () => {
    expect(buildSettlementReopenPlan({ vatStatus: 'IN_REVIEW', grossIncomeStatus: undefined }))
      .toEqual({ reopenVat: false, reopenGrossIncome: false });
    expect(buildSettlementReopenPlan({}))
      .toEqual({ reopenVat: false, reopenGrossIncome: false });
  });

  it('tras reabrir, el guard de mutación vuelve a permitir la carga', () => {
    // El estado al que lleva la reapertura (IN_REVIEW) debe destrabar los imports.
    expect(buildFiscalPeriodSourceMutationDecision({ vatStatus: 'IN_REVIEW', grossIncomeStatus: 'IN_REVIEW' }).allowed).toBe(true);
  });
});
