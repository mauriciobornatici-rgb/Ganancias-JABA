import { describe, expect, it } from 'vitest';
import {
  TAX_RETURN_PERSISTENCE_TRANSACTION_OPTIONS,
  buildTaxReturnInvalidPayloadMessage,
  isPrismaUniqueConstraintError,
} from '../persistence/taxReturnPersistencePolicy';

describe('taxReturnPersistencePolicy', () => {
  it('usa un presupuesto explicito para transacciones grandes de DDJJ', () => {
    expect(TAX_RETURN_PERSISTENCE_TRANSACTION_OPTIONS).toEqual({
      maxWait: 10_000,
      timeout: 30_000,
    });
  });

  it('normaliza mensajes de payload invalido para la capa API', () => {
    expect(buildTaxReturnInvalidPayloadMessage('ventas[0].netAmount', 'abc')).toContain('ventas[0].netAmount');
    expect(buildTaxReturnInvalidPayloadMessage('ventas[0].date', '')).toContain('faltante');
  });

  it('reconoce colisiones de unicidad de Prisma sin depender de clases de runtime', () => {
    expect(isPrismaUniqueConstraintError({ code: 'P2002' })).toBe(true);
    expect(isPrismaUniqueConstraintError({ code: 'P2025' })).toBe(false);
    expect(isPrismaUniqueConstraintError(new Error('PRIMARY'))).toBe(false);
  });
});
