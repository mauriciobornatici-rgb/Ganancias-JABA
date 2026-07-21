import { Decimal } from 'decimal.js';

/**
 * Liquidación mensual de Ingresos Brutos (IIBB).
 *
 * Régimenes (enum GrossIncomeRegime del schema):
 *  - ARBA_LOCAL / ARBA_SIMPLIFICADO: una sola jurisdicción; toda la base imponible tributa ahí.
 *  - CM_REGIMEN_GENERAL: Convenio Multilateral. La base se reparte entre jurisdicciones según el
 *    coeficiente unificado (CM05, 50% ingresos + 50% gastos del año anterior; suma = 1).
 *  - CM_REGIMEN_ESPECIAL: igual estructura, pero el coeficiente/alícuota lo define el régimen
 *    especial de la actividad (este motor toma el coeficiente y la alícuota ya provistos).
 *  - NONE: no liquida IIBB.
 *
 * Por jurisdicción: base asignada × alícuota = impuesto determinado. Las percepciones/retenciones
 * de IIBB de esa jurisdicción se aplican contra su impuesto; el excedente queda como saldo a favor
 * que se arrastra al mes siguiente (igual criterio que el saldo a favor de IVA).
 *
 * Decimal en todo para evitar error de coma flotante. Los montos se redondean a 2 decimales por
 * jurisdicción (cada jurisdicción declara su propio importe).
 */

export type GrossIncomeRegime =
  | 'NONE'
  | 'ARBA_LOCAL'
  | 'ARBA_SIMPLIFICADO'
  | 'CM_REGIMEN_GENERAL'
  | 'CM_REGIMEN_ESPECIAL';

export type GrossIncomeJurisdictionInput = {
  jurisdictionCode: string;
  activityCode?: string;
  /** Alícuota de la actividad en esa jurisdicción (fracción, ej. 0.05 = 5%). */
  taxRate: Decimal;
  /** Coeficiente unificado CM (solo Convenio Multilateral). En régimen local se asume 1. */
  coefficient?: Decimal;
  /** Percepciones/retenciones de IIBB sufridas en esa jurisdicción. */
  credits?: Array<{ amount: Decimal }>;
  /** Saldo a favor de IIBB arrastrado del mes anterior en esa jurisdicción. */
  previousFavorBalance?: Decimal;
  /**
   * Base imponible asignada explícitamente a esta línea (criterio 2026-07-20 "reparto por monto"):
   * cuando una jurisdicción tiene varias actividades con distinta alícuota, el usuario indica la base
   * de cada una. Si está presente, se usa tal cual (no se aplica base total × coeficiente).
   */
  assignedBaseOverride?: Decimal;
};

export type GrossIncomeSettlementInput = {
  regime: GrossIncomeRegime;
  /** Base imponible total del mes (ingresos gravados, neto). */
  taxableBase: Decimal;
  jurisdictions: GrossIncomeJurisdictionInput[];
};

export type GrossIncomeJurisdictionResult = {
  jurisdictionCode: string;
  activityCode?: string;
  coefficient: Decimal;
  assignedBase: Decimal;
  taxRate: Decimal;
  determinedTax: Decimal;
  /** Saldo a favor anterior aplicado a la jurisdicción (se informa una vez por jurisdicción). */
  previousFavorBalance: Decimal;
  creditsApplied: Decimal;
  /** Saldo a pagar de la jurisdicción (>= 0). */
  balanceDue: Decimal;
  /** Saldo a favor que se arrastra al mes siguiente (>= 0). */
  favorCarryForward: Decimal;
};

export type GrossIncomeSettlementResult = {
  regime: GrossIncomeRegime;
  jurisdictionLines: GrossIncomeJurisdictionResult[];
  totalDeterminedTax: Decimal;
  totalCreditsApplied: Decimal;
  totalBalanceDue: Decimal;
  totalFavorCarryForward: Decimal;
  warnings: string[];
};

const TWO = { dp: 2 as const };

export function calculateGrossIncomeSettlement(
  input: GrossIncomeSettlementInput,
): GrossIncomeSettlementResult {
  const warnings: string[] = [];
  const isConvenio = input.regime === 'CM_REGIMEN_GENERAL' || input.regime === 'CM_REGIMEN_ESPECIAL';

  if (input.regime === 'NONE') {
    return {
      regime: input.regime,
      jurisdictionLines: [],
      totalDeterminedTax: new Decimal(0),
      totalCreditsApplied: new Decimal(0),
      totalBalanceDue: new Decimal(0),
      totalFavorCarryForward: new Decimal(0),
      warnings,
    };
  }

  const distinctJurisdictions = new Set(input.jurisdictions.map(j => j.jurisdictionCode));

  // En Convenio Multilateral el coeficiente es por jurisdicción, no por actividad. Si una
  // jurisdicción tiene varias actividades debe contarse una sola vez al validar la suma CM05.
  const coefficientByJurisdiction = new Map<string, Decimal>();
  if (isConvenio) {
    for (const jurisdiction of input.jurisdictions) {
      const coefficient = jurisdiction.coefficient ?? new Decimal(0);
      const previous = coefficientByJurisdiction.get(jurisdiction.jurisdictionCode);
      if (previous && !previous.equals(coefficient)) {
        warnings.push(
          `Convenio Multilateral: la jurisdicción ${jurisdiction.jurisdictionCode} tiene coeficientes distintos entre actividades.`,
        );
      } else if (!previous) {
        coefficientByJurisdiction.set(jurisdiction.jurisdictionCode, coefficient);
      }
    }
    const coefSum = [...coefficientByJurisdiction.values()].reduce(
      (sum, coefficient) => sum.add(coefficient),
      new Decimal(0),
    );
    if (coefSum.sub(1).abs().gt('0.000001')) {
      warnings.push(
        `Convenio Multilateral: los coeficientes suman ${coefSum.toFixed(6)} en vez de 1. ` +
        'Verifique el CM05 cargado.',
      );
    }
  }

  // "Reparto por monto": si alguna línea trae base asignada explícita, se respeta esa base por actividad
  // en vez de aplicar la base total. En local con una sola actividad no hay override (base total × 1).
  const usesBaseOverride = input.jurisdictions.some(j => j.assignedBaseOverride !== undefined);

  if (!isConvenio && distinctJurisdictions.size > 1) {
    warnings.push(
      'Régimen local con más de una jurisdicción: en régimen local toda la base tributa en una sola jurisdicción.',
    );
  }

  const jurisdictionLines: GrossIncomeJurisdictionResult[] = input.jurisdictions.map(j => {
    const coefficient = isConvenio ? (j.coefficient ?? new Decimal(0)) : new Decimal(1);
    const assignedBase = j.assignedBaseOverride !== undefined
      ? j.assignedBaseOverride.toDecimalPlaces(TWO.dp, Decimal.ROUND_HALF_UP)
      : input.taxableBase.mul(coefficient).toDecimalPlaces(TWO.dp, Decimal.ROUND_HALF_UP);
    const determinedTax = assignedBase.mul(j.taxRate).toDecimalPlaces(TWO.dp, Decimal.ROUND_HALF_UP);

    return {
      jurisdictionCode: j.jurisdictionCode,
      activityCode: j.activityCode,
      coefficient,
      assignedBase,
      taxRate: j.taxRate,
      determinedTax,
      previousFavorBalance: j.previousFavorBalance ?? new Decimal(0),
      creditsApplied: new Decimal(0),
      balanceDue: determinedTax,
      favorCarryForward: new Decimal(0),
    };
  });

  if (usesBaseOverride) {
    const negativeLines = jurisdictionLines.filter(line => line.assignedBase.isNegative());
    if (negativeLines.length > 0) {
      warnings.push('Las bases imponibles por actividad no pueden ser negativas.');
    }

    if (isConvenio) {
      for (const [jurisdictionCode, coefficient] of coefficientByJurisdiction) {
        const assignedSum = jurisdictionLines
          .filter(line => line.jurisdictionCode === jurisdictionCode)
          .reduce((sum, line) => sum.add(line.assignedBase), new Decimal(0));
        const expectedBase = input.taxableBase
          .mul(coefficient)
          .toDecimalPlaces(TWO.dp, Decimal.ROUND_HALF_UP);
        if (assignedSum.sub(expectedBase).abs().gt('0.01')) {
          warnings.push(
            `La suma de las bases por actividad de la jurisdicción ${jurisdictionCode} ` +
            `(${assignedSum.toFixed(2)}) no coincide con su base por coeficiente CM ` +
            `(${expectedBase.toFixed(2)}).`,
          );
        }
      }
    } else {
      const assignedSum = jurisdictionLines.reduce(
        (sum, line) => sum.add(line.assignedBase),
        new Decimal(0),
      );
      if (assignedSum.sub(input.taxableBase).abs().gt('0.01')) {
        warnings.push(
          `La suma de las bases por actividad (${assignedSum.toFixed(2)}) no coincide con la base gravada del mes ` +
          `(${input.taxableBase.toFixed(2)}). Verifique el reparto entre actividades.`,
        );
      }
    }
  }

  // Los créditos y saldos a favor pertenecen a la jurisdicción. Se compensan contra la suma
  // del impuesto de todas sus actividades; así nunca queda simultáneamente saldo a pagar y
  // saldo a favor dentro de la misma jurisdicción.
  const lineIndexesByJurisdiction = new Map<string, number[]>();
  const creditsByJurisdiction = new Map<string, Decimal>();
  input.jurisdictions.forEach((jurisdiction, index) => {
    const indexes = lineIndexesByJurisdiction.get(jurisdiction.jurisdictionCode) ?? [];
    indexes.push(index);
    lineIndexesByJurisdiction.set(jurisdiction.jurisdictionCode, indexes);

    const available = (jurisdiction.credits ?? []).reduce(
      (sum, credit) => sum.add(credit.amount),
      new Decimal(0),
    ).add(jurisdiction.previousFavorBalance ?? new Decimal(0));
    creditsByJurisdiction.set(
      jurisdiction.jurisdictionCode,
      (creditsByJurisdiction.get(jurisdiction.jurisdictionCode) ?? new Decimal(0)).add(available),
    );
  });

  for (const [jurisdictionCode, indexes] of lineIndexesByJurisdiction) {
    const rawAvailable = creditsByJurisdiction.get(jurisdictionCode) ?? new Decimal(0);
    if (rawAvailable.isNegative()) {
      warnings.push(`La jurisdicción ${jurisdictionCode} tiene créditos negativos; se toman como 0.`);
    }
    let remaining = Decimal.max(rawAvailable, 0);
    for (const index of indexes) {
      const line = jurisdictionLines[index];
      const applied = Decimal.min(remaining, line.determinedTax);
      line.creditsApplied = applied;
      line.balanceDue = line.determinedTax.sub(applied);
      remaining = remaining.sub(applied);
    }
    if (remaining.isPositive() && indexes.length > 0) {
      jurisdictionLines[indexes[indexes.length - 1]].favorCarryForward = remaining;
    }
  }

  const totalDeterminedTax = jurisdictionLines.reduce((t, l) => t.add(l.determinedTax), new Decimal(0));
  const totalCreditsApplied = jurisdictionLines.reduce((t, l) => t.add(l.creditsApplied), new Decimal(0));
  const totalBalanceDue = jurisdictionLines.reduce((t, l) => t.add(l.balanceDue), new Decimal(0));
  const totalFavorCarryForward = jurisdictionLines.reduce((t, l) => t.add(l.favorCarryForward), new Decimal(0));

  return {
    regime: input.regime,
    jurisdictionLines,
    totalDeterminedTax,
    totalCreditsApplied,
    totalBalanceDue,
    totalFavorCarryForward,
    warnings,
  };
}
