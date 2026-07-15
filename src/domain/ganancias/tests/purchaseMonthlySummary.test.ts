import { describe, expect, it } from 'vitest';
import {
  buildPurchaseMonthlySummary,
  matchesPurchaseMonthFilter,
  purchaseMonthFromDate,
} from '../presentation/purchaseMonthlySummary';

describe('purchaseMonthlySummary', () => {
  it('agrupa cantidad e importe neto por mes sin perder precision decimal', () => {
    const summary = buildPurchaseMonthlySummary([
      { date: '2025-01-03', netAmount: '0.10' },
      { date: '2025-01-20', netAmount: '0.20' },
      { date: '2025-12-01', netAmount: '1200.50' },
    ]);

    expect(summary.totalCount).toBe(3);
    expect(summary.totalNetAmount.toString()).toBe('1200.8');
    expect(summary.months).toHaveLength(12);
    expect(summary.months[0]).toMatchObject({ label: 'Enero', count: 2 });
    expect(summary.months[0].netAmount.toString()).toBe('0.3');
    expect(summary.months[11]).toMatchObject({ label: 'Diciembre', count: 1 });
    expect(summary.months[11].netAmount.toString()).toBe('1200.5');
  });

  it('separa comprobantes sin fecha valida para que el total mensual pueda conciliarse', () => {
    const summary = buildPurchaseMonthlySummary([
      { date: '', netAmount: '100' },
      { date: '2025-02-31', netAmount: '50' },
      { date: 'fecha-invalida', netAmount: '25' },
    ]);

    expect(summary.undated.count).toBe(3);
    expect(summary.undated.netAmount.toString()).toBe('175');
    expect(summary.months.every(month => month.count === 0)).toBe(true);
  });

  it('reconoce fechas ISO y argentinas y permite filtrar por mes o sin fecha', () => {
    expect(purchaseMonthFromDate('2025-07-14')).toBe(7);
    expect(purchaseMonthFromDate('14/07/2025')).toBe(7);
    expect(purchaseMonthFromDate('2025-13-01')).toBeNull();

    expect(matchesPurchaseMonthFilter('2025-07-14', 'all')).toBe(true);
    expect(matchesPurchaseMonthFilter('2025-07-14', 7)).toBe(true);
    expect(matchesPurchaseMonthFilter('2025-07-14', 8)).toBe(false);
    expect(matchesPurchaseMonthFilter('', 'undated')).toBe(true);
  });

  it('trata importes no numericos como cero sin romper el resumen', () => {
    const summary = buildPurchaseMonthlySummary([
      { date: '2025-03-01', netAmount: 'importe-invalido' },
    ]);

    expect(summary.months[2].count).toBe(1);
    expect(summary.months[2].netAmount.toString()).toBe('0');
  });
});
