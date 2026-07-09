import { describe, expect, it } from 'vitest';
import {
  TAX_RETURN_PERSISTENCE_TRANSACTION_OPTIONS,
  buildTaxReturnInvalidPayloadMessage,
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
});
