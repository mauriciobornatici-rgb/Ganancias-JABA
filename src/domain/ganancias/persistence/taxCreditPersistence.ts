import type { TaxCreditDraft } from '../mappers/afipTaxCreditImporter';

/**
 * Persistencia idempotente de retenciones/percepciones (TaxCreditRecord) en un período.
 * Clave de idempotencia: creditKey @@unique([fiscalPeriodId, creditKey]). Reimportar el mismo
 * archivo no duplica.
 */

type TaxCreditStore = {
  taxCreditRecord: {
    findMany(args: unknown): Promise<Array<{ creditKey: string }>>;
    createMany(args: unknown): Promise<unknown>;
  };
};

export async function persistTaxCredits(
  db: TaxCreditStore,
  fiscalPeriodId: string,
  credits: TaxCreditDraft[],
): Promise<{ inserted: number; duplicates: number }> {
  const keys = [...new Set(credits.map(c => c.creditKey))];
  const existing = await db.taxCreditRecord.findMany({
    where: { fiscalPeriodId, creditKey: { in: keys } },
    select: { creditKey: true },
  });
  const known = new Set(existing.map(c => c.creditKey));

  // Inserción EN LOTE (un solo viaje a la base): los creates fila por fila superaban
  // el timeout de la transacción interactiva desde Vercel (incidente 2026-07-19).
  const rows: Array<Record<string, unknown>> = [];
  let duplicates = 0;

  for (const credit of credits) {
    if (known.has(credit.creditKey)) {
      duplicates += 1;
      continue;
    }
    known.add(credit.creditKey);
    rows.push({
      fiscalPeriodId,
      creditKey: credit.creditKey,
      tax: credit.tax,
      kind: credit.kind,
      issueDate: credit.issueDate,
      agentCuit: credit.agentCuit,
      certificateNumber: credit.certificateNumber,
      originalAmount: credit.originalAmount.toFixed(2),
      appliedAmount: '0',
      source: credit.source,
      notes: credit.notes,
    });
  }

  if (rows.length > 0) {
    await db.taxCreditRecord.createMany({ data: rows });
  }

  return { inserted: rows.length, duplicates };
}
