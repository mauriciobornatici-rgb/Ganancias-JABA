import { Decimal } from 'decimal.js';
import type { TaxCalculationResult } from '../types';

/**
 * Desglose de los pagos a cuenta del IG 25 (F62:F67) para el papel de trabajo y la exportación.
 *
 * Existe porque el papel de trabajo mostraba sólo las retenciones (F67): con impuesto al cheque,
 * anticipos o combustibles cargados, la resta impresa "impuesto - retenciones - saldo a favor" no
 * cerraba con el saldo determinado que calcula el motor. Cada concepto se muestra con su referencia
 * de la planilla para que el papel sea auditable.
 *
 * Función PURA. Devuelve sólo los conceptos con importe, en el orden de la planilla.
 */
export interface PaymentOnAccountBreakdownItem {
  label: string;
  reference: string;
  amount: Decimal;
}

export type TaxBalanceCreditSource = Partial<Pick<
  TaxCalculationResult,
  | 'anticiposCanceladosIdcb'
  | 'anticiposCanceladosEfectivo'
  | 'anticiposCanceladosMisFacilidades'
  | 'computoIdcb'
  | 'computoCombustibles'
  | 'retencionesYPercepciones'
  | 'saldoTrasladableIdcb'
  | 'saldoAFavorAnterior'
  | 'impuestoDeterminado'
  | 'impuestoAPagarOARCA'
>>;

export type TaxBalanceReconciliation = {
  creditRows: PaymentOnAccountBreakdownItem[];
  totalCredits: Decimal;
  calculatedBalance: Decimal;
  reportedBalance: Decimal;
  difference: Decimal;
  isBalanced: boolean;
};

const ZERO = new Decimal(0);

export function buildPaymentsOnAccountBreakdown(
  result: TaxBalanceCreditSource | null | undefined,
): PaymentOnAccountBreakdownItem[] {
  if (!result) return [];

  // El IDCB computable es el total (cómputo directo + anticipos cancelados con IDCB) menos el
  // excedente que no entra por superar el impuesto determinado (F70). Es lo que efectivamente resta.
  const idcbTotal = new Decimal(result.computoIdcb ?? 0).add(result.anticiposCanceladosIdcb ?? 0);
  const idcbComputable = idcbTotal.sub(result.saldoTrasladableIdcb ?? 0);

  const rows: PaymentOnAccountBreakdownItem[] = [
    { label: 'Impuesto al cheque computable (débitos y créditos)', reference: 'IG 25!F62+F65', amount: Decimal.max(idcbComputable, ZERO) },
    { label: 'Anticipos cancelados en efectivo', reference: 'IG 25!F63', amount: new Decimal(result.anticiposCanceladosEfectivo ?? 0) },
    { label: 'Anticipos cancelados con Mis Facilidades', reference: 'IG 25!F64', amount: new Decimal(result.anticiposCanceladosMisFacilidades ?? 0) },
    { label: 'Impuesto a los combustibles', reference: 'IG 25!F66', amount: new Decimal(result.computoCombustibles ?? 0) },
  ];

  return rows.filter(row => !row.amount.isZero());
}

/** Suma de los pagos a cuenta del desglose (sin retenciones, que se muestran por separado). */
export function sumPaymentsOnAccountBreakdown(rows: PaymentOnAccountBreakdownItem[]): Decimal {
  return rows.reduce((sum, row) => sum.add(row.amount), ZERO);
}

/**
 * Fuente unica para las lineas que explican el saldo final en pantalla, papel y Excel.
 * Incluye F61:F67 y usa solo el IDCB efectivamente computable, excluyendo el traslado F70.
 */
export function buildTaxBalanceCreditBreakdown(
  result: TaxBalanceCreditSource | null | undefined,
): PaymentOnAccountBreakdownItem[] {
  if (!result) return [];

  const rows: PaymentOnAccountBreakdownItem[] = [
    {
      label: 'Retenciones y percepciones computables',
      reference: 'IG 25!F67',
      amount: Decimal.max(new Decimal(result.retencionesYPercepciones ?? 0), ZERO),
    },
    ...buildPaymentsOnAccountBreakdown(result),
    {
      label: 'Saldo a favor del periodo anterior',
      reference: 'IG 25!F61',
      amount: Decimal.max(new Decimal(result.saldoAFavorAnterior ?? 0), ZERO),
    },
  ];

  return rows.filter(row => !row.amount.isZero());
}

/**
 * Verifica la ecuacion que deben exhibir todos los reportes:
 * impuesto determinado - creditos computables = saldo informado.
 */
export function reconcileTaxBalance(
  result: TaxBalanceCreditSource | null | undefined,
): TaxBalanceReconciliation {
  const creditRows = buildTaxBalanceCreditBreakdown(result);
  const totalCredits = sumPaymentsOnAccountBreakdown(creditRows);
  const calculatedBalance = new Decimal(result?.impuestoDeterminado ?? 0).sub(totalCredits);
  const reportedBalance = new Decimal(result?.impuestoAPagarOARCA ?? 0);
  const difference = calculatedBalance.sub(reportedBalance);

  return {
    creditRows,
    totalCredits,
    calculatedBalance,
    reportedBalance,
    difference,
    isBalanced: difference.abs().lte('0.01'),
  };
}
