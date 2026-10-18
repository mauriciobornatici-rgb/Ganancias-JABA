import type { FiscalDocumentDraft, FiscalDocumentDirection } from './types';

/**
 * Control de imputación de la carga mensual: un archivo de enero no debe entrar al período de
 * febrero.
 *
 * Criterio del usuario (2026-07-24): TOLERANTE CON AVISO. Se importan los comprobantes que sí
 * pertenecen al mes y se informan los que quedaron afuera, en vez de rechazar el lote entero por
 * una fila corrida. Es el mismo criterio que ya aplica el importador de retenciones. Si NINGUNO
 * pertenece al período (típico: cargar el archivo en el mes equivocado), no se importa nada.
 */

export type FiscalDocumentPeriodMismatch = {
  direction: FiscalDocumentDirection;
  issueDate: string;
  sourceFileName?: string;
};

export type FiscalDocumentPeriodPartition = {
  /** Comprobantes que pertenecen al período y se van a persistir. */
  inPeriod: FiscalDocumentDraft[];
  /** Comprobantes de otro mes/año: no se persisten y se informan. */
  mismatches: FiscalDocumentPeriodMismatch[];
};

/** Separa el lote en lo que corresponde al período y lo que hay que dejar afuera. */
export function partitionFiscalDocumentsByPeriod(
  documents: FiscalDocumentDraft[],
  expectedYear: number,
  expectedMonth: number,
): FiscalDocumentPeriodPartition {
  const inPeriod: FiscalDocumentDraft[] = [];
  const mismatches: FiscalDocumentPeriodMismatch[] = [];

  for (const document of documents) {
    const belongs = document.issueDate.getUTCFullYear() === expectedYear
      && document.issueDate.getUTCMonth() + 1 === expectedMonth;
    if (belongs) {
      inPeriod.push(document);
      continue;
    }
    mismatches.push({
      direction: document.direction,
      issueDate: document.issueDate.toISOString().slice(0, 10),
      sourceFileName: document.sourceFileName,
    });
  }

  return { inPeriod, mismatches };
}

export function findFiscalDocumentPeriodMismatches(
  documents: FiscalDocumentDraft[],
  expectedYear: number,
  expectedMonth: number,
): FiscalDocumentPeriodMismatch[] {
  return documents
    .filter(document => (
      document.issueDate.getUTCFullYear() !== expectedYear
      || document.issueDate.getUTCMonth() + 1 !== expectedMonth
    ))
    .map(document => ({
      direction: document.direction,
      issueDate: document.issueDate.toISOString().slice(0, 10),
      sourceFileName: document.sourceFileName,
    }));
}

export function fiscalDocumentPeriodMismatchMessage(
  mismatches: FiscalDocumentPeriodMismatch[],
  expectedYear: number,
  expectedMonth: number,
): string {
  if (mismatches.length === 0) return '';

  const expected = `${String(expectedMonth).padStart(2, '0')}/${expectedYear}`;
  const examples = mismatches
    .slice(0, 5)
    .map(mismatch => {
      const kind = mismatch.direction === 'SALE' ? 'venta' : 'compra';
      const source = mismatch.sourceFileName ? ` (${mismatch.sourceFileName})` : '';
      return `${kind} ${mismatch.issueDate}${source}`;
    })
    .join(', ');
  const remaining = mismatches.length > 5 ? ` y ${mismatches.length - 5} más` : '';

  return `${mismatches.length} comprobante(s) no pertenecen al período ${expected} y NO se importaron. `
    + `Ejemplos: ${examples}${remaining}.`;
}

/** Mensaje de bloqueo cuando NINGÚN comprobante del lote pertenece al período. */
export function fiscalDocumentPeriodRejectionMessage(
  mismatches: FiscalDocumentPeriodMismatch[],
  expectedYear: number,
  expectedMonth: number,
): string {
  const expected = `${String(expectedMonth).padStart(2, '0')}/${expectedYear}`;
  const months = [...new Set(mismatches.map(m => m.issueDate.slice(0, 7)))].sort();
  const detail = months.length <= 3 ? ` El archivo corresponde a ${months.join(', ')}.` : '';
  return `Ningún comprobante del archivo pertenece al período ${expected}, así que no se importó nada.${detail} `
    + 'Verifique que sea el archivo del mes que está liquidando.';
}
