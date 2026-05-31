import { Decimal } from 'decimal.js';
import { FixedAssetInput, FixedAssetCalculationOutput } from '../types';
export function calculateYearsElapsedAtClose(purchaseDate: Date | string | null | undefined, fiscalYear: number): number {
  if (!purchaseDate) return 1;

  const parsedDate = purchaseDate instanceof Date ? purchaseDate : new Date(purchaseDate);
  const purchaseYear = parsedDate.getFullYear();

  if (!Number.isFinite(purchaseYear) || purchaseYear <= 0 || purchaseYear > fiscalYear) {
    return 1;
  }

  return fiscalYear - purchaseYear + 1;
}

/**
 * Calcula la amortización impositiva anual y el valor residual impositivo de un bien de uso,
 * previniendo errores de división por cero y manejando activos totalmente amortizados.
 */
export function calculateFixedAssetDepreciation(
  asset: FixedAssetInput
): FixedAssetCalculationOutput {
  const originalCost = new Decimal(asset.originalCost);
  const usefulLife = asset.usefulLife;
  const yearsElapsed = Math.max(0, asset.yearsElapsed);
  const reexpIndex = new Decimal(asset.customReexpIndex ?? 1.0);

  // Validación robusta para prevenir división por cero en vidas útiles inválidas o nulas
  if (usefulLife <= 0) {
    return {
      id: asset.id,
      name: asset.name,
      annualDepreciationHist: new Decimal(0),
      annualDepreciationAdj: new Decimal(0),
      residualValueHist: originalCost,
      residualValueAdj: originalCost.mul(reexpIndex),
    };
  }

  // Si el bien ya superó su vida útil total, está completamente amortizado
  if (yearsElapsed > usefulLife) {
    return {
      id: asset.id,
      name: asset.name,
      annualDepreciationHist: new Decimal(0),
      annualDepreciationAdj: new Decimal(0),
      residualValueHist: new Decimal(0),
      residualValueAdj: new Decimal(0),
    };
  }

  // Amortización Anual Histórica: Costo de Origen / Vida Útil
  const annualDepreciationHist = originalCost.div(usefulLife);

  // Amortización Anual Reexpresada: Amortización Histórica * Coeficiente IPC correspondiente
  const annualDepreciationAdj = annualDepreciationHist.mul(reexpIndex);

  // Amortización Acumulada Histórica (incluyendo el año actual que se amortiza)
  const yearsDepreciatedAtClose = Math.min(Math.max(yearsElapsed, 1), usefulLife);
  const accumulatedDepreciationHist = annualDepreciationHist.mul(yearsDepreciatedAtClose);

  // Valor Residual Histórico: Costo Origen - Amortización Acumulada Histórica
  let residualValueHist = originalCost.sub(accumulatedDepreciationHist);
  if (residualValueHist.isNegative()) {
    residualValueHist = new Decimal(0);
  }

  // Valor Residual Reexpresado: Valor Residual Histórico * Coeficiente de Reexpresión
  const residualValueAdj = residualValueHist.mul(reexpIndex);

  return {
    id: asset.id,
    name: asset.name,
    annualDepreciationHist: annualDepreciationHist.round(),
    annualDepreciationAdj: annualDepreciationAdj.round(),
    residualValueHist: residualValueHist.round(),
    residualValueAdj: residualValueAdj.round(),
  };
}

/**
 * Procesa una lista de bienes de uso y consolida la amortización total del ejercicio.
 */
export function calculateTotalDepreciation(
  assets: FixedAssetInput[]
): {
  detailedAssets: FixedAssetCalculationOutput[];
  totalDepreciationHist: Decimal;
  totalDepreciationAdj: Decimal;
} {
  let totalDepreciationHist = new Decimal(0);
  let totalDepreciationAdj = new Decimal(0);
  
  const detailedAssets = assets.map(asset => {
    const result = calculateFixedAssetDepreciation(asset);
    totalDepreciationHist = totalDepreciationHist.add(result.annualDepreciationHist);
    totalDepreciationAdj = totalDepreciationAdj.add(result.annualDepreciationAdj);
    return result;
  });

  return {
    detailedAssets,
    totalDepreciationHist,
    totalDepreciationAdj,
  };
}


