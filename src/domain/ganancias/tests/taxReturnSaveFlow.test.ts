import { describe, expect, it } from 'vitest';
import {
  buildCreatedTaxReturnFullSaveRequest,
  buildCreatedTaxReturnRollbackRequest,
} from '../presentation/taxReturnSaveFlow';

describe('buildCreatedTaxReturnFullSaveRequest', () => {
  it('arma un PUT completo para persistir datos cargados luego de crear una DDJJ', () => {
    const payload = {
      clientName: 'Cliente Nuevo',
      sales: [{ date: '2025-01-01', netAmount: '1000', isExempt: false }],
      generalDeductions: { autonomos: '500' },
      status: 'Cerrada',
    };

    const request = buildCreatedTaxReturnFullSaveRequest('return-123', payload);

    expect(request.url).toBe('/api/declaraciones/return-123');
    expect(request.init.method).toBe('PUT');
    expect(request.init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(request.init.body).toBe(JSON.stringify(payload));
  });

  it('arma un DELETE de rollback para no dejar cabeceras vacias si falla el guardado completo', () => {
    const request = buildCreatedTaxReturnRollbackRequest('return-123');

    expect(request.url).toBe('/api/declaraciones/return-123');
    expect(request.init.method).toBe('DELETE');
  });
});
