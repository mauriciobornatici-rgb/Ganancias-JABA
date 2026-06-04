import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import { calculateFixedAssetDepreciation, calculateYearsElapsedAtClose } from '../calculations/amortizaciones';

describe('JABA Amortizaciones de Bienes de Uso', () => {
  it('interpreta anios transcurridos como anios amortizados al cierre igual que la planilla', () => {
    const result = calculateFixedAssetDepreciation({
      id: 'asset-1',
      name: 'Equipamiento',
      type: 'Equipamiento',
      purchaseDate: new Date('2023-01-01'),
      originalCost: new Decimal(1_000),
      usefulLife: 5,
      yearsElapsed: 3,
      customReexpIndex: new Decimal(2),
    });

    expect(result.annualDepreciationHist.toNumber()).toBe(200);
    expect(result.annualDepreciationAdj.toNumber()).toBe(400);
    expect(result.residualValueHist.toNumber()).toBe(400);
    expect(result.residualValueAdj.toNumber()).toBe(800);
  });

  it('activo totalmente amortizado (yearsElapsed == usefulLife) no genera mas depreciacion', () => {
    const result = calculateFixedAssetDepreciation({
      id: 'asset-2',
      name: 'Rodado',
      type: 'Rodado',
      purchaseDate: new Date('2021-01-01'),
      originalCost: new Decimal(1_000),
      usefulLife: 5,
      yearsElapsed: 5,
      customReexpIndex: new Decimal(1),
    });

    // Bien completamente amortizado: cero depreciación y cero residual
    expect(result.annualDepreciationHist.toNumber()).toBe(0);
    expect(result.annualDepreciationAdj.toNumber()).toBe(0);
    expect(result.residualValueHist.toNumber()).toBe(0);
    expect(result.residualValueAdj.toNumber()).toBe(0);
  });

  it('calcula anios al cierre desde fecha de compra y periodo fiscal como la planilla', () => {
    expect(calculateYearsElapsedAtClose('2023-04-10', 2025)).toBe(3);
    expect(calculateYearsElapsedAtClose(new Date('2025-12-31'), 2025)).toBe(1);
    expect(calculateYearsElapsedAtClose('', 2025)).toBe(1);
  });
});
