import { Decimal } from 'decimal.js';
import { calculateFixedAssetDepreciation } from '../calculations/amortizaciones';
import type { FixedAssetInput } from '../types';

type RawFixedAsset = Record<string, unknown>;

function decimalValue(value: unknown, fallback: Decimal.Value = 0): Decimal {
  if (value instanceof Decimal) return value;
  if (value === null || value === undefined || value === '') return new Decimal(fallback);
  try {
    return new Decimal(value as Decimal.Value);
  } catch {
    return new Decimal(fallback);
  }
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function dateValue(value: unknown): Date {
  const parsed = value instanceof Date
    ? value
    : new Date(typeof value === 'string' || typeof value === 'number' ? value : Date.now());

  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function fixedAssetType(value: unknown): FixedAssetInput['type'] {
  const rawType = stringValue(value, 'Otro');
  if (rawType === 'Rodado' || rawType === 'Inmueble' || rawType === 'Equipamiento' || rawType === 'Otro') {
    return rawType;
  }
  return 'Otro';
}

export function isWizardFixedAssetRetired(asset: { isRetired?: unknown }): boolean {
  if (asset.isRetired === true) return true;
  if (typeof asset.isRetired === 'string') return asset.isRetired.toLowerCase() === 'true';
  return false;
}

export function normalizeFixedAssetForCalculation(asset: RawFixedAsset): FixedAssetInput {
  return {
    id: stringValue(asset.id),
    name: stringValue(asset.name),
    type: fixedAssetType(asset.type),
    purchaseDate: dateValue(asset.purchaseDate),
    originalCost: decimalValue(asset.originalCost),
    usefulLife: numberValue(asset.usefulLife, 10),
    yearsElapsed: numberValue(asset.yearsElapsed),
    customReexpIndex: decimalValue(asset.customReexpIndex, 1),
    isRetired: isWizardFixedAssetRetired(asset),
  };
}

export function buildFixedAssetDepreciationForPresentation(asset: RawFixedAsset) {
  const normalized = normalizeFixedAssetForCalculation(asset);
  const depreciation = calculateFixedAssetDepreciation(normalized);
  const bajaLossHist = depreciation.bajaLossHist ?? new Decimal(0);

  return {
    ...normalized,
    ...depreciation,
    accumulatedDepHistAtStart: depreciation.isRetired
      ? Decimal.max(normalized.originalCost.sub(bajaLossHist), new Decimal(0))
      : new Decimal(0),
    bajaLossHist,
    bajaLossAdj: depreciation.bajaLossAdj ?? new Decimal(0),
  };
}
