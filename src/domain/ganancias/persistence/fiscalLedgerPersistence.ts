import { randomUUID } from 'node:crypto';
import type { FiscalDocumentDraft } from '../fiscalLedger/types';

type FiscalDocumentStore = {
  fiscalDocument: {
    findMany(args: unknown): Promise<Array<{ documentKey: string }>>;
    createMany(args: unknown): Promise<unknown>;
  };
  fiscalDocumentVatLine: {
    createMany(args: unknown): Promise<unknown>;
  };
};

/**
 * Persistencia idempotente de comprobantes del libro fiscal mensual.
 *
 * Inserta EN LOTE (createMany de documentos + createMany de sus líneas de IVA con
 * ids generados en el cliente): 2 viajes a la base en total, sin importar cuántos
 * comprobantes traiga el archivo. La versión anterior insertaba fila por fila con
 * creates anidados y, desde Vercel (mayor latencia), superaba el timeout de 5 s de
 * la transacción interactiva: Prisma la abortaba a mitad de camino y el insert de
 * la línea quedaba sin su documento ("FK violada en fiscalDocumentId",
 * incidente 2026-07-19).
 */
export async function persistFiscalDocuments(
  db: FiscalDocumentStore,
  fiscalPeriodId: string,
  documents: FiscalDocumentDraft[],
): Promise<{ inserted: number; duplicates: number }> {
  const keys = [...new Set(documents.map(document => document.documentKey))];
  const existing = await db.fiscalDocument.findMany({
    where: { fiscalPeriodId, documentKey: { in: keys } },
    select: { documentKey: true },
  });
  const knownKeys = new Set(existing.map(document => document.documentKey));

  const documentRows: Array<Record<string, unknown>> = [];
  const vatLineRows: Array<Record<string, unknown>> = [];
  let duplicates = 0;

  for (const document of documents) {
    if (knownKeys.has(document.documentKey)) {
      duplicates += 1;
      continue;
    }
    knownKeys.add(document.documentKey);

    const fiscalDocumentId = randomUUID();
    documentRows.push({
      id: fiscalDocumentId,
      fiscalPeriodId,
      documentKey: document.documentKey,
      direction: document.direction,
      issueDate: document.issueDate,
      voucherType: document.voucherType,
      voucherNumber: document.voucherNumber,
      counterpartyName: document.counterpartyName,
      counterpartyCuit: document.counterpartyCuit,
      netAmount: document.netAmount,
      totalAmount: document.totalAmount,
      sourceFileName: document.sourceFileName,
    });
    for (const line of document.vatLines) {
      vatLineRows.push({ ...line, fiscalDocumentId });
    }
  }

  if (documentRows.length > 0) {
    await db.fiscalDocument.createMany({ data: documentRows });
  }
  if (vatLineRows.length > 0) {
    await db.fiscalDocumentVatLine.createMany({ data: vatLineRows });
  }

  return { inserted: documentRows.length, duplicates };
}
