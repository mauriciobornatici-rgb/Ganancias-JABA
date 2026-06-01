import { describe, expect, it } from 'vitest';
import { formatDateForWizardInput, snapshotStringAt } from '../persistence/taxReturnReadMapper';

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

describe('snapshotStringAt', () => {
  it('recupera valores textuales del snapshot por indice', () => {
    const snapshot = [
      { counterpartyCuit: '24300000000' },
      { counterpartyCuit: '307141419' },
    ];

    expect(snapshotStringAt(snapshot, 1, 'counterpartyCuit')).toBe('307141419');
  });

  it('devuelve cadena vacia si el snapshot no tiene el dato esperado', () => {
    expect(snapshotStringAt(null, 0, 'counterpartyCuit')).toBe('');
    expect(snapshotStringAt([{ counterpartyCuit: 123 }], 0, 'counterpartyCuit')).toBe('');
    expect(snapshotStringAt([], 0, 'counterpartyCuit')).toBe('');
  });
});
