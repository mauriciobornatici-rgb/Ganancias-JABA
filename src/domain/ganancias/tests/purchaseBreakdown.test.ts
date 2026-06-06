import { describe, expect, it } from 'vitest';
import {
  sumDeductibleCostPurchases,
  sumDeductibleNonCostPurchases,
} from '../presentation/purchaseBreakdown';

describe('purchase breakdown presentation helpers', () => {
  it('separa compras de CMV de gastos deducibles para evitar doble computo en pantalla', () => {
    const purchases = [
      { netAmount: '100', isDeductible: true, expenseType: 'MateriaPrima' },
      { netAmount: '50', isDeductible: true, expenseType: 'Mercaderia' },
      { netAmount: '30', isDeductible: true, expenseType: 'GastosGenerales' },
      { netAmount: '20', isDeductible: false, expenseType: 'GastosGenerales' },
    ];

    expect(sumDeductibleCostPurchases(purchases).toNumber()).toBe(150);
    expect(sumDeductibleNonCostPurchases(purchases).toNumber()).toBe(30);
  });
});
