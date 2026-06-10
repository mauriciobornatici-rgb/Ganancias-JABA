import { describe, expect, it } from 'vitest';
import {
  MAX_DECLARATION_PAYLOAD_BYTES,
  MAX_IMPORT_TOTAL_BYTES,
  createTaxReturnSchema,
  exceedsContentLength,
  firstValidationError,
} from '../presentation/apiValidation';

describe('P31.4 - Validacion de payloads de API', () => {
  it('acepta un alta de DDJJ valida y coerciona el periodo fiscal', () => {
    const result = createTaxReturnSchema.safeParse({
      cuit: '20-34590216-4',
      clientName: 'Lobato Francisco',
      fiscalYear: '2025',
      status: 'Borrador',
      taxParameterSetId: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fiscalYear).toBe(2025);
    }
  });

  it('rechaza CUIT corto, nombre vacio y periodo fuera de rango con mensaje legible', () => {
    const badCuit = createTaxReturnSchema.safeParse({ cuit: '123', clientName: 'X', fiscalYear: 2025 });
    expect(badCuit.success).toBe(false);
    expect(firstValidationError(badCuit)).toContain('CUIT');

    const badName = createTaxReturnSchema.safeParse({ cuit: '20-34590216-4', clientName: '  ', fiscalYear: 2025 });
    expect(badName.success).toBe(false);

    const badYear = createTaxReturnSchema.safeParse({ cuit: '20-34590216-4', clientName: 'X', fiscalYear: 1990 });
    expect(badYear.success).toBe(false);
    expect(firstValidationError(badYear)).toContain('Periodo');
  });

  it('controla content-length contra el tope configurado', () => {
    expect(exceedsContentLength(String(MAX_DECLARATION_PAYLOAD_BYTES + 1), MAX_DECLARATION_PAYLOAD_BYTES)).toBe(true);
    expect(exceedsContentLength(String(MAX_DECLARATION_PAYLOAD_BYTES - 1), MAX_DECLARATION_PAYLOAD_BYTES)).toBe(false);
    expect(exceedsContentLength(null, MAX_DECLARATION_PAYLOAD_BYTES)).toBe(false);
    expect(exceedsContentLength('no-numerico', MAX_DECLARATION_PAYLOAD_BYTES)).toBe(false);
  });

  it('mantiene topes de tamano razonables', () => {
    expect(MAX_IMPORT_TOTAL_BYTES).toBe(15 * 1024 * 1024);
    expect(MAX_DECLARATION_PAYLOAD_BYTES).toBe(6 * 1024 * 1024);
  });
});
