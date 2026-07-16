import { Decimal } from 'decimal.js';

export type PurchaseMonthFilter = 'all' | 'undated' | number;

type PurchaseMonthlyRow = {
  date?: string | null;
  netAmount?: string | number | null;
  expenseType?: string | null;
  isDeductible?: boolean | null;
};

/**
 * Las 4 categorías de tipo de gasto del selector por comprobante (Paso 3).
 * Todo valor desconocido o vacío se agrupa como "Sin clasificar".
 */
export const PURCHASE_EXPENSE_CATEGORIES = [
  { key: 'MateriaPrima', label: 'Materia Prima / Insumos', shortLabel: 'Mat. Prima' },
  { key: 'GastosGenerales', label: 'Gastos Generales', shortLabel: 'G. Grales.' },
  { key: 'Servicios', label: 'Servicios Básicos', shortLabel: 'Servicios' },
  { key: 'Alquiler', label: 'Alquileres', shortLabel: 'Alquileres' },
  { key: 'SinClasificar', label: 'Sin clasificar', shortLabel: 'Sin clasif.' },
] as const;

export type PurchaseExpenseCategoryKey = (typeof PURCHASE_EXPENSE_CATEGORIES)[number]['key'];

export type PurchaseExpenseBreakdown = Record<PurchaseExpenseCategoryKey, Decimal>;

export type PurchaseMonthlyBucket = {
  key: number;
  label: string;
  shortLabel: string;
  count: number;
  netAmount: Decimal;
  byExpenseType: PurchaseExpenseBreakdown;
};

const KNOWN_EXPENSE_KEYS = new Set<string>(
  PURCHASE_EXPENSE_CATEGORIES.map(category => category.key),
);

function emptyExpenseBreakdown(): PurchaseExpenseBreakdown {
  return {
    MateriaPrima: new Decimal(0),
    GastosGenerales: new Decimal(0),
    Servicios: new Decimal(0),
    Alquiler: new Decimal(0),
    SinClasificar: new Decimal(0),
  };
}

function expenseCategoryOf(expenseType: string | null | undefined): PurchaseExpenseCategoryKey {
  const value = expenseType?.trim();
  if (value && KNOWN_EXPENSE_KEYS.has(value)) return value as PurchaseExpenseCategoryKey;
  return 'SinClasificar';
}

/**
 * Devuelve las categorías con movimiento de un bucket, en el orden del selector,
 * listas para renderizar (las que están en cero no se muestran).
 */
export function listExpenseBreakdown(byExpenseType: PurchaseExpenseBreakdown) {
  return PURCHASE_EXPENSE_CATEGORIES
    .filter(category => !byExpenseType[category.key].isZero())
    .map(category => ({
      key: category.key,
      label: category.label,
      shortLabel: category.shortLabel,
      amount: byExpenseType[category.key],
    }));
}

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
    byExpenseType: emptyExpenseBreakdown(),
  }));
  const undated = { count: 0, netAmount: new Decimal(0), byExpenseType: emptyExpenseBreakdown() };
  let totalNetAmount = new Decimal(0);
  const totalByExpenseType = emptyExpenseBreakdown();

  for (const row of rows) {
    // Criterio 2026-07-16: los totales mensuales solo suman lo marcado "Deducible en Ganancias"
    // (columna Tratamiento). Los no deducibles se cuentan como comprobantes pero suman $0,
    // igual que en el total Deducible de la cabecera.
    const isDeductible = row.isDeductible !== false;
    const amount = isDeductible ? safeDecimal(row.netAmount) : new Decimal(0);
    const month = purchaseMonthFromDate(row.date);
    const category = expenseCategoryOf(row.expenseType);
    totalNetAmount = totalNetAmount.add(amount);
    totalByExpenseType[category] = totalByExpenseType[category].add(amount);

    if (month === null) {
      undated.count += 1;
      undated.netAmount = undated.netAmount.add(amount);
      undated.byExpenseType[category] = undated.byExpenseType[category].add(amount);
      continue;
    }

    months[month - 1].count += 1;
    months[month - 1].netAmount = months[month - 1].netAmount.add(amount);
    months[month - 1].byExpenseType[category] = months[month - 1].byExpenseType[category].add(amount);
  }

  return {
    totalCount: rows.length,
    totalNetAmount,
    totalByExpenseType,
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
