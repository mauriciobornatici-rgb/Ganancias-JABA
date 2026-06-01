import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { formatCurrencyCents, formatCurrencyWhole } from '../presentation/moneyFormat';

describe('moneyFormat', () => {
  it('formatea importes enteros para el wizard', () => {
    expect(formatCurrencyWhole(new Decimal('1234.56'))).toBe('$1.235');
    expect(formatCurrencyWhole('9876')).toBe('$9.876');
  });

  it('formatea importes con centavos para topes y parametros', () => {
    expect(formatCurrencyCents('1234.5')).toBe('$1.234,50');
    expect(formatCurrencyCents(0)).toBe('$0,00');
  });

  it('devuelve cero cuando el valor no es numerico', () => {
    expect(formatCurrencyWhole('sin-dato')).toBe('$0');
    expect(formatCurrencyCents('sin-dato')).toBe('$0,00');
  });
});
