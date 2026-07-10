import { describe, expect, it } from 'vitest';
import { buildFiscalPeriodSourceMutationDecision } from '../workflow/fiscalPeriodWorkflow';

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
