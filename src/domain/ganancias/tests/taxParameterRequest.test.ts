import { describe, expect, it } from 'vitest';
import { buildTaxParameterRequestUrl } from '../presentation/taxParameterRequest';

describe('buildTaxParameterRequestUrl', () => {
  it('incluye resolutionId cuando la declaracion lo tiene guardado', () => {
    expect(buildTaxParameterRequestUrl(2025, 'param-123')).toBe('/api/parametros?year=2025&resolutionId=param-123');
  });

  it('omite resolutionId para que la API use la resolucion por defecto del anio', () => {
    expect(buildTaxParameterRequestUrl(2025, null)).toBe('/api/parametros?year=2025');
    expect(buildTaxParameterRequestUrl(2025, '')).toBe('/api/parametros?year=2025');
  });
});
