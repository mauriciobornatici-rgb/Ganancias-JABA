import { Decimal } from 'decimal.js';

type NumericLike = Decimal | number | string | { toString(): string };

export type IndexWithIpc = {
  monthIndex: number;
  ipcValue: NumericLike;
};

export type UsefulTaxCoefficients = {
  decPreviousToDecCurrent?: Decimal;
  currentYearAverage?: Decimal;
};

function toDecimal(value: NumericLike): Decimal | null {
  try {
    if (value instanceof Decimal) return value;
    const asString = typeof value === 'number' || typeof value === 'string'
      ? String(value)
      : value.toString();
    const decimal = new Decimal(asString);
    return decimal.isFinite() && decimal.gt(0) ? decimal : null;
  } catch {
    return null;
  }
}

export function buildUsefulCoefficientsFromIndexes(
  currentYearIndexes: IndexWithIpc[],
  previousYearDecemberIndex?: IndexWithIpc | null
): UsefulTaxCoefficients {
  const decemberIndex = currentYearIndexes.find((index) => index.monthIndex === 12);
  const decemberIpc = decemberIndex ? toDecimal(decemberIndex.ipcValue) : null;
  const previousDecemberIpc = previousYearDecemberIndex ? toDecimal(previousYearDecemberIndex.ipcValue) : null;
  const usefulCoefficients: UsefulTaxCoefficients = {};

  if (decemberIpc && previousDecemberIpc) {
    usefulCoefficients.decPreviousToDecCurrent = decemberIpc.div(previousDecemberIpc);
  }

  const monthlyIndexes = currentYearIndexes
    .filter((index) => index.monthIndex >= 1 && index.monthIndex <= 12)
    .sort((a, b) => a.monthIndex - b.monthIndex)
    .map((index) => toDecimal(index.ipcValue));

  if (decemberIpc && monthlyIndexes.length === 12 && monthlyIndexes.every((item): item is Decimal => item !== null)) {
    const averageIpc = monthlyIndexes
      .reduce((total, ipc) => total.add(ipc), new Decimal(0))
      .div(monthlyIndexes.length);
    usefulCoefficients.currentYearAverage = decemberIpc.div(averageIpc);
  }

  return usefulCoefficients;
}
