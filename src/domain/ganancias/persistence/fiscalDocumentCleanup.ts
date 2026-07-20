type FiscalDocumentCleanupStore = {
  fiscalDocument: {
    deleteMany(args: { where: { fiscalPeriodId: string } }): Promise<{ count: number }>;
  };
};

/** Elimina únicamente los comprobantes pertenecientes al período indicado. */
export async function deleteFiscalDocumentsForPeriod(
  db: unknown,
  fiscalPeriodId: string,
): Promise<{ deleted: number }> {
  const store = db as FiscalDocumentCleanupStore;
  const result = await store.fiscalDocument.deleteMany({ where: { fiscalPeriodId } });
  return { deleted: result.count };
}
