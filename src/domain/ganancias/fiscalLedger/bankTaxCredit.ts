import { Decimal } from 'decimal.js';

/**
 * Impuesto sobre los débitos y créditos bancarios (IDCB, "impuesto al cheque") como pago a cuenta
 * de Ganancias. Punto 5 del PDF de correcciones del usuario.
 *
 * Criterio del usuario (2026-07-24): se carga MES A MES el importe TOTAL del impuesto al cheque del
 * período, y el porcentaje computable es una configuración del contribuyente: 33% (régimen general,
 * art. 13 dec. 380/2001) o 100% (micro y pequeña empresa). La app calcula el computable; a fin de
 * año la importación del libro mensual lo lleva a la DDJJ anual como pago a cuenta con `taxCode`
 * 'IDCB' (IG 25!F65), donde el motor ya lo limita al impuesto determinado y deja el excedente como
 * saldo trasladable (F70). Este módulo NO decide nada del cómputo anual: solo arma los importes.
 *
 * Funciones PURAS.
 */

/** Únicos porcentajes admitidos por decisión del usuario. */
export const IDCB_COMPUTABLE_PERCENTS = [33, 100] as const;
export type IdcbComputablePercent = (typeof IDCB_COMPUTABLE_PERCENTS)[number];

export const IDCB_DEFAULT_COMPUTABLE_PERCENT: IdcbComputablePercent = 33;

/** Clave del registro mensual dentro del período (uno solo por período). */
export const IDCB_CREDIT_KEY = 'IDCB-MENSUAL';

/** Prefijo del certificado de las filas que la importación anual crea y reemplaza. */
export const IDCB_CERTIFICATE_PREFIX = 'IDCB-';

/** `taxCode` que el motor anual reconoce como cómputo de IDCB (IG 25!F65). */
export const IDCB_TAX_CODE = 'IDCB';

export const IDCB_TAX_DESCRIPTION = 'Impuesto sobre los débitos y créditos bancarios';

const MONTH_LABELS = [
  '', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** 33 salvo que esté explícitamente configurado 100: nunca inventa un porcentaje intermedio. */
export function normalizeIdcbComputablePercent(value: number | null | undefined): IdcbComputablePercent {
  return value === 100 ? 100 : IDCB_DEFAULT_COMPUTABLE_PERCENT;
}

export function isIdcbComputablePercent(value: unknown): value is IdcbComputablePercent {
  return value === 33 || value === 100;
}

/** Importe computable del mes: total del impuesto al cheque × porcentaje configurado. */
export function computeIdcbComputableAmount(
  totalAmount: Decimal,
  percent: number | null | undefined,
): Decimal {
  const normalized = normalizeIdcbComputablePercent(percent);
  return totalAmount
    .mul(normalized)
    .div(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function buildIdcbCertificateNumber(year: number, month: number): string {
  return `${IDCB_CERTIFICATE_PREFIX}${year}-${String(month).padStart(2, '0')}`;
}

export type IdcbMonthlyEntry = {
  year: number;
  month: number;
  /** Importe TOTAL del impuesto al cheque del mes, tal como lo carga el usuario. */
  totalAmount: Decimal;
  /** Porcentaje computable vigente en el perfil fiscal del período. */
  computablePercent: number | null | undefined;
};

/**
 * Fila de pago a cuenta para la DDJJ anual. Es la forma que ya consume `TaxWithholding`
 * (y el mapper de cálculo vía `taxCode`), por lo que no requiere modelo nuevo.
 */
export type IdcbWithholdingDraft = {
  cuitAgent: null;
  agentName: string;
  taxCode: typeof IDCB_TAX_CODE;
  taxDescription: string;
  regimeCode: null;
  regimeDescription: null;
  date: Date;
  certificateNumber: string;
  operationDescription: string;
  amount: string;
};

export type IdcbImportSummary = {
  drafts: IdcbWithholdingDraft[];
  /** Suma de los importes totales cargados (antes del porcentaje). */
  totalLoaded: Decimal;
  /** Suma de los importes computables (lo que efectivamente va a la DDJJ). */
  totalComputable: Decimal;
  monthsUsed: number[];
};

/**
 * Arma una fila por mes con importe cargado. Una fila por mes (no un total anual) para que el
 * papel de trabajo muestre de dónde viene cada peso, igual que el IIBB determinado.
 *
 * La fecha es el último día del mes y el certificado `IDCB-AAAA-MM`, lo que hace la importación
 * idempotente: reimportar reemplaza las mismas filas sin duplicarlas.
 */
export function buildIdcbWithholdingDrafts(entries: IdcbMonthlyEntry[]): IdcbImportSummary {
  const drafts: IdcbWithholdingDraft[] = [];
  const monthsUsed: number[] = [];
  let totalLoaded = new Decimal(0);
  let totalComputable = new Decimal(0);

  for (const entry of [...entries].sort((a, b) => a.month - b.month)) {
    if (entry.totalAmount.lte(0)) continue;
    const computable = computeIdcbComputableAmount(entry.totalAmount, entry.computablePercent);
    if (computable.lte(0)) continue;

    const percent = normalizeIdcbComputablePercent(entry.computablePercent);
    totalLoaded = totalLoaded.add(entry.totalAmount);
    totalComputable = totalComputable.add(computable);
    monthsUsed.push(entry.month);

    drafts.push({
      cuitAgent: null,
      agentName: `Impuesto al cheque ${MONTH_LABELS[entry.month] ?? entry.month} ${entry.year}`,
      taxCode: IDCB_TAX_CODE,
      taxDescription: IDCB_TAX_DESCRIPTION,
      regimeCode: null,
      regimeDescription: null,
      // Último día del mes del período.
      date: new Date(Date.UTC(entry.year, entry.month, 0)),
      certificateNumber: buildIdcbCertificateNumber(entry.year, entry.month),
      operationDescription: `${percent}% de $${entry.totalAmount.toFixed(2)} cargado en el libro mensual`,
      amount: computable.toFixed(2),
    });
  }

  return { drafts, totalLoaded, totalComputable, monthsUsed };
}

/**
 * Aviso para la pantalla de importación: qué se trajo y con qué criterio.
 * `percent` en null = los meses no comparten el mismo porcentaje (perfil fiscal versionado).
 */
export function idcbImportNotice(summary: IdcbImportSummary, percent: IdcbComputablePercent | null): string {
  if (summary.drafts.length === 0) return '';
  const criterio = percent === null
    ? 'computable según el porcentaje vigente en cada mes'
    : `computable al ${percent}%`;
  return `Impuesto al cheque: ${summary.drafts.length} mes(es) cargado(s) por $${summary.totalLoaded.toFixed(2)}, `
    + `${criterio} = $${summary.totalComputable.toFixed(2)}. Entra como pago a cuenta (F65); `
    + 'si excede el impuesto determinado, el excedente queda como saldo trasladable de IDCB.';
}

/** Porcentaje único de un conjunto de meses, o null si conviven 33% y 100%. */
export function uniqueIdcbPercent(entries: IdcbMonthlyEntry[]): IdcbComputablePercent | null {
  const percents = new Set(entries.map(entry => normalizeIdcbComputablePercent(entry.computablePercent)));
  if (percents.size !== 1) return null;
  return [...percents][0];
}
