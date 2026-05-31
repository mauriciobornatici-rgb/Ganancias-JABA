import { describe, expect, it } from 'vitest';
import { buildDuplicateTaxReturnCreateResponse } from '../persistence/taxReturnDuplicate';

describe('buildDuplicateTaxReturnCreateResponse', () => {
  it('devuelve una respuesta clara cuando ya existe una DDJJ original para cliente y periodo', () => {
    const response = buildDuplicateTaxReturnCreateResponse({
      id: 'return-123',
      status: 'Borrador',
      version: 0,
      fiscalYear: 2025,
    });

    expect(response).toEqual({
      success: false,
      code: 'DUPLICATE_TAX_RETURN',
      error: 'Ya existe una DDJJ original para el periodo 2025. Abra la declaracion existente para continuar la carga.',
      data: {
        id: 'return-123',
        status: 'Borrador',
        version: 0,
      },
    });
  });
});
