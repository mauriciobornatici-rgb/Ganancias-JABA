type DecimalLike = {
  toNumber(): number;
};

type MoneyInput = string | number | DecimalLike | null | undefined;

export function formatCurrencyWhole(value: MoneyInput): string {
  return formatCurrency(value, 0);
}

export function formatCurrencyCents(value: MoneyInput): string {
  return formatCurrency(value, 2);
}

function formatCurrency(value: MoneyInput, fractionDigits: 0 | 2): string {
  const amount = numberValue(value);
  const zero = fractionDigits === 0 ? '$0' : '$0,00';

  if (!Number.isFinite(amount)) return zero;

  return `$${amount.toLocaleString('es-AR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}

function numberValue(value: MoneyInput): number {
  if (value === null || value === undefined || value === '') return 0;

  if (typeof value === 'object' && typeof value.toNumber === 'function') {
    return value.toNumber();
  }

  return Number(value);
}
