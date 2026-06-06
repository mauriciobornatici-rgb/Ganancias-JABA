import { describe, expect, it } from 'vitest';
import {
  buildFixedAssetDepreciationForPresentation,
  isWizardFixedAssetRetired,
} from '../presentation/fixedAssetPresentation';

describe('fixed asset presentation helpers', () => {
  it('normaliza el indicador de baja sin confundir el string false con true', () => {
    expect(isWizardFixedAssetRetired({ isRetired: true })).toBe(true);
    expect(isWizardFixedAssetRetired({ isRetired: 'true' })).toBe(true);
    expect(isWizardFixedAssetRetired({ isRetired: 'TRUE' })).toBe(true);

    expect(isWizardFixedAssetRetired({ isRetired: false })).toBe(false);
    expect(isWizardFixedAssetRetired({ isRetired: 'false' })).toBe(false);
    expect(isWizardFixedAssetRetired({})).toBe(false);
  });

  it('usa el motor de amortizaciones para exponer amortizacion anual y perdida por baja', () => {
    const active = buildFixedAssetDepreciationForPresentation({
      id: 'active',
      name: 'Maquina activa',
      type: 'Equipamiento',
      purchaseDate: '2024-01-01',
      originalCost: '1000',
      usefulLife: '5',
      yearsElapsed: '1',
      customReexpIndex: '1.5',
      isRetired: 'false',
    });

    expect(active.isRetired).toBe(false);
    expect(active.annualDepreciationAdj.toNumber()).toBe(300);

    const retired = buildFixedAssetDepreciationForPresentation({
      id: 'retired',
      name: 'Maquina dada de baja',
      type: 'Equipamiento',
      purchaseDate: '2023-01-01',
      originalCost: '1000',
      usefulLife: '10',
      yearsElapsed: '3',
      customReexpIndex: '1',
      isRetired: 'true',
    });

    expect(retired.isRetired).toBe(true);
    expect(retired.accumulatedDepHistAtStart.toNumber()).toBe(200);
    expect(retired.bajaLossHist.toNumber()).toBe(800);
    expect(retired.bajaLossAdj.toNumber()).toBe(800);
  });
});
