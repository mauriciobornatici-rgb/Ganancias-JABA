import { Decimal } from 'decimal.js';

type RawPurchase = {
  netAmount?: unknown;
  isDeductible?: unknown;
  expenseType?: unknown;
};

function decimalValue(value: unknown): Decimal {
  if (value instanceof Decimal) return value;
  if (value === null || value === undefined || value === '') return new Decimal(0);
  try {
    return new Decimal(value as Decimal.Value);
  } catch {
    return new Decimal(0);
  }
}

export function isCostOfGoodsPurchase(purchase: RawPurchase): boolean {
  return purchase.expenseType === 'MateriaPrima' || purchase.expenseType === 'Mercaderia';
}

export function sumDeductibleCostPurchases(purchases: RawPurchase[] = []): Decimal {
  return purchases
    .filter(purchase => purchase.isDeductible !== false && isCostOfGoodsPurchase(purchase))
    .reduce((sum, purchase) => sum.add(decimalValue(purchase.netAmount)), new Decimal(0));
}

export function sumDeductibleNonCostPurchases(purchases: RawPurchase[] = []): Decimal {
  return purchases
    .filter(purchase => purchase.isDeductible !== false && !isCostOfGoodsPurchase(purchase))
    .reduce((sum, purchase) => sum.add(decimalValue(purchase.netAmount)), new Decimal(0));
}
