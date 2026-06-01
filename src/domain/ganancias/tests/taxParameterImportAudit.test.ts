import { describe, expect, it } from 'vitest';
import { buildTaxParameterImportAuditDetails } from '../persistence/taxParameterImportAudit';

describe('buildTaxParameterImportAuditDetails', () => {
  it('arma un JSON estable con trazabilidad de la importacion de parametros', () => {
    const details = buildTaxParameterImportAuditDetails({
      fileName: 'C:\\fakepath\\Indices de actualizacion hasta 2025.xlsx',
      fileSize: 123456,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fiscalYear: 2025,
      resolutionName: 'Indices 2025 base estudio',
      parameterSetId: 'param-123',
      version: 3,
      bracketsCount: 9,
      ipcCount: 12,
      warnings: ['Advertencia de prueba'],
      usefulCoefficients: {
        decPreviousToDecCurrent: 1.3154876051,
        currentYearAverage: 1.128840454,
      },
    });

    const parsed = JSON.parse(details);

    expect(parsed.kind).toBe('tax-parameter-import');
    expect(parsed.file.name).toBe('Indices de actualizacion hasta 2025.xlsx');
    expect(parsed.file.size).toBe(123456);
    expect(parsed.fiscalYear).toBe(2025);
    expect(parsed.resolution.name).toBe('Indices 2025 base estudio');
    expect(parsed.resolution.parameterSetId).toBe('param-123');
    expect(parsed.resolution.version).toBe(3);
    expect(parsed.counts).toEqual({ brackets: 9, ipc: 12 });
    expect(parsed.warnings).toEqual(['Advertencia de prueba']);
    expect(parsed.usefulCoefficients.decPreviousToDecCurrent).toBeCloseTo(1.3154876051, 10);
  });
});
