type FiscalDocumentCleanupStore = {
  fiscalDocument: {
    deleteMany(args: {
      where: { fiscalPeriodId: string; direction?: 'SALE' | 'PURCHASE' };
    }): Promise<{ count: number }>;
  };
};

/** Elimina únicamente los comprobantes pertenecientes al período indicado. */
export async function deleteFiscalDocumentsForPeriod(
  db: unknown,
  fiscalPeriodId: string,
  direction?: 'SALE' | 'PURCHASE',
): Promise<{ deleted: number }> {
  const store = db as FiscalDocumentCleanupStore;
  const result = await store.fiscalDocument.deleteMany({
    where: {
      fiscalPeriodId,
      ...(direction ? { direction } : {}),
    },
  });
  return { deleted: result.count };
}
