import { Decimal } from 'decimal.js';
import type { SocietyParticipationInput } from '../types';

/**
 * Participación en sociedades: atribución al contribuyente del resultado de las sociedades,
 * explotaciones unipersonales y fideicomisos en los que participa (excepto art. 73, que tributan
 * por su cuenta). Punto 3 del PDF de correcciones del usuario.
 *
 * Criterio del usuario (2026-07-24): "AMBOS CON VERIFICACIÓN CRUZADA". Se cargan el porcentaje de
 * participación y el resultado total de la sociedad; la app calcula el resultado atribuido y lo deja
 * EDITABLE. Si el importe editado difiere del calculado, la diferencia se informa (nunca se corrige
 * ni se descarta en silencio): el criterio final es del contador, la app avisa.
 *
 * El resultado atribuido puede ser negativo (quebranto de la sociedad) y en ese caso resta.
 *
 * Funciones PURAS.
 */

export type SocietyParticipationLineResult = {
  cuit: string;
  denomination: string;
  societyType: string;
  participationPercent: Decimal;
  societyResult: Decimal;
  /** Resultado atribuido según % × resultado (el que calcula la app). */
  calculatedResult: Decimal;
  /** Importe finalmente computado: el editado si hay override, si no el calculado. */
  attributedResult: Decimal;
  /** true si el usuario reemplazó el importe calculado. */
  isOverridden: boolean;
  /** attributedResult - calculatedResult (0 si no hay override). */
  difference: Decimal;
  /** Justificación profesional del reemplazo manual. */
  overrideReason: string;
};

export type SocietyParticipationResult = {
  lines: SocietyParticipationLineResult[];
  /** Suma de los resultados atribuidos: se suma al resultado neto de tercera categoría. */
  totalAttributedResult: Decimal;
  /** Suma de lo que habría dado el cálculo sin ediciones manuales. */
  totalCalculatedResult: Decimal;
  warnings: string[];
};

const ZERO = new Decimal(0);
const money = (value: Decimal): Decimal => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** Fila tal como la edita la pantalla (importes como texto, vacíos posibles). */
export type RawSocietyParticipationRow = {
  cuit?: string;
  denomination?: string;
  societyType?: string;
  participationPercent?: string | number | null;
  societyResult?: string | number | null;
  attributedResultOverride?: string | number | null;
  overrideReason?: string | null;
};

export type SocietyParticipationValidationIssue = {
  index: number;
  field: 'cuit' | 'denomination' | 'participationPercent' | 'overrideReason';
  message: string;
};

function rawDecimal(value: string | number | null | undefined): Decimal {
  if (value === null || value === undefined || value === '') return ZERO;
  const parsed = new Decimal(String(value).replace(',', '.'));
  return parsed.isFinite() ? parsed : ZERO;
}

function rawOptionalDecimal(value: string | number | null | undefined): Decimal | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = new Decimal(String(value).replace(',', '.'));
  return parsed.isFinite() ? parsed : null;
}

/**
 * Convierte las filas de pantalla en entradas del cálculo. Tolera importes vacíos o con coma
 * decimal, para que la grilla y el motor interpreten lo mismo (el override vacío = usar calculado).
 */
export function toSocietyParticipationInputs(rows: RawSocietyParticipationRow[]): SocietyParticipationInput[] {
  return rows.map(row => ({
    cuit: row.cuit ?? '',
    denomination: row.denomination ?? '',
    societyType: row.societyType ?? '',
    participationPercent: rawDecimal(row.participationPercent),
    societyResult: rawDecimal(row.societyResult),
    attributedResultOverride: rawOptionalDecimal(row.attributedResultOverride),
    overrideReason: row.overrideReason?.trim() ?? '',
  }));
}

export function normalizeArgentineCuit(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return value.trim();
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

export function isValidArgentineCuit(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return false;

  const factors = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = factors.reduce((total, factor, index) => total + Number(digits[index]) * factor, 0);
  let verifier = 11 - (sum % 11);
  if (verifier === 11) verifier = 0;
  if (verifier === 10) verifier = 9;
  return verifier === Number(digits[10]);
}

/**
 * Reglas que deben cumplirse antes de cerrar la DDJJ. En borrador se informan como advertencias
 * para no impedir el autoguardado de una fila que el usuario todavía está completando.
 */
export function validateSocietyParticipationInputs(
  participations: SocietyParticipationInput[],
): SocietyParticipationValidationIssue[] {
  const issues: SocietyParticipationValidationIssue[] = [];
  const firstIndexByCuit = new Map<string, number>();

  participations.forEach((participation, index) => {
    const normalizedCuit = participation.cuit.replace(/\D/g, '');
    const percent = new Decimal(participation.participationPercent || 0);
    const societyResult = new Decimal(participation.societyResult || 0);
    const calculated = computeAttributedResult(societyResult, percent);
    const override = participation.attributedResultOverride;
    const hasDifferentOverride = override !== undefined
      && override !== null
      && !money(new Decimal(override)).eq(calculated);

    if (!isValidArgentineCuit(participation.cuit)) {
      issues.push({
        index,
        field: 'cuit',
        message: `Fila ${index + 1}: el CUIT de la sociedad es obligatorio y debe tener un dígito verificador válido.`,
      });
    } else if (firstIndexByCuit.has(normalizedCuit)) {
      issues.push({
        index,
        field: 'cuit',
        message: `Fila ${index + 1}: el CUIT ${normalizeArgentineCuit(participation.cuit)} ya fue cargado en la fila ${(firstIndexByCuit.get(normalizedCuit) ?? 0) + 1}.`,
      });
    } else {
      firstIndexByCuit.set(normalizedCuit, index);
    }

    if (!participation.denomination.trim()) {
      issues.push({
        index,
        field: 'denomination',
        message: `Fila ${index + 1}: la denominación de la sociedad es obligatoria.`,
      });
    }
    if (percent.lte(0) || percent.gt(100)) {
      issues.push({
        index,
        field: 'participationPercent',
        message: `Fila ${index + 1}: el porcentaje debe ser mayor a 0 y no superar 100.`,
      });
    }
    if (hasDifferentOverride && !participation.overrideReason?.trim()) {
      issues.push({
        index,
        field: 'overrideReason',
        message: `Fila ${index + 1}: indique el motivo del resultado atribuido manual.`,
      });
    }
  });

  return issues;
}

/** Resultado atribuido = resultado total de la sociedad × porcentaje de participación. */
export function computeAttributedResult(societyResult: Decimal, participationPercent: Decimal): Decimal {
  return money(societyResult.mul(participationPercent).div(100));
}

function labelOf(line: SocietyParticipationInput): string {
  const name = line.denomination?.trim();
  if (name) return name;
  const cuit = line.cuit?.trim();
  return cuit ? `CUIT ${cuit}` : 'sociedad sin identificar';
}

/**
 * Consolida las participaciones cargadas. No filtra filas con importes en cero: una sociedad con
 * resultado 0 es información válida (se declaró la participación), solo no mueve el resultado.
 */
export function calculateSocietyParticipations(
  participations: SocietyParticipationInput[],
): SocietyParticipationResult {
  const lines: SocietyParticipationLineResult[] = [];
  const warnings: string[] = [];
  let totalAttributedResult = ZERO;
  let totalCalculatedResult = ZERO;

  participations.forEach(participation => {
    const percent = new Decimal(participation.participationPercent || 0);
    const societyResult = new Decimal(participation.societyResult || 0);
    const calculatedResult = computeAttributedResult(societyResult, percent);

    const hasOverride = participation.attributedResultOverride !== undefined
      && participation.attributedResultOverride !== null;
    const overrideValue = hasOverride ? money(new Decimal(participation.attributedResultOverride!)) : null;
    const attributedResult = overrideValue ?? calculatedResult;
    const difference = attributedResult.sub(calculatedResult);
    const overrideReason = participation.overrideReason?.trim() ?? '';

    const label = labelOf(participation);

    if (percent.lte(0)) {
      warnings.push(
        `Participación en ${label}: el porcentaje de participación es ${percent.toFixed(2)}%. ` +
        'Sin porcentaje, el resultado atribuido calculado es 0.',
      );
    }
    if (percent.gt(100)) {
      warnings.push(
        `Participación en ${label}: el porcentaje cargado (${percent.toFixed(2)}%) es mayor a 100%. ` +
        'Verificá el dato: se computó tal cual se cargó.',
      );
    }
    if (hasOverride && !difference.isZero()) {
      warnings.push(
        `Participación en ${label}: el resultado atribuido cargado a mano ($${attributedResult.toFixed(2)}) ` +
        `difiere en $${difference.toFixed(2)} del calculado por ${percent.toFixed(2)}% sobre ` +
        `$${societyResult.toFixed(2)} ($${calculatedResult.toFixed(2)}). Se computó el importe cargado.`,
      );
      if (!overrideReason) {
        warnings.push(
          `Participación en ${label}: falta justificar el resultado atribuido cargado a mano. `
          + 'La DDJJ no podrá cerrarse hasta indicar el motivo.',
        );
      }
    }
    if (!isValidArgentineCuit(participation.cuit)) {
      warnings.push(`Participación en ${label}: el CUIT está vacío o tiene un dígito verificador inválido.`);
    }
    if (!participation.denomination?.trim()) {
      warnings.push(`Participación con CUIT ${normalizeArgentineCuit(participation.cuit)}: falta la denominación.`);
    }

    lines.push({
      cuit: normalizeArgentineCuit(participation.cuit?.trim() ?? ''),
      denomination: participation.denomination?.trim() ?? '',
      societyType: participation.societyType?.trim() ?? '',
      participationPercent: percent,
      societyResult: money(societyResult),
      calculatedResult,
      attributedResult,
      isOverridden: hasOverride && !difference.isZero(),
      difference,
      overrideReason,
    });

    totalAttributedResult = totalAttributedResult.add(attributedResult);
    totalCalculatedResult = totalCalculatedResult.add(calculatedResult);
  });

  // CUIT repetido: casi siempre es la misma sociedad cargada dos veces (duplicaría el resultado).
  const cuits = lines.map(line => line.cuit.replace(/\D/g, '')).filter(cuit => cuit !== '');
  const duplicated = [...new Set(cuits.filter((cuit, index) => cuits.indexOf(cuit) !== index))];
  duplicated.forEach(cuit => {
    warnings.push(
      `Participación en sociedades: el CUIT ${normalizeArgentineCuit(cuit)} aparece en más de una fila. ` +
      'Si es la misma sociedad, el resultado se está atribuyendo dos veces.',
    );
  });

  return {
    lines,
    totalAttributedResult: money(totalAttributedResult),
    totalCalculatedResult: money(totalCalculatedResult),
    warnings,
  };
}
