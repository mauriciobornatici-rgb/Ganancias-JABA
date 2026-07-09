export const TAX_RETURN_PERSISTENCE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
} as const;

export class TaxReturnInvalidPayloadError extends Error {
  readonly fieldPath: string;

  constructor(fieldPath: string, value: unknown) {
    super(buildTaxReturnInvalidPayloadMessage(fieldPath, value));
    this.name = 'TaxReturnInvalidPayloadError';
    this.fieldPath = fieldPath;
  }
}

export function buildTaxReturnInvalidPayloadMessage(fieldPath: string, value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return `Dato faltante o invalido en ${fieldPath}. Revise la carga antes de guardar.`;
  }

  return `Dato invalido en ${fieldPath}: ${String(value).slice(0, 80)}. Revise la carga antes de guardar.`;
}
