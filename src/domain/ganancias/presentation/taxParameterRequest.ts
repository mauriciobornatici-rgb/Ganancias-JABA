export function buildTaxParameterRequestUrl(
  fiscalYear: number | string,
  resolutionId?: string | null
): string {
  const params = new URLSearchParams({ year: String(fiscalYear) });

  if (resolutionId) {
    params.set('resolutionId', resolutionId);
  }

  return `/api/parametros?${params.toString()}`;
}
