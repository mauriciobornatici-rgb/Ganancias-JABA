import { describe, expect, it } from 'vitest';
import { createFiscalPeriodSchema } from '../fiscalLedger/fiscalPeriodRequest';

describe('createFiscalPeriodSchema', () => {
  it('coerciona un periodo mensual valido para la API', () => {
    const result = createFiscalPeriodSchema.safeParse({ year: '2025', month: '6' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ year: 2025, month: 6 });
    }
  });

  it('rechaza meses fuera del calendario y anos no operativos', () => {
    expect(createFiscalPeriodSchema.safeParse({ year: 2019, month: 6 }).success).toBe(false);
    expect(createFiscalPeriodSchema.safeParse({ year: 2025, month: 13 }).success).toBe(false);
  });
});
