import { Decimal } from 'decimal.js';
import type { VatSettlementView, GrossIncomeSettlementView } from '../fiscalLedger/settlementBuilders';

/**
 * Persistencia de las liquidaciones mensuales (IVA e IIBB).
 *
 * Flujo del usuario: calcula → muestra los totales → los COTEJA contra AFIP/ARCA → si coinciden,
 * GUARDA. Al guardar se versiona (no se pisa una liquidación anterior; se crea version+1) y se
 * registran tanto los valores calculados por la app como los OFICIALES con los que se cotejó,
 * de modo que quede trazabilidad de la conciliación. Solo las liquidaciones cotejadas (status
 * CLOSED) alimentan luego la liquidación anual de Ganancias.
 *
 * Funciones puras respecto de Prisma: reciben un "store" mínimo (el cliente o una tx), de modo que
 * se pueden testear con un doble en memoria.
 */

type DecimalLike = Decimal | string | number;

const toStr = (v: DecimalLike | null | undefined): string | null =>
  v === null || v === undefined ? null : new Decimal(v.toString()).toFixed(2);

/** Tolerancia de cotejo: diferencias por debajo de 1 centavo se consideran coincidentes. */
const COTEJO_TOLERANCE = new Decimal('0.01');

export type OfficialCotejo = {
  /** Débito fiscal según AFIP (lo que el usuario ve en el F2002). */
  debitFiscal?: DecimalLike | null;
  /** Crédito fiscal según AFIP. */
  creditFiscal?: DecimalLike | null;
  /** Saldo a pagar según AFIP. */
  amountDue?: DecimalLike | null;
  /** Referencia del cotejo (nº de presentación, fecha, observación). */
  reference?: string | null;
};

export type CotejoCheck = {
  /** true solo si los tres importes (débito, crédito, saldo) están presentes y coinciden. */
  matches: boolean;
  /** true si se cargaron los tres importes oficiales (cotejo completo). */
  complete: boolean;
  /** Conceptos oficiales que faltan cargar para un cotejo completo. */
  missing: string[];
  diffs: Array<{ concept: string; app: string; official: string; diff: string }>;
};

const present = (v: DecimalLike | null | undefined): boolean => v !== null && v !== undefined && String(v).trim() !== '';

/**
 * Compara los totales calculados contra los oficiales de AFIP.
 *
 * Regla del contador: para CERRAR (CLOSED) deben estar presentes y coincidir los TRES importes
 * —débito fiscal, crédito fiscal y saldo a pagar—. Un cotejo parcial (p. ej. solo el saldo) NO
 * habilita el cierre: `matches` exige `complete`. Informa además qué importes faltan y las
 * diferencias detectadas, para que la UI/route decida (CLOSED, IN_REVIEW o pedir completar).
 */
export function checkVatCotejo(view: VatSettlementView, official?: OfficialCotejo | null): CotejoCheck {
  const diffs: CotejoCheck['diffs'] = [];
  if (!official) return { matches: false, complete: false, missing: ['debitFiscal', 'creditFiscal', 'amountDue'], diffs };

  const missing: string[] = [];
  const compare = (concept: string, app: Decimal, off: DecimalLike | null | undefined) => {
    if (!present(off)) {
      missing.push(concept);
      return;
    }
    const offDec = new Decimal(String(off).toString());
    const diff = app.sub(offDec).abs();
    if (diff.greaterThan(COTEJO_TOLERANCE)) {
      diffs.push({ concept, app: app.toFixed(2), official: offDec.toFixed(2), diff: diff.toFixed(2) });
    }
  };

  compare('debitFiscal', view.settlement.debitFiscal, official.debitFiscal);
  compare('creditFiscal', view.settlement.creditFiscal, official.creditFiscal);
  compare('amountDue', view.settlement.amountDue, official.amountDue);

  const complete = missing.length === 0;
  // matches solo es verdadero con cotejo COMPLETO y sin diferencias.
  return { matches: complete && diffs.length === 0, complete, missing, diffs };
}

/** Arma las líneas de detalle de la liquidación de IVA (desglose por alícuota) para persistir. */
export function buildVatSettlementLines(view: VatSettlementView): Array<{
  concept: string;
  rate: string | null;
  amount: string;
  sourceReference: string | null;
}> {
  const lines: Array<{ concept: string; rate: string | null; amount: string; sourceReference: string | null }> = [];
  for (const r of view.debitByRate) {
    lines.push({ concept: 'DEBITO_FISCAL', rate: r.rate, amount: r.vatAmount.toFixed(2), sourceReference: `base:${r.taxableBase.toFixed(2)}` });
  }
  for (const r of view.creditByRate) {
    lines.push({
      concept: r.computable ? 'CREDITO_FISCAL' : 'CREDITO_NO_COMPUTABLE',
      rate: r.rate,
      amount: r.vatAmount.toFixed(2),
      sourceReference: `base:${r.taxableBase.toFixed(2)}`,
    });
  }
  if (view.settlement.creditsApplied.greaterThan(0)) {
    lines.push({ concept: 'PERCEP_RET_APLICADAS', rate: null, amount: view.settlement.creditsApplied.toFixed(2), sourceReference: null });
  }
  return lines;
}

type VatSettlementStore = {
  vatSettlement: {
    findFirst(args: unknown): Promise<{ version: number } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string; version: number; status: string }>;
  };
};

export type PersistVatSettlementInput = {
  fiscalPeriodId: string;
  view: VatSettlementView;
  previousTechnicalBalance: DecimalLike;
  /** Valores oficiales con los que se cotejó (opcional). */
  official?: OfficialCotejo | null;
  /** Estado a guardar. Si se omite se decide por el cotejo: CLOSED si coincide, IN_REVIEW si no. */
  status?: 'DRAFT' | 'IN_REVIEW' | 'READY_TO_FILE' | 'FILED_EXTERNALLY' | 'CLOSED' | 'ANNULLED';
  notes?: string | null;
};

/** Detecta la violación de unicidad de Prisma (P2002), p. ej. colisión de (fiscalPeriodId, version). */
function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'P2002');
}

export async function persistVatSettlement(store: VatSettlementStore, input: PersistVatSettlementInput) {
  const cotejo = checkVatCotejo(input.view, input.official);
  // Solo cierra (CLOSED) un cotejo COMPLETO y coincidente; parcial o con diferencias → IN_REVIEW.
  const status = input.status ?? (input.official ? (cotejo.matches ? 'CLOSED' : 'IN_REVIEW') : 'DRAFT');
  const s = input.view.settlement;

  const buildData = (version: number) => ({
    fiscalPeriodId: input.fiscalPeriodId,
    version,
    status,
    previousTechnicalBalance: toStr(input.previousTechnicalBalance) ?? '0',
    debitFiscal: s.debitFiscal.toFixed(2),
    creditFiscal: s.creditFiscal.toFixed(2),
    technicalCarryForward: s.technicalCarryForward.toFixed(2),
    freeAvailabilityBalance: s.freeAvailabilityBalance.toFixed(2),
    amountDue: s.amountDue.toFixed(2),
    officialAmount: toStr(input.official?.amountDue),
    officialReference: input.official?.reference ?? null,
    filedAt: status === 'CLOSED' ? new Date() : null,
    notes: input.notes ?? null,
    lines: { create: buildVatSettlementLines(input.view) },
  });

  // Versionado seguro ante doble envío: si dos solicitudes calculan la misma versión, el índice
  // único (fiscalPeriodId, version) hace fallar a una; se reintenta recomputando la versión.
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const last = await store.vatSettlement.findFirst({
      where: { fiscalPeriodId: input.fiscalPeriodId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (last?.version ?? -1) + 1;
    try {
      const created = await store.vatSettlement.create({ data: buildData(version) });
      return { id: created.id, version: created.version, status: created.status, cotejo };
    } catch (error) {
      lastError = error;
      if (!isUniqueViolation(error)) throw error;
      // colisión de versión: reintenta
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('No se pudo asignar una versión de liquidación tras varios intentos.');
}

type GrossIncomeSettlementStore = {
  grossIncomeSettlement: {
    findFirst(args: unknown): Promise<{ version: number } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string; version: number; status: string }>;
  };
};

export type PersistGrossIncomeSettlementInput = {
  fiscalPeriodId: string;
  view: GrossIncomeSettlementView;
  status?: 'DRAFT' | 'IN_REVIEW' | 'READY_TO_FILE' | 'FILED_EXTERNALLY' | 'CLOSED' | 'ANNULLED';
  /** Cotejo opcional contra el organismo (total a pagar oficial + referencia). */
  official?: { amount?: DecimalLike | null; reference?: string | null } | null;
  notes?: string | null;
};

export async function persistGrossIncomeSettlement(
  store: GrossIncomeSettlementStore,
  input: PersistGrossIncomeSettlementInput,
) {
  const s = input.view.settlement;
  const status = input.status ?? 'DRAFT';

  const buildData = (version: number) => ({
    fiscalPeriodId: input.fiscalPeriodId,
    version,
    regime: s.regime,
    status,
    totalDeterminedTax: s.totalDeterminedTax.toFixed(2),
    totalCredits: s.totalCreditsApplied.toFixed(2),
    totalBalance: s.totalBalanceDue.toFixed(2),
    officialAmount: toStr(input.official?.amount),
    officialReference: input.official?.reference ?? null,
    filedAt: status === 'CLOSED' ? new Date() : null,
    notes: input.notes ?? null,
    jurisdictionLines: {
      create: s.jurisdictionLines.map(l => ({
        jurisdictionCode: l.jurisdictionCode,
        coefficient: l.coefficient ? new Decimal(l.coefficient.toString()).toFixed(10) : null,
        assignedBase: l.assignedBase.toFixed(2),
        taxRate: l.taxRate.toFixed(6),
        determinedTax: l.determinedTax.toFixed(2),
        creditsApplied: l.creditsApplied.toFixed(2),
        balance: l.balanceDue.toFixed(2),
      })),
    },
  });

  // Versionado seguro ante doble envío (mismo criterio que IVA).
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const last = await store.grossIncomeSettlement.findFirst({
      where: { fiscalPeriodId: input.fiscalPeriodId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (last?.version ?? -1) + 1;
    try {
      const created = await store.grossIncomeSettlement.create({ data: buildData(version) });
      return { id: created.id, version: created.version, status: created.status };
    } catch (error) {
      lastError = error;
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('No se pudo asignar una versión de liquidación de IIBB.');
}
