import { Decimal } from 'decimal.js';
import { purchaseMonthFromDate, type PurchaseMonthFilter } from './purchaseMonthlySummary';

/**
 * Resumen mensual de VENTAS del Paso 2 (criterio del usuario 2026-07-16):
 * - Suma SOLO el neto gravado de las ventas computables (las exentas y las
 *   marcadas "No computable" cuentan como comprobantes pero no suman).
 * - Discrimina por las 3 categorías del selector: Bienes / Servicios / Muebles y Útiles.
 *   Valores desconocidos se agrupan como "Sin clasificar".
 */

export type SalesMonthFilter = PurchaseMonthFilter;

type SalesMonthlyRow = {
  date?: string | null;
  netAmount?: string | number | null;
  isExempt?: boolean | null;
  isComputable?: boolean | null;
  saleCategory?: string | null;
};

export const SALE_CATEGORIES = [
  { key: 'Bienes', label: 'Bienes', shortLabel: 'Bienes' },
  { key: 'Servicios', label: 'Servicios', shortLabel: 'Servicios' },
  { key: 'MueblesYUtiles', label: 'Muebles y Útiles', shortLabel: 'Muebles y Út.' },
  { key: 'SinClasificar', label: 'Sin clasificar', shortLabel: 'Sin clasif.' },
] as const;

export type SaleCategoryKey = (typeof SALE_CATEGORIES)[number]['key'];

export type SaleCategoryBreakdown = Record<SaleCategoryKey, Decimal>;

export type SalesMonthlyBucket = {
  key: number;
  label: string;
  shortLabel: string;
  count: number;
  netAmount: Decimal;
  byCategory: SaleCategoryBreakdown;
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

const KNOWN_SALE_CATEGORY_KEYS = new Set<string>(SALE_CATEGORIES.map(category => category.key));

function emptySaleBreakdown(): SaleCategoryBreakdown {
  return {
    Bienes: new Decimal(0),
    Servicios: new Decimal(0),
    MueblesYUtiles: new Decimal(0),
    SinClasificar: new Decimal(0),
  };
}

function saleCategoryOf(saleCategory: string | null | undefined): SaleCategoryKey {
  const value = saleCategory?.trim();
  if (value && KNOWN_SALE_CATEGORY_KEYS.has(value)) return value as SaleCategoryKey;
  return 'SinClasificar';
}

/** Categorías con movimiento de un bucket, en el orden del selector (las de cero no se muestran). */
export function listSaleCategoryBreakdown(byCategory: SaleCategoryBreakdown) {
  return SALE_CATEGORIES
    .filter(category => !byCategory[category.key].isZero())
    .map(category => ({
      key: category.key,
      label: category.label,
      shortLabel: category.shortLabel,
      amount: byCategory[category.key],
    }));
}

export function buildSalesMonthlySummary(rows: SalesMonthlyRow[]) {
  const months: SalesMonthlyBucket[] = MONTH_LABELS.map(([label, shortLabel], index) => ({
    key: index + 1,
    label,
    shortLabel,
    count: 0,
    netAmount: new Decimal(0),
    byCategory: emptySaleBreakdown(),
  }));
  const undated = { count: 0, netAmount: new Decimal(0), byCategory: emptySaleBreakdown() };
  let totalNetAmount = new Decimal(0);
  const totalByCategory = emptySaleBreakdown();

  for (const row of rows) {
    // Suma solo gravado y computable; exentas o "No computable" aportan $0.
    const sums = row.isComputable !== false && row.isExempt !== true;
    const amount = sums ? safeDecimal(row.netAmount) : new Decimal(0);
    const month = purchaseMonthFromDate(row.date);
    const category = saleCategoryOf(row.saleCategory);
    totalNetAmount = totalNetAmount.add(amount);
    totalByCategory[category] = totalByCategory[category].add(amount);

    if (month === null) {
      undated.count += 1;
      undated.netAmount = undated.netAmount.add(amount);
      undated.byCategory[category] = undated.byCategory[category].add(amount);
      continue;
    }

    months[month - 1].count += 1;
    months[month - 1].netAmount = months[month - 1].netAmount.add(amount);
    months[month - 1].byCategory[category] = months[month - 1].byCategory[category].add(amount);
  }

  return {
    totalCount: rows.length,
    totalNetAmount,
    totalByCategory,
    months,
    undated,
  };
}

export type SalesMonthlySummary = ReturnType<typeof buildSalesMonthlySummary>;

function safeDecimal(value: string | number | null | undefined): Decimal {
  if (value === null || value === undefined || value === '') return new Decimal(0);

  try {
    const amount = new Decimal(value);
    return amount.isFinite() ? amount : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}
