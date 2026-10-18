import { Decimal } from 'decimal.js';
import {
  buildGrossIncomeSettlement,
  type GrossIncomeJurisdictionConfig,
  type GrossIncomeSettlementView,
  type SettlementDocument,
} from './settlementBuilders';
import type { GrossIncomeRegime } from './grossIncomeSettlement';

/**
 * Arma la liquidación de IIBB del período a partir de los datos ya leídos de la base (perfil con
 * jurisdicciones/alícuotas, documentos, coeficientes CM, créditos de IIBB). Centraliza la lógica para
 * que el PREVIEW (GET settlement) y el GUARDADO (POST save) produzcan exactamente lo mismo.
 *
 * Función PURA: no accede a Prisma.
 */

export type LoadedGiJurisdiction = { jurisdictionCode: string; activityCode?: string; taxRate: Decimal | null };
export type LoadedGiCredit = { jurisdictionCode: string | null; amount: Decimal };

/** Clave de una línea actividad-jurisdicción para el mapa de bases asignadas. */
export function giLineKey(jurisdictionCode: string, activityCode: string | undefined): string {
  return `${jurisdictionCode}|${activityCode ?? ''}`;
}

/** Suma los saldos persistidos de todas las actividades de una misma jurisdicción. */
export function aggregateFavorBalancesByJurisdiction(
  lines: ReadonlyArray<{ jurisdictionCode: string; favorCarryForward: { toString(): string } }>,
): Map<string, Decimal> {
  const balances = new Map<string, Decimal>();
  for (const line of lines) {
    balances.set(
      line.jurisdictionCode,
      (balances.get(line.jurisdictionCode) ?? new Decimal(0))
        .add(new Decimal(line.favorCarryForward.toString())),
    );
  }
  return balances;
}

/**
 * Sugiere un reparto equitativo y exacto a centavos para jurisdicciones con varias actividades.
 * En Convenio Multilateral reparte la base de la jurisdicción (base total × coeficiente), no la
 * base global completa.
 */
export function suggestActivityBases(params: {
  regime: GrossIncomeRegime;
  taxableBase: Decimal;
  jurisdictions: ReadonlyArray<{ jurisdictionCode: string; activityCode?: string }>;
  coefficientMap: Map<string, Decimal>;
}): Map<string, Decimal> {
  const isConvenio = params.regime === 'CM_REGIMEN_GENERAL' || params.regime === 'CM_REGIMEN_ESPECIAL';
  const groups = new Map<string, Array<{ jurisdictionCode: string; activityCode?: string }>>();
  for (const jurisdiction of params.jurisdictions) {
    const group = groups.get(jurisdiction.jurisdictionCode) ?? [];
    group.push(jurisdiction);
    groups.set(jurisdiction.jurisdictionCode, group);
  }

  const suggestions = new Map<string, Decimal>();
  for (const [jurisdictionCode, group] of groups) {
    if (group.length <= 1) continue;
    const coefficient = isConvenio
      ? (params.coefficientMap.get(jurisdictionCode) ?? new Decimal(0))
      : new Decimal(1);
    const jurisdictionBase = params.taxableBase
      .mul(coefficient)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const equalShare = jurisdictionBase
      .div(group.length)
      .toDecimalPlaces(2, Decimal.ROUND_DOWN);
    let allocated = new Decimal(0);
    group.forEach((jurisdiction, index) => {
      const share = index === group.length - 1
        ? jurisdictionBase.sub(allocated)
        : equalShare;
      suggestions.set(giLineKey(jurisdictionCode, jurisdiction.activityCode), share);
      allocated = allocated.add(share);
    });
  }
  return suggestions;
}

export function buildPeriodGrossIncome(params: {
  regime: GrossIncomeRegime;
  /** Jurisdicciones ACTIVAS del perfil (una línea por actividad). */
  jurisdictions: LoadedGiJurisdiction[];
  documents: SettlementDocument[];
  /** Coeficientes unificados CM por jurisdicción (solo Convenio Multilateral). */
  coefficientMap: Map<string, Decimal>;
  /** Percepciones/retenciones de IIBB sufridas (tax=GROSS_INCOME). */
  credits: LoadedGiCredit[];
  /** Saldos a favor de la última liquidación cerrada del período anterior. */
  previousFavorBalances?: Map<string, Decimal>;
  /** Base imponible por actividad (key = giLineKey). Reparto por monto entre actividades. */
  assignedBases?: Map<string, Decimal>;
  year: number;
}): { view: GrossIncomeSettlementView | null; notice: string | null } {
  const isConvenio = params.regime === 'CM_REGIMEN_GENERAL' || params.regime === 'CM_REGIMEN_ESPECIAL';

  if (params.regime === 'NONE') {
    return { view: null, notice: 'El contribuyente no liquida Ingresos Brutos en este período (régimen NONE).' };
  }
  if (params.jurisdictions.length === 0) {
    return { view: null, notice: 'Falta configurar jurisdicciones y alícuotas de IIBB en el perfil fiscal.' };
  }

  // Cuántas actividades hay por jurisdicción: solo se aplica reparto por monto cuando hay más de una.
  const activitiesPerJur = new Map<string, number>();
  for (const j of params.jurisdictions) {
    activitiesPerJur.set(j.jurisdictionCode, (activitiesPerJur.get(j.jurisdictionCode) ?? 0) + 1);
  }

  // Créditos (percepciones/retenciones) y saldo a favor previo son por JURISDICCIÓN, no por actividad:
  // se asignan solo a la primera línea de cada jurisdicción para no aplicarlos por duplicado.
  const jurisdictionCreditsAssigned = new Set<string>();

  const jurisdictions: GrossIncomeJurisdictionConfig[] = params.jurisdictions.map(j => {
    const multiActividad = (activitiesPerJur.get(j.jurisdictionCode) ?? 1) > 1;
    const assignedBaseOverride = multiActividad
      ? (params.assignedBases?.get(giLineKey(j.jurisdictionCode, j.activityCode)) ?? new Decimal(0))
      : undefined;

    const firstOfJurisdiction = !jurisdictionCreditsAssigned.has(j.jurisdictionCode);
    jurisdictionCreditsAssigned.add(j.jurisdictionCode);

    return {
      jurisdictionCode: j.jurisdictionCode,
      activityCode: j.activityCode,
      taxRate: j.taxRate ?? new Decimal(0),
      coefficient: isConvenio ? params.coefficientMap.get(j.jurisdictionCode) : undefined,
      credits: firstOfJurisdiction
        ? params.credits.filter(c => c.jurisdictionCode === j.jurisdictionCode).map(c => ({ amount: c.amount }))
        : [],
      previousFavorBalance: firstOfJurisdiction ? params.previousFavorBalances?.get(j.jurisdictionCode) : undefined,
      assignedBaseOverride,
    };
  });

  const view = buildGrossIncomeSettlement({ regime: params.regime, documents: params.documents, jurisdictions });

  const sinAlicuota = [...new Set(params.jurisdictions.filter(j => j.taxRate == null).map(j => j.jurisdictionCode))];
  const sinCoef = isConvenio
    ? [...new Set(params.jurisdictions.filter(j => !params.coefficientMap.has(j.jurisdictionCode)).map(j => j.jurisdictionCode))]
    : [];
  const avisos: string[] = [];
  if (sinAlicuota.length) avisos.push(`Sin alícuota cargada: ${sinAlicuota.join(', ')}.`);
  if (sinCoef.length) avisos.push(`Sin coeficiente CM ${params.year}: ${sinCoef.join(', ')}.`);

  return { view, notice: avisos.length ? avisos.join(' ') : null };
}
