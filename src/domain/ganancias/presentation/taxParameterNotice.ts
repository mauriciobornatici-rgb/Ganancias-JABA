type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord {
  return value !== null && typeof value === 'object' ? value as RawRecord : {};
}

function stringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

export function buildTaxParameterSourceNotice(
  declarationData: unknown,
  taxParameters: unknown
): string | null {
  const declaration = asRecord(declarationData);
  const params = asRecord(taxParameters);
  const parameterSet = asRecord(params.parameterSet);

  if (declaration.taxParameterSetId) return null;
  if (Object.keys(parameterSet).length === 0) return null;

  const sourceLaw = stringValue(parameterSet.sourceLaw, 'parametros default del periodo');
  const version = stringValue(parameterSet.version);
  const versionLabel = version ? ` v${version}` : '';

  return `La DDJJ no tiene resolucion explicita guardada. Se estan usando ${sourceLaw}${versionLabel} como parametros default del periodo; verificar antes de presentar.`;
}
