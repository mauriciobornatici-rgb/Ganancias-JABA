import { randomUUID } from 'node:crypto';
import { Decimal } from 'decimal.js';
import type { FiscalDocumentDraft } from '../fiscalLedger/types';

type StoredVatLine = {
  kind: string;
  taxableBase: unknown;
  rate: unknown;
  vatAmount: unknown;
  creditComputable: boolean;
};

type StoredFiscalDocument = {
  id: string;
  documentKey: string;
  direction: string;
  issueDate: Date;
  voucherType: string;
  voucherNumber: string;
  counterpartyName: string | null;
  counterpartyCuit: string | null;
  netAmount: unknown;
  totalAmount: unknown;
  vatLines: StoredVatLine[];
};

type FiscalDocumentStore = {
  fiscalDocument: {
    findMany(args: unknown): Promise<StoredFiscalDocument[]>;
    createMany(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  fiscalDocumentVatLine: {
    createMany(args: unknown): Promise<unknown>;
    deleteMany(args: unknown): Promise<unknown>;
  };
};

/**
 * Persistencia idempotente de comprobantes del libro fiscal mensual.
 *
 * Inserta comprobantes nuevos EN LOTE (documentos + líneas de IVA, con ids generados
 * en el cliente). Una reimportación idéntica se omite; si ARCA trae contenido corregido,
 * actualiza el comprobante existente y conserva su id, selección y trazabilidad. La
 * versión anterior insertaba fila por fila y, desde Vercel, superaba el timeout de la
 * transacción (incidente 2026-07-19).
 */
export async function persistFiscalDocuments(
  db: unknown,
  fiscalPeriodId: string,
  documents: FiscalDocumentDraft[],
): Promise<{ inserted: number; updated: number; duplicates: number }> {
  // Prisma expone delegados genéricos y los tests usan un store en memoria. El contrato
  // concreto se valida aquí, en el único límite compartido por ambas implementaciones.
  const store = db as FiscalDocumentStore;
  const keys = [...new Set(documents.map(document => document.documentKey))];
  const existing = await store.fiscalDocument.findMany({
    where: { fiscalPeriodId, documentKey: { in: keys } },
    select: {
      id: true,
      documentKey: true,
      direction: true,
      issueDate: true,
      voucherType: true,
      voucherNumber: true,
      counterpartyName: true,
      counterpartyCuit: true,
      netAmount: true,
      totalAmount: true,
      vatLines: {
        select: {
          kind: true,
          taxableBase: true,
          rate: true,
          vatAmount: true,
          creditComputable: true,
        },
      },
    },
  });
  const existingByKey = new Map(existing.map(document => [document.documentKey, document]));
  const processedKeys = new Set<string>();

  const documentRows: Array<Record<string, unknown>> = [];
  const vatLineRows: Array<Record<string, unknown>> = [];
  const changedDocuments: Array<{
    stored: StoredFiscalDocument;
    draft: FiscalDocumentDraft;
    vatLinesChanged: boolean;
  }> = [];
  let duplicates = 0;

  for (const document of documents) {
    if (processedKeys.has(document.documentKey)) {
      duplicates += 1;
      continue;
    }
    processedKeys.add(document.documentKey);

    const stored = existingByKey.get(document.documentKey);
    if (stored) {
      const vatLinesChanged = !sameVatLines(stored.vatLines, document.vatLines);
      if (sameDocument(stored, document) && !vatLinesChanged) {
        duplicates += 1;
      } else {
        changedDocuments.push({ stored, draft: document, vatLinesChanged });
      }
      continue;
    }

    const fiscalDocumentId = randomUUID();
    documentRows.push({
      id: fiscalDocumentId,
      fiscalPeriodId,
      documentKey: document.documentKey,
      ...documentData(document),
    });
    for (const line of document.vatLines) {
      vatLineRows.push({ ...line, fiscalDocumentId });
    }
  }

  if (documentRows.length > 0) {
    await store.fiscalDocument.createMany({ data: documentRows });
  }
  if (vatLineRows.length > 0) {
    await store.fiscalDocumentVatLine.createMany({ data: vatLineRows });
  }

  for (const { stored, draft, vatLinesChanged } of changedDocuments) {
    await store.fiscalDocument.update({
      where: { id: stored.id },
      data: documentData(draft),
    });

    if (vatLinesChanged) {
      await store.fiscalDocumentVatLine.deleteMany({ where: { fiscalDocumentId: stored.id } });
      if (draft.vatLines.length > 0) {
        await store.fiscalDocumentVatLine.createMany({
          data: draft.vatLines.map(line => ({ ...line, fiscalDocumentId: stored.id })),
        });
      }
    }
  }

  return { inserted: documentRows.length, updated: changedDocuments.length, duplicates };
}

function documentData(document: FiscalDocumentDraft): Record<string, unknown> {
  return {
    direction: document.direction,
    issueDate: document.issueDate,
    voucherType: document.voucherType,
    voucherNumber: document.voucherNumber,
    counterpartyName: document.counterpartyName,
    counterpartyCuit: document.counterpartyCuit,
    netAmount: document.netAmount,
    totalAmount: document.totalAmount,
    sourceFileName: document.sourceFileName,
  };
}

function sameDocument(stored: StoredFiscalDocument, draft: FiscalDocumentDraft): boolean {
  return stored.direction === draft.direction
    && stored.issueDate.getTime() === draft.issueDate.getTime()
    && stored.voucherType === draft.voucherType
    && stored.voucherNumber === draft.voucherNumber
    && normalizeOptional(stored.counterpartyName) === normalizeOptional(draft.counterpartyName)
    && normalizeOptional(stored.counterpartyCuit) === normalizeOptional(draft.counterpartyCuit)
    && decimalEquals(stored.netAmount, draft.netAmount)
    && decimalEquals(stored.totalAmount, draft.totalAmount);
}

function sameVatLines(stored: StoredVatLine[], draft: FiscalDocumentDraft['vatLines']): boolean {
  if (stored.length !== draft.length) return false;
  const storedLines = canonicalVatLines(stored);
  const draftLines = canonicalVatLines(draft);
  return storedLines.every((line, index) => line === draftLines[index]);
}

function canonicalVatLines(lines: Array<{
  kind: string;
  taxableBase: unknown;
  rate: unknown;
  vatAmount: unknown;
  creditComputable: boolean;
}>): string[] {
  return lines.map(line => [
    line.kind,
    decimalValue(line.rate),
    decimalValue(line.taxableBase),
    decimalValue(line.vatAmount),
    String(line.creditComputable),
  ].join('|')).sort();
}

function decimalEquals(left: unknown, right: unknown): boolean {
  return new Decimal(decimalValue(left)).equals(decimalValue(right));
}

function decimalValue(value: unknown): string {
  if (value instanceof Decimal) return value.toString();
  if (typeof value === 'object' && value !== null && 'toString' in value) return String(value);
  return String(value);
}

function normalizeOptional(value: string | null | undefined): string {
  return value ?? '';
}
