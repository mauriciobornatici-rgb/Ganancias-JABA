import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  findFiscalDocumentPeriodMismatches,
  fiscalDocumentPeriodMismatchMessage,
  fiscalDocumentPeriodRejectionMessage,
  partitionFiscalDocumentsByPeriod,
} from '../fiscalLedger/fiscalDocumentPeriodValidation';
import type { FiscalDocumentDraft } from '../fiscalLedger/types';

function document(issueDate: string, direction: 'SALE' | 'PURCHASE'): FiscalDocumentDraft {
  return {
    ownerCuit: '20-11111111-1',
    documentKey: `${direction}-${issueDate}`,
    direction,
    issueDate: new Date(`${issueDate}T12:00:00.000Z`),
    voucherType: '1',
    voucherNumber: '0001-00000001',
    netAmount: new Decimal(100),
    totalAmount: new Decimal(121),
    vatLines: [],
    sourceFileName: `${direction.toLowerCase()}.csv`,
  };
}

describe('validación del período de comprobantes mensuales', () => {
  it('acepta compras y ventas del mes y año seleccionados', () => {
    expect(findFiscalDocumentPeriodMismatches([
      document('2026-01-01', 'PURCHASE'),
      document('2026-01-31', 'SALE'),
    ], 2026, 1)).toEqual([]);
  });

  it('detecta meses y años ajenos antes de persistir el lote', () => {
    const mismatches = findFiscalDocumentPeriodMismatches([
      document('2025-01-31', 'PURCHASE'),
      document('2026-02-01', 'SALE'),
      document('2026-01-15', 'SALE'),
    ], 2026, 1);

    expect(mismatches).toHaveLength(2);
    expect(mismatches.map(item => item.issueDate)).toEqual(['2025-01-31', '2026-02-01']);
    expect(fiscalDocumentPeriodMismatchMessage(mismatches, 2026, 1))
      .toContain('no pertenecen al período 01/2026');
  });
});

describe('partición tolerante del lote (criterio 2026-07-24)', () => {
  it('importa los del mes e informa los intrusos, en vez de rechazar todo el lote', () => {
    const { inPeriod, mismatches } = partitionFiscalDocumentsByPeriod([
      document('2026-01-15', 'SALE'),
      document('2026-01-31', 'PURCHASE'),
      document('2025-12-30', 'SALE'), // una fila corrida no debe frenar la carga entera
    ], 2026, 1);

    expect(inPeriod).toHaveLength(2);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].issueDate).toBe('2025-12-30');
    expect(fiscalDocumentPeriodMismatchMessage(mismatches, 2026, 1)).toContain('NO se importaron');
  });

  it('cuando ninguno pertenece al período no queda nada para importar', () => {
    const { inPeriod, mismatches } = partitionFiscalDocumentsByPeriod([
      document('2026-02-03', 'SALE'),
      document('2026-02-27', 'PURCHASE'),
    ], 2026, 1);

    expect(inPeriod).toHaveLength(0);
    expect(mismatches).toHaveLength(2);
    // La ruta usa este mensaje para bloquear con 422 y explicar de qué mes es el archivo.
    const message = fiscalDocumentPeriodRejectionMessage(mismatches, 2026, 1);
    expect(message).toContain('Ningún comprobante');
    expect(message).toContain('2026-02');
  });

  it('sin intrusos, entra todo y no hay aviso', () => {
    const { inPeriod, mismatches } = partitionFiscalDocumentsByPeriod([
      document('2026-01-01', 'PURCHASE'),
      document('2026-01-31', 'SALE'),
    ], 2026, 1);

    expect(inPeriod).toHaveLength(2);
    expect(mismatches).toEqual([]);
    expect(fiscalDocumentPeriodMismatchMessage(mismatches, 2026, 1)).toBe('');
  });
});
