import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { formatCurrencyCents, formatCurrencyWhole, normalizeArgentineAmountInput } from '../presentation/moneyFormat';

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

describe('normalizeArgentineAmountInput (P31.7)', () => {
  it('convierte formato argentino completo a decimal estandar', () => {
    expect(normalizeArgentineAmountInput('1.234.567,89')).toBe('1234567.89');
    expect(normalizeArgentineAmountInput('1234,56')).toBe('1234.56');
    expect(normalizeArgentineAmountInput('$ 1.500,00')).toBe('1500.00');
    expect(normalizeArgentineAmountInput('-2.345,10')).toBe('-2345.10');
  });

  it('detecta puntos de miles sin coma cuando el patron es inequivoco', () => {
    expect(normalizeArgentineAmountInput('1.234.567')).toBe('1234567');
    expect(normalizeArgentineAmountInput('45.000')).toBe('45000');
  });

  it('no altera decimales estandar ni valores ya normalizados', () => {
    expect(normalizeArgentineAmountInput('1234.56')).toBe('1234.56');
    expect(normalizeArgentineAmountInput('1234567')).toBe('1234567');
    expect(normalizeArgentineAmountInput('0.4')).toBe('0.4');
    expect(normalizeArgentineAmountInput('')).toBe('');
  });

  it('devuelve la cadena original cuando no es un importe interpretable', () => {
    expect(normalizeArgentineAmountInput('abc')).toBe('abc');
    expect(normalizeArgentineAmountInput('12,34,56')).toBe('12,34,56');
  });
});
