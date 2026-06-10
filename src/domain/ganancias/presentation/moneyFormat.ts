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

/**
 * P31.7: normaliza importes escritos/pegados en formato argentino a formato numerico estandar.
 * "1.234.567,89" -> "1234567.89" | "1234,56" -> "1234.56" | "$ 1.500" -> "1500" (con coma o
 * patron claro de miles). Las cadenas ya estandar ("1234.56") se devuelven intactas para no
 * corromper valores provenientes de la base o de importaciones.
 */
export function normalizeArgentineAmountInput(raw: string): string {
  if (typeof raw !== 'string') return raw;

  let value = raw.trim().replace(/\$/g, '').replace(/\s+/g, '');
  if (value === '') return '';

  const negative = value.startsWith('-');
  if (negative) value = value.slice(1);

  if (value.includes(',')) {
    // Formato AR explicito: los puntos son separadores de miles y la coma es decimal.
    value = value.replace(/\./g, '').replace(/,/, '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(value)) {
    // Solo puntos en grupos de tres: patron inequivoco de miles ("1.234.567").
    value = value.replace(/\./g, '');
  }
  // Caso restante sin coma (ej. "1234.56"): se asume decimal estandar y no se toca.

  if (!/^\d*(\.\d*)?$/.test(value)) return raw.trim();

  return negative ? `-${value}` : value;
}
