import { Decimal } from 'decimal.js';

/**
 * Tasa por Inspección de Seguridad e Higiene (TISH) - punto 2 del PDF de correcciones del usuario.
 *
 * Criterios del usuario (2026-07-24):
 *  - Solo RÉGIMEN GENERAL (responsable inscripto). El régimen simplificado de monotributistas y el
 *    de Convenio Multilateral quedan fuera de este corte.
 *  - Base: la base imponible de IIBB de las actividades marcadas con el tilde "computa TISH",
 *    acumulada POR BIMESTRE (la tasa es bimestral, 6 cuotas; IVA/IIBB son mensuales).
 *  - La alícuota y la categoría L/M/N son MANUALES (la ordenanza 2026 está escaneada y el art. 23
 *    con las alícuotas no se puede leer).
 *
 * Estructura del cálculo, igual al formulario "DDJJ MONTOS IMPONIBLES (RÉGIMEN GENERAL)":
 *   una fila por actividad (monto imponible × alícuota = tasa) → Subtotal → Contribución para la
 *   Salud → Bomberos Voluntarios → Residuos no Domiciliarios → TOTAL A ABONAR.
 *
 * Reglas de la ordenanza 2026 (instructivo TISH 2026), parametrizables:
 *  - El subtotal NUNCA puede ser inferior a la cuota bimestral de la categoría K ($40.000).
 *  - Contribución para la Salud: 12% del subtotal.
 *  - Bomberos: 10% del valor de la categoría A ($8.000).
 *  - Residuos: 25% / 40% / 60% del importe de la categoría K según categoría L / M / N.
 *
 * Funciones PURAS.
 */

export const TISH_CATEGORIES = ['L', 'M', 'N'] as const;
export type TishCategory = (typeof TISH_CATEGORIES)[number];

export const TISH_BIMESTERS = [1, 2, 3, 4, 5, 6] as const;
export type TishBimester = (typeof TISH_BIMESTERS)[number];

/** Parámetros de la ordenanza del año (editables por cliente). */
export type TishParameters = {
  /** Cuota bimestral de la categoría K: piso del subtotal. */
  minimumQuota: Decimal;
  /** Cuota bimestral de la categoría A: base de la contribución a Bomberos. */
  categoryAQuota: Decimal;
  /** Contribución para la Salud sobre el subtotal (fracción, 0.12 = 12%). */
  healthRate: Decimal;
  /** Bomberos: fracción del valor de la categoría A. */
  firefightersRate: Decimal;
  /** Residuos: fracción del importe de la categoría K, por categoría. */
  wasteRateByCategory: Record<TishCategory, Decimal>;
};

export type TishActivityBase = {
  activityCode: string;
  activityLabel?: string | null;
  jurisdictionCode?: string | null;
  /** Base imponible de IIBB acumulada del bimestre para esa actividad. */
  taxableBase: Decimal;
};

export type TishActivityLine = TishActivityBase & {
  /** Tasa de la fila: base × alícuota (antes del mínimo y de los adicionales). */
  tax: Decimal;
};

export type TishBimesterResult = {
  year: number;
  bimester: TishBimester;
  months: number[];
  taxRate: Decimal;
  category: TishCategory;
  lines: TishActivityLine[];
  /** Suma de las tasas por actividad, antes del mínimo. */
  taxBeforeMinimum: Decimal;
  /** Subtotal del formulario: el mayor entre la tasa calculada y el mínimo de la categoría K. */
  subtotal: Decimal;
  /** true si el subtotal quedó fijado por el mínimo. */
  minimumApplied: boolean;
  healthContribution: Decimal;
  firefightersContribution: Decimal;
  wasteContribution: Decimal;
  total: Decimal;
  /** Fecha de presentación de la cuota, si está cargada en los parámetros del año. */
  dueDate: string | null;
  warnings: string[];
};

const ZERO = new Decimal(0);
const money = (value: Decimal): Decimal => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** Parámetros de la ordenanza 2026 de ARBAL (instructivo TISH 2026). */
export function defaultTishParameters(): TishParameters {
  return {
    minimumQuota: new Decimal(40000),
    categoryAQuota: new Decimal(8000),
    healthRate: new Decimal('0.12'),
    firefightersRate: new Decimal('0.10'),
    wasteRateByCategory: {
      L: new Decimal('0.25'),
      M: new Decimal('0.40'),
      N: new Decimal('0.60'),
    },
  };
}

/** Los valores normativos conocidos son exclusivos de 2026; no se heredan a otros años. */
export function defaultTishParametersForYear(year: number): TishParameters | null {
  return year === 2026 ? defaultTishParameters() : null;
}

/** Formulario sin parámetros normativos: obliga a cargar la ordenanza del año solicitado. */
export function emptyTishParameters(): TishParameters {
  return {
    minimumQuota: ZERO,
    categoryAQuota: ZERO,
    healthRate: ZERO,
    firefightersRate: ZERO,
    wasteRateByCategory: { L: ZERO, M: ZERO, N: ZERO },
  };
}

/** Vencimientos de presentación de las 6 cuotas 2026 (instructivo TISH 2026). */
export const TISH_DUE_DATES_2026 = [
  '2026-03-26',
  '2026-05-28',
  '2026-07-23',
  '2026-09-24',
  '2026-11-26',
  '2027-01-19',
] as const;

export function normalizeTishCategory(value: string | null | undefined): TishCategory {
  const upper = String(value ?? '').trim().toUpperCase();
  return upper === 'M' || upper === 'N' ? upper : 'L';
}

/** Bimestre al que pertenece un mes: 1-2 → 1, 3-4 → 2, … 11-12 → 6. */
export function bimesterOfMonth(month: number): TishBimester {
  const bounded = Math.min(12, Math.max(1, Math.trunc(month)));
  return (Math.ceil(bounded / 2) as TishBimester);
}

export function monthsOfBimester(bimester: TishBimester): number[] {
  return [bimester * 2 - 1, bimester * 2];
}

export type TishMonthlyActivityBase = TishActivityBase & { month: number };

/**
 * Acumula las bases mensuales de IIBB del bimestre por actividad. Las bases llegan de las
 * liquidaciones mensuales; los meses que no pertenecen al bimestre se ignoran.
 */
export function accumulateTishBimesterBases(
  monthlyBases: TishMonthlyActivityBase[],
  bimester: TishBimester,
): TishActivityBase[] {
  const months = monthsOfBimester(bimester);
  const byActivity = new Map<string, TishActivityBase>();

  for (const entry of monthlyBases) {
    if (!months.includes(entry.month)) continue;
    const key = `${entry.jurisdictionCode ?? ''}|${entry.activityCode}`;
    const existing = byActivity.get(key);
    if (existing) {
      existing.taxableBase = existing.taxableBase.add(entry.taxableBase);
      continue;
    }
    byActivity.set(key, {
      activityCode: entry.activityCode,
      activityLabel: entry.activityLabel ?? null,
      jurisdictionCode: entry.jurisdictionCode ?? null,
      taxableBase: new Decimal(entry.taxableBase),
    });
  }

  return [...byActivity.values()];
}

export type TishBimesterInput = {
  year: number;
  bimester: TishBimester;
  /** Bases del bimestre de las actividades marcadas "computa TISH". */
  activityBases: TishActivityBase[];
  /** Alícuota manual del art. 23 (fracción). */
  taxRate: Decimal;
  category: TishCategory;
  parameters: TishParameters;
  /** Vencimientos de presentación del año, en orden de cuota. */
  dueDates?: readonly string[];
};

/**
 * Liquida un bimestre. No decide si el contribuyente está en Régimen General: eso lo resuelve quien
 * llama (el módulo solo aplica el régimen general, único alcance acordado).
 */
export function calculateTishBimester(input: TishBimesterInput): TishBimesterResult {
  const warnings: string[] = [];
  const category = normalizeTishCategory(input.category);
  const taxRate = new Decimal(input.taxRate || 0);
  const params = input.parameters;

  if (taxRate.lte(0)) {
    warnings.push(
      'TISH: no hay alícuota cargada para el año. La tasa queda en el mínimo de la categoría K '
      + 'hasta que se cargue la alícuota del art. 23 de la Ordenanza Impositiva.',
    );
  }
  if (input.activityBases.length === 0) {
    warnings.push(
      'TISH: ninguna actividad del período tiene el tilde "computa TISH" o no hay base imponible '
      + 'de IIBB cargada en el bimestre. Se liquida el mínimo de la categoría K.',
    );
  }

  const lines: TishActivityLine[] = input.activityBases.map(base => ({
    activityCode: base.activityCode,
    activityLabel: base.activityLabel ?? null,
    jurisdictionCode: base.jurisdictionCode ?? null,
    taxableBase: money(new Decimal(base.taxableBase)),
    tax: money(new Decimal(base.taxableBase).mul(taxRate)),
  }));

  const taxBeforeMinimum = money(lines.reduce((sum, line) => sum.add(line.tax), ZERO));
  const minimumQuota = money(new Decimal(params.minimumQuota));
  const minimumApplied = taxBeforeMinimum.lt(minimumQuota);
  const subtotal = minimumApplied ? minimumQuota : taxBeforeMinimum;
  if (minimumApplied) {
    warnings.push(
      `TISH: la tasa calculada ($${taxBeforeMinimum.toFixed(2)}) es inferior al mínimo de la `
      + `categoría K ($${minimumQuota.toFixed(2)}), así que se abona el mínimo.`,
    );
  }

  const healthContribution = money(subtotal.mul(params.healthRate));
  const firefightersContribution = money(new Decimal(params.categoryAQuota).mul(params.firefightersRate));
  const wasteContribution = money(minimumQuota.mul(params.wasteRateByCategory[category]));
  const total = money(
    subtotal.add(healthContribution).add(firefightersContribution).add(wasteContribution),
  );

  const dueDates = input.dueDates ?? [];
  const dueDate = dueDates[input.bimester - 1] ?? null;

  return {
    year: input.year,
    bimester: input.bimester,
    months: monthsOfBimester(input.bimester),
    taxRate,
    category,
    lines,
    taxBeforeMinimum,
    subtotal,
    minimumApplied,
    healthContribution,
    firefightersContribution,
    wasteContribution,
    total,
    dueDate,
    warnings,
  };
}

export type TishYearResult = {
  year: number;
  bimesters: TishBimesterResult[];
  totalYear: Decimal;
};

/** Liquida los 6 bimestres del año con las bases mensuales disponibles. */
export function calculateTishYear(options: {
  year: number;
  monthlyBases: TishMonthlyActivityBase[];
  taxRate: Decimal;
  category: TishCategory;
  parameters: TishParameters;
  dueDates?: readonly string[];
}): TishYearResult {
  const bimesters = TISH_BIMESTERS.map(bimester => calculateTishBimester({
    year: options.year,
    bimester,
    activityBases: accumulateTishBimesterBases(options.monthlyBases, bimester),
    taxRate: options.taxRate,
    category: options.category,
    parameters: options.parameters,
    dueDates: options.dueDates,
  }));

  return {
    year: options.year,
    bimesters,
    totalYear: money(bimesters.reduce((sum, item) => sum.add(item.total), ZERO)),
  };
}

/** Serializa los vencimientos para guardarlos como texto. */
export function serializeTishDueDates(dueDates: readonly string[]): string {
  return dueDates.join(',');
}

/** Lee los vencimientos guardados; vacío o inválido devuelve lista vacía. */
export function parseTishDueDates(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(item => item.trim())
    .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item));
}
