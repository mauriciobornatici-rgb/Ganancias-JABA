import { Decimal } from 'decimal.js';

/**
 * Liquidación mensual de IVA (Art. 18 y 24, Ley 23.349).
 *
 * Mecánica:
 *  1. Débito fiscal = IVA de ventas (todas las alícuotas sumadas).
 *  2. Crédito fiscal = IVA de compras COMPUTABLE (excluye no computable y comprobantes
 *     que no dan crédito, p. ej. facturas C de monotributistas).
 *  3. Saldo técnico del período (Art. 24, 1º párr.) = débito − crédito − saldo técnico a favor
 *     que venía del mes anterior. Si queda a favor, se ARRASTRA al mes siguiente (solo se usa
 *     contra débito futuro; no se pide devolución).
 *  4. Percepciones / retenciones / pagos a cuenta de IVA sufridos (Art. 24, 2º párr.) se aplican
 *     contra el impuesto técnico a ingresar. El EXCEDENTE es saldo de LIBRE DISPONIBILIDAD
 *     (compensable con otros impuestos o transferible), distinto del saldo técnico.
 *
 * Todos los montos en Decimal para evitar error de coma flotante.
 */

export type VatSettlementLine = {
  vatAmount: Decimal;
  creditComputable: boolean;
};

export type VatSettlementInput = {
  sales: VatSettlementLine[];
  purchases: VatSettlementLine[];
  /** Saldo técnico a favor arrastrado del mes anterior (Art. 24, 1º párr.; >= 0). */
  previousTechnicalBalance: Decimal;
  /**
   * Saldo a favor de LIBRE DISPONIBILIDAD del período anterior neto de usos (Art. 24, 2º párr.; >= 0).
   * AFIP lo aplica en la posición mensual, separado del saldo técnico. Default 0.
   */
  previousFreeAvailability?: Decimal;
  /** Percepciones, retenciones y pagos a cuenta de IVA sufridos en el período. */
  taxCredits: Array<{ amount: Decimal }>;
};

export type VatSettlementResult = {
  debitFiscal: Decimal;
  creditFiscal: Decimal;
  /** débito − crédito − saldo técnico anterior, CON signo (negativo = a favor). */
  technicalBalance: Decimal;
  /** Impuesto técnico a ingresar antes de aplicar percepciones/retenciones. */
  technicalDue: Decimal;
  /** Saldo técnico a favor que se arrastra al mes siguiente (Art. 24, 1º párr.). */
  technicalCarryForward: Decimal;
  /** Total de percepciones/retenciones/pagos a cuenta de IVA disponibles. */
  creditsAvailable: Decimal;
  /** Parte de esos créditos efectivamente aplicada contra el impuesto del período. */
  creditsApplied: Decimal;
  /** Saldo a pagar final del período (>= 0). */
  amountDue: Decimal;
  /** Excedente de percepciones/retenciones = saldo a favor de libre disponibilidad (Art. 24, 2º párr.). */
  freeAvailabilityBalance: Decimal;
};

export function calculateVatSettlement(input: VatSettlementInput): VatSettlementResult {
  const debitFiscal = input.sales.reduce(
    (total, line) => total.add(line.vatAmount),
    new Decimal(0),
  );

  const creditFiscal = input.purchases
    .filter(line => line.creditComputable)
    .reduce((total, line) => total.add(line.vatAmount), new Decimal(0));

  // Saldo técnico del período (con signo). El saldo técnico anterior a favor resta.
  const technicalBalance = debitFiscal.sub(creditFiscal).sub(input.previousTechnicalBalance);

  // Si es positivo, hay impuesto técnico a ingresar; si es negativo, queda a favor y se arrastra.
  const technicalDue = Decimal.max(technicalBalance, new Decimal(0));
  const technicalCarryForward = Decimal.max(technicalBalance.negated(), new Decimal(0));

  // Posición mensual (Art. 24, 2º párr.): contra el impuesto técnico se aplican, juntos,
  // el saldo de libre disponibilidad del período anterior y las percepciones/retenciones/pagos
  // a cuenta del período. El excedente es la nueva libre disponibilidad a arrastrar.
  const previousFreeAvailability = input.previousFreeAvailability ?? new Decimal(0);
  const periodCredits = input.taxCredits.reduce(
    (total, credit) => total.add(credit.amount),
    new Decimal(0),
  );
  const creditsAvailable = previousFreeAvailability.add(periodCredits);
  const creditsApplied = Decimal.min(creditsAvailable, technicalDue);

  // Saldo a pagar final y excedente como libre disponibilidad para el mes siguiente.
  const amountDue = technicalDue.sub(creditsApplied);
  const freeAvailabilityBalance = creditsAvailable.sub(creditsApplied);

  return {
    debitFiscal,
    creditFiscal,
    technicalBalance,
    technicalDue,
    technicalCarryForward,
    creditsAvailable,
    creditsApplied,
    amountDue,
    freeAvailabilityBalance,
  };
}
