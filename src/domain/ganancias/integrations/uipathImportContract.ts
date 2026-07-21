import { createHash } from 'node:crypto';

export function normalizeIntegrationCuit(value: string): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function parseIntegrationPeriod(value: string): { year: number; month: number } | null {
  const match = /^(20\d{2})(0[1-9]|1[0-2])$/.exec(value);
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
}

export function buildUiPathImportIdempotencyKey(
  ownerCuit: string,
  period: string,
  manifest: Array<{ fileName: string; fileHash: string }>,
): string {
  const files = [...manifest]
    .map(file => file.fileHash)
    .sort()
    .join('|');
  return createHash('sha256').update(`${normalizeIntegrationCuit(ownerCuit)}|${period}|${files}`).digest('hex');
}
