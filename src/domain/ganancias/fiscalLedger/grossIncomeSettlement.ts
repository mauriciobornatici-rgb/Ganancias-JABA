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

  // En Convenio Multilateral los coeficientes deberían sumar 1 (ya se valida al guardar el perfil;
  // aquí se avisa de forma defensiva si lo recibido no cuadra).
  if (isConvenio) {
    const coefSum = input.jurisdictions.reduce(
      (sum, j) => sum.add(j.coefficient ?? new Decimal(0)),
      new Decimal(0),
    );
    if (coefSum.sub(1).abs().gt('0.000001')) {
      warnings.push(
        `Convenio Multilateral: los coeficientes suman ${coefSum.toFixed(6)} en vez de 1. ` +
        'Verifique el CM05 cargado.',
      );
    }
  } else if (input.jurisdictions.length > 1) {
    warnings.push(
      'Régimen local con más de una jurisdicción: en régimen local toda la base tributa en una sola jurisdicción.',
    );
  }

  const jurisdictionLines: GrossIncomeJurisdictionResult[] = input.jurisdictions.map(j => {
    const coefficient = isConvenio ? (j.coefficient ?? new Decimal(0)) : new Decimal(1);
    const assignedBase = input.taxableBase.mul(coefficient).toDecimalPlaces(TWO.dp, Decimal.ROUND_HALF_UP);
    const determinedTax = assignedBase.mul(j.taxRate).toDecimalPlaces(TWO.dp, Decimal.ROUND_HALF_UP);

    const creditsAvailable = (j.credits ?? []).reduce(
      (sum, c) => sum.add(c.amount),
      new Decimal(0),
    ).add(j.previousFavorBalance ?? new Decimal(0));

    const creditsApplied = Decimal.min(creditsAvailable, determinedTax);
    const balanceDue = determinedTax.sub(creditsApplied);
    const favorCarryForward = creditsAvailable.sub(creditsApplied);

    return {
      jurisdictionCode: j.jurisdictionCode,
      activityCode: j.activityCode,
      coefficient,
      assignedBase,
      taxRate: j.taxRate,
      determinedTax,
      creditsApplied,
      balanceDue,
      favorCarryForward,
    };
  });

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
