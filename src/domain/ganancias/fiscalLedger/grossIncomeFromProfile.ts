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

  const sinAlicuota = params.jurisdictions.filter(j => j.taxRate == null).map(j => j.jurisdictionCode);
  const sinCoef = isConvenio ? params.jurisdictions.filter(j => !params.coefficientMap.has(j.jurisdictionCode)).map(j => j.jurisdictionCode) : [];
  const avisos: string[] = [];
  if (sinAlicuota.length) avisos.push(`Sin alícuota cargada: ${sinAlicuota.join(', ')}.`);
  if (sinCoef.length) avisos.push(`Sin coeficiente CM ${params.year}: ${sinCoef.join(', ')}.`);

  return { view, notice: avisos.length ? avisos.join(' ') : null };
}
