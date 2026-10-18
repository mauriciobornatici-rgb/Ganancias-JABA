import { describe, expect, it } from 'vitest';
import { calculateGrossIncomeLivePreview } from '../presentation/grossIncomeLivePreview';

const lines = [
  {
    jurisdictionCode: '902', activityCode: 'A', assignedBase: '500000', taxRate: '0.035000',
    creditsApplied: '21000', favorCarryForward: '0',
  },
  {
    jurisdictionCode: '902', activityCode: 'B', assignedBase: '500000', taxRate: '0.050000',
    creditsApplied: '9000', favorCarryForward: '0',
  },
];

describe('calculateGrossIncomeLivePreview', () => {
  it('coteja el saldo a pagar después de créditos al editar las bases', () => {
    const result = calculateGrossIncomeLivePreview(lines, {
      '902|A': '600000',
      '902|B': '400000',
    }, true);
    expect(result.totalDeterminedTax).toBe(41000);
    expect(result.totalCreditsApplied).toBe(30000);
    expect(result.totalBalanceDue).toBe(11000);
    expect(result.totalFavorCarryForward).toBe(0);
  });

  it('marca bases negativas como inválidas para el guardado', () => {
    const result = calculateGrossIncomeLivePreview(lines, {
      '902|A': '-1',
      '902|B': '1000001',
    }, true);
    expect(result.basesValid).toBe(true);
    expect(result.basesNonNegative).toBe(false);
  });
});
