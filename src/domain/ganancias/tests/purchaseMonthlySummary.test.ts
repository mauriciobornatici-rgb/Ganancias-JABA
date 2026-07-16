import { describe, expect, it } from 'vitest';
import {
  buildPurchaseMonthlySummary,
  listExpenseBreakdown,
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

  it('discrimina cada mes por tipo de gasto y el desglose cuadra con el total del mes', () => {
    const summary = buildPurchaseMonthlySummary([
      { date: '2025-01-05', netAmount: '1000', expenseType: 'MateriaPrima' },
      { date: '2025-01-10', netAmount: '250.50', expenseType: 'GastosGenerales' },
      { date: '2025-01-15', netAmount: '80', expenseType: 'Servicios' },
      { date: '2025-01-20', netAmount: '400', expenseType: 'Alquiler' },
      { date: '2025-01-25', netAmount: '30', expenseType: 'TipoInexistente' }, // -> Sin clasificar
      { date: '2025-02-01', netAmount: '999', expenseType: 'MateriaPrima' },
    ]);

    const enero = summary.months[0];
    expect(enero.byExpenseType.MateriaPrima.toString()).toBe('1000');
    expect(enero.byExpenseType.GastosGenerales.toString()).toBe('250.5');
    expect(enero.byExpenseType.Servicios.toString()).toBe('80');
    expect(enero.byExpenseType.Alquiler.toString()).toBe('400');
    expect(enero.byExpenseType.SinClasificar.toString()).toBe('30');

    // El desglose siempre cuadra con el total del mes
    const sumaDesglose = Object.values(enero.byExpenseType)
      .reduce((total, amount) => total.add(amount));
    expect(sumaDesglose.equals(enero.netAmount)).toBe(true);

    // Febrero solo tiene materia prima; el resto queda en cero
    expect(summary.months[1].byExpenseType.MateriaPrima.toString()).toBe('999');
    expect(summary.months[1].byExpenseType.Alquiler.isZero()).toBe(true);

    // Total general tambien discriminado
    expect(summary.totalByExpenseType.MateriaPrima.toString()).toBe('1999');
  });

  it('listExpenseBreakdown devuelve solo categorias con movimiento, en el orden del selector', () => {
    const summary = buildPurchaseMonthlySummary([
      { date: '2025-03-01', netAmount: '500', expenseType: 'Alquiler' },
      { date: '2025-03-02', netAmount: '100', expenseType: 'MateriaPrima' },
      { date: '2025-03-03', netAmount: '-100', expenseType: 'MateriaPrima' }, // NC: queda en cero y no se muestra
    ]);

    const lines = listExpenseBreakdown(summary.months[2].byExpenseType);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ key: 'Alquiler', shortLabel: 'Alquileres' });
    expect(lines[0].amount.toString()).toBe('500');
  });

  it('trata importes no numericos como cero sin romper el resumen', () => {
    const summary = buildPurchaseMonthlySummary([
      { date: '2025-03-01', netAmount: 'importe-invalido' },
    ]);

    expect(summary.months[2].count).toBe(1);
    expect(summary.months[2].netAmount.toString()).toBe('0');
  });
});
