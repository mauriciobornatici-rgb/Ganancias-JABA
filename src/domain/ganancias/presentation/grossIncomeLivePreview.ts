import { parseMoneyToPlain } from './parseMoney';

export type GrossIncomeLiveLine = {
  jurisdictionCode: string;
  activityCode: string;
  assignedBase: string;
  taxRate: string;
  creditsApplied: string;
  favorCarryForward: string;
};

export type GrossIncomeLiveTotals = {
  determinedByLine: Record<string, number>;
  totalAssignedBase: number;
  totalDeterminedTax: number;
  totalCreditsApplied: number;
  totalBalanceDue: number;
  totalFavorCarryForward: number;
  basesValid: boolean;
  basesNonNegative: boolean;
};

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/** Recalcula el cotejo visible mientras el usuario edita las bases por actividad. */
export function calculateGrossIncomeLivePreview(
  lines: ReadonlyArray<GrossIncomeLiveLine>,
  activityBases: Readonly<Record<string, string>>,
  useOverrides: boolean,
): GrossIncomeLiveTotals {
  const determinedByLine: Record<string, number> = {};
  const jurisdictions = new Map<string, { determined: number; creditsAvailable: number }>();
  let totalAssignedBase = 0;
  let basesValid = true;
  let basesNonNegative = true;

  for (const line of lines) {
    const key = `${line.jurisdictionCode}|${line.activityCode}`;
    const rawBase = useOverrides ? (activityBases[key] ?? line.assignedBase) : line.assignedBase;
    const plainBase = parseMoneyToPlain(rawBase);
    const base = plainBase == null ? Number.NaN : Number(plainBase);
    if (!Number.isFinite(base)) basesValid = false;
    if (Number.isFinite(base) && base < 0) basesNonNegative = false;
    const safeBase = Number.isFinite(base) ? base : 0;
    const determined = roundMoney(safeBase * Number(line.taxRate));
    determinedByLine[key] = determined;
    totalAssignedBase += safeBase;

    const group = jurisdictions.get(line.jurisdictionCode) ?? { determined: 0, creditsAvailable: 0 };
    group.determined = roundMoney(group.determined + determined);
    group.creditsAvailable = roundMoney(
      group.creditsAvailable + Number(line.creditsApplied) + Number(line.favorCarryForward),
    );
    jurisdictions.set(line.jurisdictionCode, group);
  }

  let totalDeterminedTax = 0;
  let totalCreditsApplied = 0;
  let totalBalanceDue = 0;
  let totalFavorCarryForward = 0;
  for (const group of jurisdictions.values()) {
    const creditsAvailable = Math.max(group.creditsAvailable, 0);
    const applied = Math.min(creditsAvailable, group.determined);
    totalDeterminedTax = roundMoney(totalDeterminedTax + group.determined);
    totalCreditsApplied = roundMoney(totalCreditsApplied + applied);
    totalBalanceDue = roundMoney(totalBalanceDue + Math.max(group.determined - applied, 0));
    totalFavorCarryForward = roundMoney(
      totalFavorCarryForward + Math.max(creditsAvailable - applied, 0),
    );
  }

  return {
    determinedByLine,
    totalAssignedBase: roundMoney(totalAssignedBase),
    totalDeterminedTax,
    totalCreditsApplied,
    totalBalanceDue,
    totalFavorCarryForward,
    basesValid,
    basesNonNegative,
  };
}
