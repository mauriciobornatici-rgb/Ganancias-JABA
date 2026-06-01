type InvoiceTraceInput = {
  invoiceType?: unknown;
  invoiceNumber?: unknown;
  counterpartyName?: unknown;
  counterpartyCuit?: unknown;
  ivaAmount?: unknown;
  totalAmount?: unknown;
};

export type InvoiceTraceSummary = {
  primary: string;
  secondary: string;
  amounts: string;
  hasTrace: boolean;
};

export function buildInvoiceTraceSummary(input: InvoiceTraceInput): InvoiceTraceSummary {
  const invoiceType = cleanString(input.invoiceType);
  const invoiceNumber = cleanString(input.invoiceNumber);
  const counterpartyName = cleanString(input.counterpartyName);
  const counterpartyCuit = cleanString(input.counterpartyCuit);
  const ivaAmount = moneyLabel(input.ivaAmount);
  const totalAmount = moneyLabel(input.totalAmount);

  const hasTrace = Boolean(invoiceType || invoiceNumber || counterpartyName || counterpartyCuit || ivaAmount || totalAmount);
  const primary = [invoiceType, invoiceNumber].filter(Boolean).join(' ') || 'Carga manual';
  const secondary = [
    counterpartyName,
    counterpartyCuit ? `CUIT ${counterpartyCuit}` : '',
  ].filter(Boolean).join(' - ') || 'Sin contraparte importada';
  const amounts = [
    ivaAmount ? `IVA ${ivaAmount}` : '',
    totalAmount ? `Total ${totalAmount}` : '',
  ].filter(Boolean).join(' - ');

  return {
    primary,
    secondary,
    amounts,
    hasTrace,
  };
}

function cleanString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function moneyLabel(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';

  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) return '';

  return `$${amount.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
