import { buildUsefulCoefficientsFromIndexes } from '../mappers/taxParameterUsefulCoefficients';
import type {
  ActiveTaxParameters,
  WizardIpcIndex,
  WizardParameterScalar,
  WizardTaxParameterSet,
} from './wizardStateTypes';

type LocalIpcValues = Record<string, string>;

type WizardEffectiveCalculationParamsInput = {
  activeParams: ActiveTaxParameters | null;
  fallbackParameterSet: WizardTaxParameterSet;
  fallbackBrackets: Array<Record<string, unknown>>;
  fiscalYear: number;
  localIpcValues: LocalIpcValues;
};

type WizardEffectiveCalculationParams = {
  parameterSet: WizardTaxParameterSet;
  brackets: Array<Record<string, unknown>>;
  indices: Array<{ monthIndex: number; ipcValue: string }>;
  usefulCoefficients: Record<string, unknown>;
};

type WizardAxiDynamicReconciliationInput = {
  theoreticalCapital: number;
  realCapital: number;
};

export type WizardAxiDynamicReconciliation = {
  signedDifference: number;
  absoluteAmount: number;
  label: 'Retiro' | 'Aporte' | 'Sin diferencia';
  movementType: 'RetiroSocio' | 'AporteCapital' | 'Otro';
};

export function isMissingIpcWarning(warning: string): boolean {
  const normalized = warning
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return normalized.includes('axi estatico') && normalized.includes('indices ipc');
}

function asPositiveNumberString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? normalized : null;
}

export function normalizeWizardIpcValue(value: unknown, fallback = '0'): string {
  const normalized = String(value ?? fallback).replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? normalized : fallback;
}

function monthIndex(value: WizardParameterScalar): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : null;
}

function findActiveIndexValue(activeIndices: WizardIpcIndex[], targetMonthIndex: number): string | null {
  const found = activeIndices.find(index => monthIndex(index.monthIndex) === targetMonthIndex);
  return asPositiveNumberString(found?.ipcValue);
}

function previousDecemberFromActiveParams(activeParams: ActiveTaxParameters | null): string | null {
  const previous = activeParams?.previousDecemberIndex;
  if (!previous || typeof previous !== 'object') return null;
  return asPositiveNumberString((previous as Record<string, unknown>).ipcValue);
}

function hasUsableParameterSet(parameterSet: ActiveTaxParameters['parameterSet']): parameterSet is WizardTaxParameterSet {
  return !!parameterSet && Object.keys(parameterSet).length > 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function buildWizardEffectiveCalculationParams({
  activeParams,
  fallbackParameterSet,
  fallbackBrackets,
  fiscalYear,
  localIpcValues,
}: WizardEffectiveCalculationParamsInput): WizardEffectiveCalculationParams {
  const activeIndices = activeParams?.indices ?? [];

  const indices = Array.from({ length: 12 }, (_, index) => {
    const currentMonth = index + 1;
    const localValue = asPositiveNumberString(localIpcValues[`${fiscalYear}_${currentMonth}`]);
    const activeValue = findActiveIndexValue(activeIndices, currentMonth);
    const ipcValue = localValue ?? activeValue;
    return ipcValue ? { monthIndex: currentMonth, ipcValue } : null;
  }).filter((item): item is { monthIndex: number; ipcValue: string } => item !== null);

  const previousDecemberValue =
    asPositiveNumberString(localIpcValues[`${fiscalYear - 1}_12`]) ??
    previousDecemberFromActiveParams(activeParams);

  const derivedUsefulCoefficients = buildUsefulCoefficientsFromIndexes(
    indices,
    previousDecemberValue ? { monthIndex: 12, ipcValue: previousDecemberValue } : null,
  );

  return {
    parameterSet: hasUsableParameterSet(activeParams?.parameterSet)
      ? activeParams.parameterSet
      : fallbackParameterSet,
    brackets: activeParams?.brackets && activeParams.brackets.length > 0
      ? activeParams.brackets
      : fallbackBrackets,
    indices,
    usefulCoefficients: {
      ...(activeParams?.usefulCoefficients && typeof activeParams.usefulCoefficients === 'object'
        ? activeParams.usefulCoefficients as Record<string, unknown>
        : {}),
      ...derivedUsefulCoefficients,
    },
  };
}

export function buildWizardAxiDynamicReconciliation({
  theoreticalCapital,
  realCapital,
}: WizardAxiDynamicReconciliationInput): WizardAxiDynamicReconciliation {
  const signedDifference = roundMoney(theoreticalCapital - realCapital);
  const absoluteAmount = Math.abs(signedDifference);

  if (signedDifference === 0) {
    return {
      signedDifference,
      absoluteAmount,
      label: 'Sin diferencia',
      movementType: 'Otro',
    };
  }

  return {
    signedDifference,
    absoluteAmount,
    label: signedDifference > 0 ? 'Retiro' : 'Aporte',
    movementType: signedDifference > 0 ? 'RetiroSocio' : 'AporteCapital',
  };
}
