type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord {
  return value !== null && typeof value === 'object' ? value as RawRecord : {};
}

function numberValue(value: unknown, fallback = 1): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function copyIfPresent(target: RawRecord, source: RawRecord, key: string): void {
  if (source[key] !== undefined) {
    target[key] = source[key];
  }
}

export function buildInitialTaxReturnSnapshot(payload: unknown): RawRecord {
  const source = asRecord(payload);
  const snapshot: RawRecord = {
    currentStep: numberValue(source.currentStep, 1),
  };

  [
    'taxParameterSetId',
    'generalDeductions',
    'personalDeductions',
    'sales',
    'purchases',
    'fixedAssets',
    'initialStock',
    'finalStock',
    'bankAccounts',
    'cashHoldings',
    'receivables',
    'liabilities',
    'withholdings',
    'personalAssets',
    'personalLiabilities',
    'otherJustifications',
    'activoTotalInicio',
    'pasivoTotalInicio',
    'bienesNoComputablesInicio',
    'saldoAFavorAnterior',
    'quebrantosAnteriores',
    'axiDynamic',
    'autoCalcInitialBalances',
  ].forEach(key => copyIfPresent(snapshot, source, key));

  return snapshot;
}
