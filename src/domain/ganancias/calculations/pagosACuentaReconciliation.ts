import { Decimal } from 'decimal.js';
import type { TaxCreditCode, TaxWithholdingInput } from '../types';

export type ReconciledPaymentsOnAccount = {
  retencionesYPercepciones: Decimal;
  anticiposCanceladosIdcb: Decimal;
  anticiposCanceladosEfectivo: Decimal;
  anticiposCanceladosMisFacilidades: Decimal;
  computoIdcb: Decimal;
  computoCombustibles: Decimal;
  creditosOtrosNoComputables: Decimal;
  warnings: string[];
};

const ZERO = new Decimal(0);
const MONTHLY_IDCB_CERTIFICATE = /^IDCB-\d{4}-\d{2}$/;

const CREDIT_LABELS: Record<TaxCreditCode, string> = {
  Ganancias: 'retenciones y percepciones de Ganancias',
  AnticipoEfectivo: 'anticipos cancelados en efectivo',
  AnticipoIDCB: 'anticipos cancelados con IDCB',
  AnticipoMisFacilidades: 'anticipos cancelados con Mis Facilidades',
  IDCB: 'impuesto sobre creditos y debitos bancarios',
  Combustibles: 'impuesto a los combustibles',
  Otros: 'otros impuestos no computables',
};

function signedTotal(rows: TaxWithholdingInput[]): Decimal {
  return rows.reduce((sum, row) => sum.add(row.amount), ZERO);
}

/**
 * Una anulacion puede reducir el credito hasta cero, pero nunca transformarse en un debito
 * adicional que aumente el impuesto por encima del determinado.
 */
function nonNegativeCreditTotal(
  rows: TaxWithholdingInput[],
  code: TaxCreditCode,
  warnings: string[],
): Decimal {
  const total = signedTotal(rows);
  if (total.isNegative()) {
    warnings.push(
      `Pagos a cuenta: las anulaciones de ${CREDIT_LABELS[code]} superan los creditos cargados `
      + `en $${total.abs().toFixed(2)}. El computo se limito a $0.00 para no aumentar el impuesto; `
      + 'revise los certificados y el credito original.',
    );
    return ZERO;
  }
  return total;
}

/**
 * Consolida los movimientos con signo y aplica dos guardas fiscales:
 *  - ningun concepto computable puede quedar por debajo de cero;
 *  - si conviven IDCB mensual y otro IDCB manual/importado, el libro mensual es la fuente canonica
 *    y el otro importe queda fuera del computo hasta que el contador lo concilie.
 */
export function reconcilePaymentsOnAccount(
  withholdings: TaxWithholdingInput[],
): ReconciledPaymentsOnAccount {
  const warnings: string[] = [];
  const byCode = (code: TaxCreditCode) => withholdings.filter(row => row.taxCode === code);

  const directIdcb = byCode('IDCB');
  const monthlyIdcb = directIdcb.filter(row => (
    typeof row.certificateNumber === 'string'
    && MONTHLY_IDCB_CERTIFICATE.test(row.certificateNumber.trim())
  ));
  const otherIdcb = directIdcb.filter(row => !monthlyIdcb.includes(row));

  let idcbRowsToCompute = directIdcb;
  if (monthlyIdcb.length > 0 && otherIdcb.length > 0) {
    idcbRowsToCompute = monthlyIdcb;
    warnings.push(
      `IDCB: conviven $${signedTotal(monthlyIdcb).toFixed(2)} provenientes del libro mensual y `
      + `$${signedTotal(otherIdcb).toFixed(2)} cargados o importados por otra via. `
      + 'Para evitar doble computo se uso solo el libro mensual; concilie la otra fuente antes de cerrar.',
    );
  }

  return {
    retencionesYPercepciones: nonNegativeCreditTotal(byCode('Ganancias'), 'Ganancias', warnings),
    anticiposCanceladosIdcb: nonNegativeCreditTotal(byCode('AnticipoIDCB'), 'AnticipoIDCB', warnings),
    anticiposCanceladosEfectivo: nonNegativeCreditTotal(byCode('AnticipoEfectivo'), 'AnticipoEfectivo', warnings),
    anticiposCanceladosMisFacilidades: nonNegativeCreditTotal(
      byCode('AnticipoMisFacilidades'),
      'AnticipoMisFacilidades',
      warnings,
    ),
    computoIdcb: nonNegativeCreditTotal(idcbRowsToCompute, 'IDCB', warnings),
    computoCombustibles: nonNegativeCreditTotal(byCode('Combustibles'), 'Combustibles', warnings),
    creditosOtrosNoComputables: signedTotal(byCode('Otros')),
    warnings,
  };
}
