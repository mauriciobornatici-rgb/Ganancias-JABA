import { Decimal } from 'decimal.js';

export type FiscalDocumentDirection = 'SALE' | 'PURCHASE';
export type FiscalVatLineKind = 'TAXED' | 'EXEMPT' | 'NON_TAXED';

export type FiscalVatLineDraft = {
  kind: FiscalVatLineKind;
  taxableBase: Decimal;
  rate: Decimal;
  vatAmount: Decimal;
  creditComputable: boolean;
};

export type FiscalDocumentDraft = {
  ownerCuit: string;
  documentKey: string;
  direction: FiscalDocumentDirection;
  issueDate: Date;
  voucherType: string;
  voucherNumber: string;
  counterpartyName?: string;
  counterpartyCuit?: string;
  netAmount: Decimal;
  totalAmount: Decimal;
  vatLines: FiscalVatLineDraft[];
  sourceFileName?: string;
};

export type FiscalDocumentKeyInput = Omit<FiscalDocumentDraft, 'documentKey'>;
