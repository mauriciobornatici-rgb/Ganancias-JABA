import { describe, expect, it } from 'vitest';
import {
  formatDateForWizardInput,
  mapAxiStaticItemsForWizard,
  mapAxiDynamicItemForWizard,
  mapPatrimonialJustificationForWizard,
  snapshotStringAt,
} from '../persistence/taxReturnReadMapper';

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

describe('mapAxiDynamicItemForWizard', () => {
  it('conserva coeficiente y ajuste calculado para auditoria al reabrir la DDJJ', () => {
    const mapped = mapAxiDynamicItemForWizard({
      concept: 'Retiros de los socios',
      type: 'RetiroSocio',
      amount: { toString: () => '3901371.69' },
      date: new Date('2025-12-31T00:00:00.000Z'),
      coef: { toString: () => '1.128840' },
      factor: { toString: () => '1.0000' },
      computedAxi: { toString: () => '502654.00' },
    });

    expect(mapped).toEqual({
      concept: 'Retiros de los socios',
      type: 'RetiroSocio',
      amount: '3901371.69',
      date: '2025-12-31',
      coef: '1.128840',
      factor: '1.0000',
      computedAxi: '502654.00',
    });
  });
});

describe('mapAxiStaticItemsForWizard', () => {
  it('reconstruye la grilla AXI estatica desde filas relacionales', () => {
    const mapped = mapAxiStaticItemsForWizard([
      {
        section: 'ACTIVO_TOTAL',
        categoryKey: 'disponibilidadesBancos',
        concept: 'Disponibilidades - Bancos',
        totalAmount: { toString: () => '580157.00' },
        computableAmount: { toString: () => '580157.00' },
        amount: { toString: () => '580157.00' },
        isComputable: true,
      },
      {
        section: 'BIEN_NO_COMPUTABLE',
        categoryKey: 'bienesUso',
        concept: 'Bienes de uso',
        totalAmount: { toString: () => '1017500.00' },
        computableAmount: { toString: () => '0.00' },
        amount: { toString: () => '1017500.00' },
        isComputable: false,
      },
      {
        section: 'PASIVO_TOTAL',
        categoryKey: 'deudasComerciales',
        concept: 'Deudas comerciales',
        totalAmount: { toString: () => '1462280.71' },
        computableAmount: { toString: () => '1462280.71' },
        amount: { toString: () => '1462280.71' },
        isComputable: true,
      },
    ]);

    expect(mapped).toEqual({
      activo: {
        disponibilidadesBancos: { total: '580157.00', computable: '580157.00' },
        bienesUso: { total: '1017500.00', computable: '0.00' },
      },
      pasivo: {
        deudasComerciales: { total: '1462280.71', computable: '1462280.71' },
      },
    });
  });

  it('devuelve null si no hay filas persistidas para mantener fallback al snapshot', () => {
    expect(mapAxiStaticItemsForWizard([])).toBeNull();
  });
});

describe('mapPatrimonialJustificationForWizard', () => {
  it('conserva concepto, columna e importe para reabrir otras justificaciones JVP', () => {
    const mapped = mapPatrimonialJustificationForWizard({
      concept: 'Herencia recibida',
      column: 2,
      amount: { toString: () => '750000.00' },
    });

    expect(mapped).toEqual({
      concept: 'Herencia recibida',
      column: 2,
      amount: '750000.00',
    });
  });
});
