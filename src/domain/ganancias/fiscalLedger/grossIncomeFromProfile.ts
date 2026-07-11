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

export type LoadedGiJurisdiction = { jurisdictionCode: string; taxRate: Decimal | null };
export type LoadedGiCredit = { jurisdictionCode: string | null; amount: Decimal };

export function buildPeriodGrossIncome(params: {
  regime: GrossIncomeRegime;
  /** Jurisdicciones ACTIVAS del perfil. */
  jurisdictions: LoadedGiJurisdiction[];
  documents: SettlementDocument[];
  /** Coeficientes unificados CM por jurisdicción (solo Convenio Multilateral). */
  coefficientMap: Map<string, Decimal>;
  /** Percepciones/retenciones de IIBB sufridas (tax=GROSS_INCOME). */
  credits: LoadedGiCredit[];
  /** Saldos a favor de la última liquidación cerrada del período anterior. */
  previousFavorBalances?: Map<string, Decimal>;
  year: number;
}): { view: GrossIncomeSettlementView | null; notice: string | null } {
  const isConvenio = params.regime === 'CM_REGIMEN_GENERAL' || params.regime === 'CM_REGIMEN_ESPECIAL';

  if (params.regime === 'NONE') {
    return { view: null, notice: 'El contribuyente no liquida Ingresos Brutos en este período (régimen NONE).' };
  }
  if (params.jurisdictions.length === 0) {
    return { view: null, notice: 'Falta configurar jurisdicciones y alícuotas de IIBB en el perfil fiscal.' };
  }

  const jurisdictions: GrossIncomeJurisdictionConfig[] = params.jurisdictions.map(j => ({
    jurisdictionCode: j.jurisdictionCode,
    taxRate: j.taxRate ?? new Decimal(0),
    coefficient: isConvenio ? params.coefficientMap.get(j.jurisdictionCode) : undefined,
    credits: params.credits.filter(c => c.jurisdictionCode === j.jurisdictionCode).map(c => ({ amount: c.amount })),
    previousFavorBalance: params.previousFavorBalances?.get(j.jurisdictionCode),
  }));

  const view = buildGrossIncomeSettlement({ regime: params.regime, documents: params.documents, jurisdictions });

  const sinAlicuota = params.jurisdictions.filter(j => j.taxRate == null).map(j => j.jurisdictionCode);
  const sinCoef = isConvenio ? params.jurisdictions.filter(j => !params.coefficientMap.has(j.jurisdictionCode)).map(j => j.jurisdictionCode) : [];
  const avisos: string[] = [];
  if (sinAlicuota.length) avisos.push(`Sin alícuota cargada: ${sinAlicuota.join(', ')}.`);
  if (sinCoef.length) avisos.push(`Sin coeficiente CM ${params.year}: ${sinCoef.join(', ')}.`);

  return { view, notice: avisos.length ? avisos.join(' ') : null };
}
