import type { FiscalDocumentDraft } from '../fiscalLedger/types';

type FiscalDocumentStore = {
  fiscalDocument: {
    findMany(args: unknown): Promise<Array<{ documentKey: string }>>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
};

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
  let inserted = 0;
  let duplicates = 0;

  for (const document of documents) {
    if (knownKeys.has(document.documentKey)) {
      duplicates += 1;
      continue;
    }

    await db.fiscalDocument.create({
      data: {
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
        vatLines: { create: document.vatLines },
      },
    });
    knownKeys.add(document.documentKey);
    inserted += 1;
  }

  return { inserted, duplicates };
}
