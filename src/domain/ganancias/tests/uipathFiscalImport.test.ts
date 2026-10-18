import { describe, expect, it } from 'vitest';
import {
  buildUiPathImportIdempotencyKey,
  normalizeIntegrationCuit,
  parseIntegrationPeriod,
} from '../integrations/uipathImportContract';

describe('UiPath fiscal import contract', () => {
  it('normaliza CUIT y valida periodos mensuales', () => {
    expect(normalizeIntegrationCuit('20-35242473-1')).toBe('20352424731');
    expect(parseIntegrationPeriod('202606')).toEqual({ year: 2026, month: 6 });
    expect(parseIntegrationPeriod('202613')).toBeNull();
  });

  it('genera la misma clave idempotente sin depender del orden de archivos', () => {
    const a = [
      { fileName: 'ventas.csv', fileHash: 'aaa' },
      { fileName: 'compras.csv', fileHash: 'bbb' },
    ];
    expect(buildUiPathImportIdempotencyKey('20-35242473-1', '202606', a))
      .toBe(buildUiPathImportIdempotencyKey('20352424731', '202606', [...a].reverse()));
    expect(buildUiPathImportIdempotencyKey('20352424731', '202606', a))
      .toBe(buildUiPathImportIdempotencyKey('20352424731', '202606', [
        { fileName: 'archivo-renombrado-1.csv', fileHash: 'bbb' },
        { fileName: 'archivo-renombrado-2.csv', fileHash: 'aaa' },
      ]));
  });
});
