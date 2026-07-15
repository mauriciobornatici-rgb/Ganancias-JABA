import { Decimal } from 'decimal.js';

export type PurchaseMonthFilter = 'all' | 'undated' | number;

type PurchaseMonthlyRow = {
  date?: string | null;
  netAmount?: string | number | null;
};

export type PurchaseMonthlyBucket = {
  key: number;
  label: string;
  shortLabel: string;
  count: number;
  netAmount: Decimal;
};

const MONTH_LABELS = [
  ['Enero', 'Ene'],
  ['Febrero', 'Feb'],
  ['Marzo', 'Mar'],
  ['Abril', 'Abr'],
  ['Mayo', 'May'],
  ['Junio', 'Jun'],
  ['Julio', 'Jul'],
  ['Agosto', 'Ago'],
  ['Septiembre', 'Sep'],
  ['Octubre', 'Oct'],
  ['Noviembre', 'Nov'],
  ['Diciembre', 'Dic'],
] as const;

export function buildPurchaseMonthlySummary(rows: PurchaseMonthlyRow[]) {
  const months: PurchaseMonthlyBucket[] = MONTH_LABELS.map(([label, shortLabel], index) => ({
    key: index + 1,
    label,
    shortLabel,
    count: 0,
    netAmount: new Decimal(0),
  }));
  const undated = { count: 0, netAmount: new Decimal(0) };
  let totalNetAmount = new Decimal(0);

  for (const row of rows) {
    const amount = safeDecimal(row.netAmount);
    const month = purchaseMonthFromDate(row.date);
    totalNetAmount = totalNetAmount.add(amount);

    if (month === null) {
      undated.count += 1;
      undated.netAmount = undated.netAmount.add(amount);
      continue;
    }

    months[month - 1].count += 1;
    months[month - 1].netAmount = months[month - 1].netAmount.add(amount);
  }

  return {
    totalCount: rows.length,
    totalNetAmount,
    months,
    undated,
  };
}

export type PurchaseMonthlySummary = ReturnType<typeof buildPurchaseMonthlySummary>;

export function matchesPurchaseMonthFilter(
  date: string | null | undefined,
  filter: PurchaseMonthFilter,
): boolean {
  if (filter === 'all') return true;

  const month = purchaseMonthFromDate(date);
  return filter === 'undated' ? month === null : month === filter;
}

export function purchaseMonthFromDate(date: string | null | undefined): number | null {
  const value = date?.trim();
  if (!value) return null;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (isoMatch) return validatedMonth(isoMatch[1], isoMatch[2], isoMatch[3]);

  const argentineMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (argentineMatch) return validatedMonth(argentineMatch[3], argentineMatch[2], argentineMatch[1]);

  return null;
}

function validatedMonth(yearText: string, monthText: string, dayText: string): number | null {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) return null;

  return month;
}

function safeDecimal(value: string | number | null | undefined): Decimal {
  if (value === null || value === undefined || value === '') return new Decimal(0);

  try {
    const amount = new Decimal(value);
    return amount.isFinite() ? amount : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}
