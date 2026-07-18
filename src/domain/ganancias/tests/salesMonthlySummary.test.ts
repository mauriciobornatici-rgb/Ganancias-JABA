import { describe, expect, it } from 'vitest';
import {
  buildSalesMonthlySummary,
  listSaleCategoryBreakdown,
} from '../presentation/salesMonthlySummary';

describe('salesMonthlySummary', () => {
  it('suma solo el neto gravado computable y discrimina por categoría (criterio 2026-07-16)', () => {
    const summary = buildSalesMonthlySummary([
      { date: '2025-01-05', netAmount: '1000', isExempt: false, saleCategory: 'Bienes' },
      { date: '2025-01-10', netAmount: '500', isExempt: false, saleCategory: 'Servicios', isComputable: true },
      { date: '2025-01-15', netAmount: '200', isExempt: false, saleCategory: 'MueblesYUtiles' },
      { date: '2025-01-20', netAmount: '900', isExempt: true, saleCategory: 'Bienes' },              // exenta: NO suma
      { date: '2025-01-25', netAmount: '700', isExempt: false, saleCategory: 'Bienes', isComputable: false }, // no computable: NO suma
      { date: '2025-02-01', netAmount: '400', isExempt: false, saleCategory: 'CategoriaRara' },      // -> Sin clasificar
    ]);

    const enero = summary.months[0];
    expect(enero.count).toBe(5); // exentas y no computables cuentan como comprobantes
    expect(enero.netAmount.toString()).toBe('1700'); // 1000 + 500 + 200
    expect(enero.byCategory.Bienes.toString()).toBe('1000');
    expect(enero.byCategory.Servicios.toString()).toBe('500');
    expect(enero.byCategory.MueblesYUtiles.toString()).toBe('200');

    // El desglose cuadra con el total del mes
    const sumaDesglose = Object.values(enero.byCategory).reduce((total, amount) => total.add(amount));
    expect(sumaDesglose.equals(enero.netAmount)).toBe(true);

    expect(summary.months[1].byCategory.SinClasificar.toString()).toBe('400');
    expect(summary.totalNetAmount.toString()).toBe('2100');
  });

  it('las notas de crédito restan dentro de su categoría (signo preservado)', () => {
    const summary = buildSalesMonthlySummary([
      { date: '2025-03-01', netAmount: '1000', isExempt: false, saleCategory: 'Bienes' },
      { date: '2025-03-05', netAmount: '-200', isExempt: false, saleCategory: 'Bienes' },
    ]);
    expect(summary.months[2].netAmount.toString()).toBe('800');
    expect(summary.months[2].byCategory.Bienes.toString()).toBe('800');
  });

  it('listSaleCategoryBreakdown devuelve solo categorías con movimiento, en orden', () => {
    const summary = buildSalesMonthlySummary([
      { date: '2025-04-01', netAmount: '500', isExempt: false, saleCategory: 'Servicios' },
    ]);
    const lines = listSaleCategoryBreakdown(summary.months[3].byCategory);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ key: 'Servicios', shortLabel: 'Servicios' });
    expect(lines[0].amount.toString()).toBe('500');
  });

  it('separa comprobantes sin fecha válida', () => {
    const summary = buildSalesMonthlySummary([
      { date: '', netAmount: '100', isExempt: false, saleCategory: 'Bienes' },
    ]);
    expect(summary.undated.count).toBe(1);
    expect(summary.undated.netAmount.toString()).toBe('100');
  });
});
