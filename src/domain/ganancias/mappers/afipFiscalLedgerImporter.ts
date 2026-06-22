import { Decimal } from 'decimal.js';
import {
  type AfipExportFileInput,
  type AfipSheetCell,
  parseAfipDate,
  parseAfipDecimal,
  readAfipSheetRows,
} from './afipImporter';
import { buildFiscalDocumentKey } from '../fiscalLedger/documentKey';
import type {
  FiscalDocumentDirection,
  FiscalDocumentDraft,
  FiscalVatLineDraft,
  FiscalVatLineKind,
} from '../fiscalLedger/types';

const VAT_RATES = [
  { label: '0', rate: new Decimal(0) },
  { label: '2.5', rate: new Decimal('0.025') },
  { label: '5', rate: new Decimal('0.05') },
  { label: '10.5', rate: new Decimal('0.105') },
  { label: '21', rate: new Decimal('0.21') },
  { label: '27', rate: new Decimal('0.27') },
];

export type AfipFiscalLedgerImportOptions = {
  ownerCuit: string;
};

export type AfipFiscalLedgerImportResult = {
  documents: FiscalDocumentDraft[];
  errors: string[];
};

function normalizedHeader(value: AfipSheetCell): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function headerIndex(headers: string[], options: string[]): number {
  for (const option of options) {
    const index = headers.findIndex(header => header.includes(option));
    if (index !== -1) return index;
  }

  return -1;
}

function textCell(row: AfipSheetCell[], index: number): string {
  return index === -1 ? '' : String(row[index] ?? '').trim();
}

function moneyCell(row: AfipSheetCell[], index: number): Decimal {
  return index === -1 ? new Decimal(0) : parseAfipDecimal(row[index] ?? 0);
}

function invoiceNumber(row: AfipSheetCell[], pointOfSaleIndex: number, numberIndex: number): string {
  const number = textCell(row, numberIndex);
  if (!number) return '';

  const pointOfSale = textCell(row, pointOfSaleIndex);
  return pointOfSale ? `${pointOfSale.padStart(4, '0')}-${number.padStart(8, '0')}` : number;
}

function directionFromHeaders(headers: string[]): FiscalDocumentDirection | null {
  if (headers.some(header => header.includes('comprador') || header.includes('doc. co'))) return 'SALE';
  if (headers.some(header => header.includes('vendedor') || header.includes('doc. ve') || header.includes('credito fiscal'))) return 'PURCHASE';
  return null;
}

function rateIndex(headers: string[], prefix: 'neto gravado iva' | 'importe iva', label: string): number {
  const ratePattern = new RegExp(`(?:^|\\s)${label.replace('.', '[,.]')}(?:%|\\s|$)`);
  return headers.findIndex(header => header.includes(prefix) && ratePattern.test(header));
}

function otherAmountIndex(headers: string[], kind: FiscalVatLineKind): number {
  if (kind === 'EXEMPT') return headerIndex(headers, ['importe exento', 'importe ex']);
  return headers.findIndex(header => (
    header.includes('importe no gravado')
    || (header.includes('importe no') && !header.includes('importe neto'))
  ));
}

function vatLinesFromRow(
  row: AfipSheetCell[],
  headers: string[],
  direction: FiscalDocumentDirection,
  totalAmount: Decimal,
): FiscalVatLineDraft[] {
  const creditComputable = direction === 'PURCHASE';
  const lines: FiscalVatLineDraft[] = [];

  for (const vatRate of VAT_RATES) {
    const taxableBase = moneyCell(row, rateIndex(headers, 'neto gravado iva', vatRate.label));
    const vatAmount = moneyCell(row, rateIndex(headers, 'importe iva', vatRate.label));

    if (!taxableBase.isZero() || !vatAmount.isZero()) {
      lines.push({
        kind: 'TAXED',
        taxableBase,
        rate: vatRate.rate,
        vatAmount,
        creditComputable,
      });
    }
  }

  for (const kind of ['EXEMPT', 'NON_TAXED'] as const) {
    const taxableBase = moneyCell(row, otherAmountIndex(headers, kind));
    if (!taxableBase.isZero()) {
      lines.push({
        kind,
        taxableBase,
        rate: new Decimal(0),
        vatAmount: new Decimal(0),
        creditComputable: false,
      });
    }
  }

  if (lines.length === 0 && !totalAmount.isZero()) {
    lines.push({
      kind: 'NON_TAXED',
      taxableBase: totalAmount,
      rate: new Decimal(0),
      vatAmount: new Decimal(0),
      creditComputable: false,
    });
  }

  return lines;
}

export function parseAfipFiscalLedgerDocuments(
  file: AfipExportFileInput,
  options: AfipFiscalLedgerImportOptions,
): AfipFiscalLedgerImportResult {
  const rows = readAfipSheetRows(file.fileBuffer);
  if (rows.length === 0) {
    return { documents: [], errors: [`${file.fileName}: el archivo esta vacio.`] };
  }

  const headers = rows[0].map(normalizedHeader);
  const direction = directionFromHeaders(headers);
  if (!direction) {
    return { documents: [], errors: [`${file.fileName}: no se pudo detectar si es Ventas o Compras AFIP.`] };
  }

  const dateIndex = headerIndex(headers, ['fecha de emision', 'fecha']);
  const voucherTypeIndex = headerIndex(headers, ['tipo de comprobante', 'tipo de com']);
  const pointOfSaleIndex = headerIndex(headers, ['punto de venta', 'punto de ve', 'pto. vta']);
  const voucherNumberIndex = headerIndex(headers, ['numero de comprobante', 'nro. comprobante']);
  const totalIndex = headerIndex(headers, ['importe total', 'importe tota']);
  const counterpartyCuitIndex = direction === 'SALE'
    ? headerIndex(headers, ['nro. doc. comprador', 'doc. co'])
    : headerIndex(headers, ['nro. doc. vendedor', 'doc. ve']);
  const counterpartyNameIndex = headerIndex(headers, ['denominacion', 'razon social']);

  if (dateIndex === -1 || voucherTypeIndex === -1 || voucherNumberIndex === -1) {
    return { documents: [], errors: [`${file.fileName}: faltan Fecha, Tipo o Numero de comprobante.`] };
  }

  const documents: FiscalDocumentDraft[] = [];
  const errors: string[] = [];

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.every(cell => String(cell ?? '').trim() === '')) continue;

    try {
      const issueDate = parseAfipDate(row[dateIndex]);
      const voucherType = textCell(row, voucherTypeIndex);
      const voucherNumber = invoiceNumber(row, pointOfSaleIndex, voucherNumberIndex);
      if (!voucherType || !voucherNumber) {
        throw new Error('faltan Tipo o Numero de comprobante.');
      }

      const totalAmount = moneyCell(row, totalIndex);
      const vatLines = vatLinesFromRow(row, headers, direction, totalAmount);
      const netAmount = vatLines.reduce((total, line) => total.add(line.taxableBase), new Decimal(0));
      const resolvedTotalAmount = totalIndex === -1
        ? netAmount.add(vatLines.reduce((total, line) => total.add(line.vatAmount), new Decimal(0)))
        : totalAmount;
      const draftWithoutKey = {
        ownerCuit: options.ownerCuit,
        direction,
        issueDate,
        voucherType,
        voucherNumber,
        counterpartyName: textCell(row, counterpartyNameIndex) || undefined,
        counterpartyCuit: textCell(row, counterpartyCuitIndex) || undefined,
        netAmount,
        totalAmount: resolvedTotalAmount,
        vatLines,
        sourceFileName: file.fileName,
      };

      documents.push({
        ...draftWithoutKey,
        documentKey: buildFiscalDocumentKey(draftWithoutKey),
      });
    } catch (error) {
      errors.push(`${file.fileName}, fila ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { documents, errors };
}
