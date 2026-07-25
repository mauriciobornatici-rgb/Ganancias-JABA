import { describe, expect, it } from 'vitest';
import { buildFiscalDocumentImportFeedback } from '../presentation/fiscalImportFeedback';

describe('buildFiscalDocumentImportFeedback', () => {
  it('informa exito cuando el parser no devuelve advertencias', () => {
    const feedback = buildFiscalDocumentImportFeedback({
      inserted: 10,
      updated: 2,
      duplicates: 3,
      warnings: [],
    });

    expect(feedback.tone).toBe('success');
    expect(feedback.message).toContain('10 comprobantes nuevos');
  });

  it('expone todas las advertencias y cambia el tono visual', () => {
    const feedback = buildFiscalDocumentImportFeedback({
      inserted: 8,
      updated: 0,
      duplicates: 1,
      warnings: ['Dos filas no pudieron interpretarse.', 'Un comprobante pertenece a otro mes.'],
    });

    expect(feedback.tone).toBe('warning');
    expect(feedback.message).toContain('Dos filas no pudieron interpretarse.');
    expect(feedback.message).toContain('Un comprobante pertenece a otro mes.');
  });

  it('elimina advertencias repetidas y descarta valores invalidos', () => {
    const feedback = buildFiscalDocumentImportFeedback({
      inserted: 1,
      updated: 0,
      duplicates: 0,
      warnings: ['Revise la fila 3.', ' Revise la fila 3. ', null, ''],
    });

    expect(feedback.message.match(/Revise la fila 3\./g)).toHaveLength(1);
  });
});
