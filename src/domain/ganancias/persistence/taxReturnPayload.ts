const DETAILED_ARRAY_FIELDS = [
  'sales',
  'purchases',
  'fixedAssets',
  'bankAccounts',
  'cashHoldings',
  'receivables',
  'liabilities',
  'withholdings',
  'personalAssets',
  'personalLiabilities',
  'otherJustifications',
  'axiDynamic',
] as const;

const DETAILED_OBJECT_FIELDS = [
  'generalDeductions',
  'personalDeductions',
] as const;

const DETAILED_VALUE_FIELDS = [
  'initialStock',
  'finalStock',
  'activoTotalInicio',
  'pasivoTotalInicio',
  'bienesNoComputablesInicio',
  'saldoAFavorAnterior',
  'quebrantosAnteriores',
] as const;

export function hasDetailedTaxReturnPayload(payload: Record<string, unknown>): boolean {
  if (DETAILED_ARRAY_FIELDS.some(field => Array.isArray(payload[field]) && payload[field].length > 0)) {
    return true;
  }

  if (
    DETAILED_OBJECT_FIELDS.some(field => {
      const value = payload[field];
      return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
    })
  ) {
    return true;
  }

  return DETAILED_VALUE_FIELDS.some(field => payload[field] !== undefined);
}
