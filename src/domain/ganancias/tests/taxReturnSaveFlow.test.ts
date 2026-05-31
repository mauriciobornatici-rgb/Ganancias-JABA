import { describe, expect, it } from 'vitest';
import {
  buildTaxReturnSaveRequest,
  buildCreatedTaxReturnFullSaveRequest,
  buildCreatedTaxReturnRollbackRequest,
  resolveTaxReturnSaveTarget,
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

describe('resolveTaxReturnSaveTarget', () => {
  it('crea una DDJJ nueva cuando la ruta todavia no tiene id persistido', () => {
    const target = resolveTaxReturnSaveTarget({
      routeId: 'crear',
      persistedReturnId: '',
    });

    expect(target).toEqual({
      method: 'POST',
      url: '/api/declaraciones',
      isCreate: true,
      taxReturnId: null,
    });
  });

  it('actualiza la DDJJ ya persistida aunque la ruta siga siendo crear', () => {
    const target = resolveTaxReturnSaveTarget({
      routeId: 'crear',
      persistedReturnId: 'return-123',
    });

    expect(target).toEqual({
      method: 'PUT',
      url: '/api/declaraciones/return-123',
      isCreate: false,
      taxReturnId: 'return-123',
    });
  });

  it('actualiza por el id de la ruta cuando se edita una DDJJ existente', () => {
    const target = resolveTaxReturnSaveTarget({
      routeId: 'return-789',
      persistedReturnId: null,
    });

    expect(target).toEqual({
      method: 'PUT',
      url: '/api/declaraciones/return-789',
      isCreate: false,
      taxReturnId: 'return-789',
    });
  });
});

describe('buildTaxReturnSaveRequest', () => {
  it('arma un POST atomico con payload completo al crear una DDJJ', () => {
    const payload = {
      clientName: 'Cliente Nuevo',
      sales: [{ date: '2025-01-01', netAmount: '1000' }],
      status: 'Borrador',
    };

    const request = buildTaxReturnSaveRequest({
      routeId: 'crear',
      persistedReturnId: '',
      payload,
    });

    expect(request.url).toBe('/api/declaraciones');
    expect(request.init.method).toBe('POST');
    expect(request.init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(request.init.body).toBe(JSON.stringify(payload));
    expect(request.target.isCreate).toBe(true);
  });

  it('arma un PUT contra la DDJJ persistida cuando ya existe id activo', () => {
    const payload = {
      clientName: 'Cliente Existente',
      status: 'Cerrada',
    };

    const request = buildTaxReturnSaveRequest({
      routeId: 'crear',
      persistedReturnId: 'return-123',
      payload,
    });

    expect(request.url).toBe('/api/declaraciones/return-123');
    expect(request.init.method).toBe('PUT');
    expect(request.init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(request.init.body).toBe(JSON.stringify(payload));
    expect(request.target.isCreate).toBe(false);
  });
});
