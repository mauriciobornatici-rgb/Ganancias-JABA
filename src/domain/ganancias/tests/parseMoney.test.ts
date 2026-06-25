import { describe, expect, it } from 'vitest';
import { parseMoneyToPlain } from '../presentation/parseMoney';

describe('parseMoneyToPlain — acepta formato AR y punto decimal del teclado', () => {
  it('punto decimal (teclado numérico)', () => {
    expect(parseMoneyToPlain('176032.11')).toBe('176032.11');
  });
  it('coma decimal (AR simple)', () => {
    expect(parseMoneyToPlain('176032,11')).toBe('176032.11');
  });
  it('AR completo con miles y decimal', () => {
    expect(parseMoneyToPlain('1.151.226,93')).toBe('1151226.93');
  });
  it('US completo con miles y decimal', () => {
    expect(parseMoneyToPlain('1,151,226.93')).toBe('1151226.93');
  });
  it('entero sin separadores', () => {
    expect(parseMoneyToPlain('176032')).toBe('176032');
  });
  it('miles con puntos sin decimal', () => {
    expect(parseMoneyToPlain('1.000.000')).toBe('1000000');
  });
  it('negativo (nota de crédito)', () => {
    expect(parseMoneyToPlain('-744.30')).toBe('-744.30');
    expect(parseMoneyToPlain('-744,30')).toBe('-744.30');
  });
  it('vacío o inválido → null', () => {
    expect(parseMoneyToPlain('')).toBeNull();
    expect(parseMoneyToPlain('  ')).toBeNull();
    expect(parseMoneyToPlain('abc')).toBeNull();
    expect(parseMoneyToPlain(null)).toBeNull();
  });
  it('número nativo', () => {
    expect(parseMoneyToPlain(176032.11)).toBe('176032.11');
  });
});
