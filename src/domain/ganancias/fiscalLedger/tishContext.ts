import type { TishBimester } from './tish';
import { monthsOfBimester } from './tish';

export type TishCalculationState =
  | 'NOT_APPLICABLE'
  | 'PROFILE_REQUIRED'
  | 'CONFIGURATION_REQUIRED'
  | 'ACTIVITY_REQUIRED'
  | 'PRELIMINARY'
  | 'READY';

export type TishBimesterSourceState = 'NO_SOURCE' | 'PRELIMINARY' | 'FINAL';

export type TishCalculationContext = {
  state: TishCalculationState;
  canPreview: boolean;
  canFinalize: boolean;
};

export function evaluateTishCalculationContext(input: {
  hasProfile: boolean;
  vatCondition: string | null;
  hasCompleteSetting: boolean;
  markedActivityCount: number;
  monthsWithSettlement: number[];
  closedMonths: number[];
}): TishCalculationContext {
  if (!input.hasProfile) {
    return { state: 'PROFILE_REQUIRED', canPreview: false, canFinalize: false };
  }
  if (input.vatCondition !== 'RESPONSABLE_INSCRIPTO') {
    return { state: 'NOT_APPLICABLE', canPreview: false, canFinalize: false };
  }
  if (!input.hasCompleteSetting) {
    return { state: 'CONFIGURATION_REQUIRED', canPreview: false, canFinalize: false };
  }
  if (input.markedActivityCount === 0) {
    return { state: 'ACTIVITY_REQUIRED', canPreview: false, canFinalize: false };
  }

  const closed = new Set(input.closedMonths);
  const allMonthsClosed = Array.from({ length: 12 }, (_, index) => index + 1)
    .every(month => closed.has(month));

  return {
    state: allMonthsClosed ? 'READY' : 'PRELIMINARY',
    canPreview: true,
    canFinalize: allMonthsClosed,
  };
}

export function tishBimesterSourceState(
  bimester: TishBimester,
  monthsWithSettlement: number[],
  closedMonths: number[],
): TishBimesterSourceState {
  const months = monthsOfBimester(bimester);
  const available = new Set(monthsWithSettlement);
  const closed = new Set(closedMonths);

  if (months.every(month => closed.has(month))) return 'FINAL';
  if (months.some(month => available.has(month))) return 'PRELIMINARY';
  return 'NO_SOURCE';
}
