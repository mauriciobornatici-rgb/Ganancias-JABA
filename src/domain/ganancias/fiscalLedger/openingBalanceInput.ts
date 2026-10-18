import { Decimal } from 'decimal.js';
import { parseMoneyToPlain } from '../presentation/parseMoney';

export class OpeningBalanceInputError extends Error {}

export function parseOptionalOpeningBalance(
  raw: string | number | null | undefined,
  label: string,
): Decimal | undefined {
  if (raw == null || String(raw).trim() === '') return undefined;
  const plain = parseMoneyToPlain(raw);
  if (plain == null) throw new OpeningBalanceInputError(`${label}: importe inválido.`);
  const amount = new Decimal(plain);
  if (amount.isNegative()) throw new OpeningBalanceInputError(`${label}: el importe no puede ser negativo.`);
  return amount;
}

export function parseGrossIncomeOpeningBalancesJson(raw: string | null): Map<string, Decimal> {
  if (!raw) return new Map();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new OpeningBalanceInputError('Los saldos anteriores de IIBB no tienen un formato válido.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OpeningBalanceInputError('Los saldos anteriores de IIBB no tienen un formato válido.');
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 50) throw new OpeningBalanceInputError('Se recibieron demasiados saldos anteriores de IIBB.');
  const balances = new Map<string, Decimal>();
  for (const [jurisdictionCode, amount] of entries) {
    if (!jurisdictionCode.trim() || jurisdictionCode.length > 20) {
      throw new OpeningBalanceInputError('Hay un código de jurisdicción de IIBB inválido.');
    }
    const parsed = parseOptionalOpeningBalance(
      typeof amount === 'string' || typeof amount === 'number' ? amount : null,
      `Saldo anterior IIBB ${jurisdictionCode}`,
    );
    if (parsed !== undefined) balances.set(jurisdictionCode, parsed);
  }
  return balances;
}

export function mergeOpeningBalances(
  automatic: Map<string, Decimal>,
  manual: Map<string, Decimal>,
): Map<string, Decimal> {
  const merged = new Map(automatic);
  for (const [key, value] of manual) merged.set(key, value);
  return merged;
}
