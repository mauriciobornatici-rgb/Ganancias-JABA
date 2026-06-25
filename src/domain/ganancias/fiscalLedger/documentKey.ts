import type { FiscalDocumentKeyInput } from './types';

function normalizedValue(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

function issueDateKey(issueDate: Date): string {
  return issueDate.toISOString().slice(0, 10);
}

export function buildFiscalDocumentKey(document: FiscalDocumentKeyInput): string {
  return [
    normalizedValue(document.ownerCuit),
    document.direction,
    issueDateKey(document.issueDate),
    normalizedValue(document.voucherType),
    normalizedValue(document.voucherNumber),
    normalizedValue(document.counterpartyCuit),
  ].join('|');
}
