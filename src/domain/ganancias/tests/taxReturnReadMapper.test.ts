import { describe, expect, it } from 'vitest';
import { formatDateForWizardInput } from '../persistence/taxReturnReadMapper';

describe('formatDateForWizardInput', () => {
  it('formatea fechas validas para inputs date del wizard', () => {
    expect(formatDateForWizardInput(new Date('2025-04-15T12:30:00.000Z'))).toBe('2025-04-15');
  });

  it('devuelve cadena vacia cuando la fecha persistida es nula', () => {
    expect(formatDateForWizardInput(null)).toBe('');
  });

  it('devuelve cadena vacia cuando la fecha persistida es invalida', () => {
    expect(formatDateForWizardInput('fecha-invalida')).toBe('');
  });
});
