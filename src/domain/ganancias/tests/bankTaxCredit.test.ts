import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  buildIdcbCertificateNumber,
  buildIdcbWithholdingDrafts,
  computeIdcbComputableAmount,
  idcbImportNotice,
  isIdcbComputablePercent,
  normalizeIdcbComputablePercent,
} from '../fiscalLedger/bankTaxCredit';

const D = (v: string) => new Decimal(v);

describe('normalizeIdcbComputablePercent', () => {
  it('solo acepta 100; cualquier otro valor cae en el 33% del regimen general', () => {
    expect(normalizeIdcbComputablePercent(100)).toBe(100);
    expect(normalizeIdcbComputablePercent(33)).toBe(33);
    expect(normalizeIdcbComputablePercent(null)).toBe(33);
    expect(normalizeIdcbComputablePercent(undefined)).toBe(33);
    // Un valor viejo o corrupto no habilita un cómputo mayor al general.
    expect(normalizeIdcbComputablePercent(50)).toBe(33);
    expect(normalizeIdcbComputablePercent(0)).toBe(33);
  });

  it('isIdcbComputablePercent reconoce solo los dos valores admitidos', () => {
    expect(isIdcbComputablePercent(33)).toBe(true);
    expect(isIdcbComputablePercent(100)).toBe(true);
    expect(isIdcbComputablePercent(50)).toBe(false);
    expect(isIdcbComputablePercent('33')).toBe(false);
  });
});

describe('computeIdcbComputableAmount', () => {
  it('computa el 33% del total del mes (regimen general)', () => {
    expect(computeIdcbComputableAmount(D('100000'), 33).toFixed(2)).toBe('33000.00');
  });

  it('computa el 100% para micro y pequeña empresa', () => {
    expect(computeIdcbComputableAmount(D('100000'), 100).toFixed(2)).toBe('100000.00');
  });

  it('redondea a dos decimales con medio hacia arriba', () => {
    // 1.015 -> 33% = 0.33495 -> 0.33
    expect(computeIdcbComputableAmount(D('1.015'), 33).toFixed(2)).toBe('0.33');
    // 50.005 -> 33% = 16.50165 -> 16.50
    expect(computeIdcbComputableAmount(D('50.005'), 33).toFixed(2)).toBe('16.50');
    // 1.5 -> 33% = 0.495 -> 0.50 (medio hacia arriba)
    expect(computeIdcbComputableAmount(D('1.5'), 33).toFixed(2)).toBe('0.50');
  });
});

describe('buildIdcbWithholdingDrafts', () => {
  it('crea una fila por mes con el importe computable y certificado idempotente', () => {
    const summary = buildIdcbWithholdingDrafts([
      { year: 2025, month: 4, totalAmount: D('120000'), computablePercent: 33 },
      { year: 2025, month: 3, totalAmount: D('90000'), computablePercent: 33 },
    ]);

    expect(summary.drafts).toHaveLength(2);
    // Ordenadas por mes aunque lleguen desordenadas.
    expect(summary.monthsUsed).toEqual([3, 4]);

    const marzo = summary.drafts[0];
    expect(marzo.taxCode).toBe('IDCB');
    expect(marzo.amount).toBe('29700.00');
    expect(marzo.certificateNumber).toBe('IDCB-2025-03');
    expect(marzo.cuitAgent).toBeNull();
    expect(marzo.agentName).toBe('Impuesto al cheque marzo 2025');
    expect(marzo.operationDescription).toContain('33%');
    // Fechado el último día del mes, igual que el IIBB determinado.
    expect(marzo.date.toISOString().startsWith('2025-03-31')).toBe(true);

    expect(summary.totalLoaded.toFixed(2)).toBe('210000.00');
    expect(summary.totalComputable.toFixed(2)).toBe('69300.00');
  });

  it('con 100% lleva el total cargado sin recortar', () => {
    const summary = buildIdcbWithholdingDrafts([
      { year: 2026, month: 1, totalAmount: D('54321.99'), computablePercent: 100 },
    ]);
    expect(summary.drafts[0].amount).toBe('54321.99');
    expect(summary.totalComputable.toFixed(2)).toBe('54321.99');
    expect(summary.drafts[0].operationDescription).toContain('100%');
  });

  it('omite meses sin importe cargado y montos no positivos', () => {
    const summary = buildIdcbWithholdingDrafts([
      { year: 2025, month: 1, totalAmount: D('0'), computablePercent: 33 },
      { year: 2025, month: 2, totalAmount: D('-500'), computablePercent: 33 },
      { year: 2025, month: 5, totalAmount: D('1000'), computablePercent: 33 },
    ]);
    expect(summary.drafts).toHaveLength(1);
    expect(summary.monthsUsed).toEqual([5]);
    expect(summary.totalLoaded.toFixed(2)).toBe('1000.00');
  });

  it('cada mes usa el porcentaje de su propio periodo (perfil fiscal versionado)', () => {
    const summary = buildIdcbWithholdingDrafts([
      { year: 2025, month: 1, totalAmount: D('10000'), computablePercent: 33 },
      { year: 2025, month: 2, totalAmount: D('10000'), computablePercent: 100 },
    ]);
    expect(summary.drafts[0].amount).toBe('3300.00');
    expect(summary.drafts[1].amount).toBe('10000.00');
    expect(summary.totalComputable.toFixed(2)).toBe('13300.00');
  });

  it('febrero de año bisiesto queda fechado el 29', () => {
    const summary = buildIdcbWithholdingDrafts([
      { year: 2024, month: 2, totalAmount: D('1000'), computablePercent: 33 },
    ]);
    expect(summary.drafts[0].date.toISOString().startsWith('2024-02-29')).toBe(true);
  });

  it('sin meses cargados no genera filas ni aviso', () => {
    const summary = buildIdcbWithholdingDrafts([]);
    expect(summary.drafts).toHaveLength(0);
    expect(summary.totalComputable.toFixed(2)).toBe('0.00');
    expect(idcbImportNotice(summary, 33)).toBe('');
  });

  it('el aviso informa total cargado, porcentaje y computable', () => {
    const summary = buildIdcbWithholdingDrafts([
      { year: 2025, month: 6, totalAmount: D('100000'), computablePercent: 33 },
    ]);
    const notice = idcbImportNotice(summary, 33);
    expect(notice).toContain('100000.00');
    expect(notice).toContain('33%');
    expect(notice).toContain('33000.00');
  });
});

describe('buildIdcbCertificateNumber', () => {
  it('usa AAAA-MM con mes en dos dígitos', () => {
    expect(buildIdcbCertificateNumber(2025, 7)).toBe('IDCB-2025-07');
    expect(buildIdcbCertificateNumber(2025, 12)).toBe('IDCB-2025-12');
  });
});
