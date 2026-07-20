import { Decimal } from 'decimal.js';
import { calculateVatSettlement, type VatSettlementResult } from './vatSettlement';
import {
  calculateGrossIncomeSettlement,
  type GrossIncomeRegime,
  type GrossIncomeSettlementResult,
} from './grossIncomeSettlement';

/**
 * Armadores (orquestadores) que toman los datos persistidos de un período mensual y construyen
 * los inputs de los motores de IVA e IIBB, devolviendo además los desgloses que la pantalla de
 * liquidación necesita mostrar (débito/crédito por alícuota, base imponible, etc.).
 *
 * Son funciones puras: reciben los datos ya leídos de la base (no acceden a Prisma).
 */

export type SettlementVatLine = {
  kind: string; // TAXED | EXEMPT | NON_TAXED
  taxableBase: Decimal;
  rate: Decimal;
  vatAmount: Decimal;
  creditComputable: boolean;
};

export type SettlementDocument = {
  direction: 'SALE' | 'PURCHASE';
  /** Tipo de comprobante AFIP (para detectar notas de crédito). */
  voucherType?: string;
  vatLines: SettlementVatLine[];
};

/**
 * Tipos de comprobante AFIP que son Notas de Crédito (3/8/13 NC A/B/C, 21/53 NC M, etc.).
 * En el F2002, una NC se computa en el lado CONTRARIO: la NC emitida (reversa una venta) va al
 * crédito fiscal; la NC recibida (reversa una compra) va al débito fiscal. El neto no cambia,
 * pero los totales de débito/crédito que se cotejan con ARCA sí.
 */
const NOTA_CREDITO_TIPOS = new Set([3, 8, 13, 21, 53, 110, 112, 113, 114, 115, 119]);

function isNotaCredito(voucherType?: string): boolean {
  if (!voucherType) return false;
  const code = parseInt(String(voucherType).trim(), 10);
  return Number.isInteger(code) && NOTA_CREDITO_TIPOS.has(code);
}

/** Las NC vienen con IVA negativo desde AFIP; al moverlas de lado se toma su valor absoluto. */
function absLine(line: SettlementVatLine): SettlementVatLine {
  return {
    ...line,
    taxableBase: line.taxableBase.abs(),
    vatAmount: line.vatAmount.abs(),
  };
}

export type VatRateBreakdown = {
  rate: string; // alícuota como texto (ej. "0.21")
  taxableBase: Decimal;
  vatAmount: Decimal;
};

export type VatSettlementView = {
  settlement: VatSettlementResult;
  debitByRate: VatRateBreakdown[];
  creditByRate: Array<VatRateBreakdown & { computable: boolean }>;
};

export type VatSettlementBuildInput = {
  documents: SettlementDocument[];
  /** Percepciones/retenciones/pagos a cuenta de IVA sufridos (TaxCreditRecord tax=VAT). */
  vatCredits: Array<{ amount: Decimal }>;
  previousTechnicalBalance: Decimal;
  /** Saldo de libre disponibilidad del período anterior neto de usos. */
  previousFreeAvailability?: Decimal;
};

function groupByRate(lines: SettlementVatLine[]): Map<string, { taxableBase: Decimal; vatAmount: Decimal }> {
  const map = new Map<string, { taxableBase: Decimal; vatAmount: Decimal }>();
  for (const line of lines) {
    const key = line.rate.toString();
    const acc = map.get(key) ?? { taxableBase: new Decimal(0), vatAmount: new Decimal(0) };
    acc.taxableBase = acc.taxableBase.add(line.taxableBase);
    acc.vatAmount = acc.vatAmount.add(line.vatAmount);
    map.set(key, acc);
  }
  return map;
}

export function buildVatSettlement(input: VatSettlementBuildInput): VatSettlementView {
  const sales = input.documents.filter(d => d.direction === 'SALE');
  const purchases = input.documents.filter(d => d.direction === 'PURCHASE');

  // Clasificación estilo AFIP (F2002): las notas de crédito se computan en el lado contrario.
  //  - Débito = IVA de ventas que NO son NC + |IVA de NC recibidas de compras|.
  //  - Crédito = IVA de compras computables que NO son NC + |IVA de NC emitidas de ventas|.
  const debitLines: SettlementVatLine[] = [
    ...sales.filter(d => !isNotaCredito(d.voucherType)).flatMap(d => d.vatLines),
    ...purchases.filter(d => isNotaCredito(d.voucherType)).flatMap(d => d.vatLines.map(absLine)),
  ];
  const creditLines: SettlementVatLine[] = [
    ...purchases.filter(d => !isNotaCredito(d.voucherType)).flatMap(d => d.vatLines.filter(l => l.creditComputable)),
    ...sales.filter(d => isNotaCredito(d.voucherType)).flatMap(d => d.vatLines.map(absLine)),
  ];
  // Líneas de compra no computables (factura C, etc.), solo para mostrar en el desglose.
  const nonComputableLines: SettlementVatLine[] = purchases
    .filter(d => !isNotaCredito(d.voucherType))
    .flatMap(d => d.vatLines.filter(l => !l.creditComputable));

  const settlement = calculateVatSettlement({
    sales: debitLines.map(l => ({ vatAmount: l.vatAmount, creditComputable: false })),
    purchases: creditLines.map(l => ({ vatAmount: l.vatAmount, creditComputable: true })),
    previousTechnicalBalance: input.previousTechnicalBalance,
    previousFreeAvailability: input.previousFreeAvailability,
    taxCredits: input.vatCredits,
  });

  const debitByRate: VatRateBreakdown[] = [...groupByRate(debitLines).entries()].map(([rate, v]) => ({
    rate,
    taxableBase: v.taxableBase,
    vatAmount: v.vatAmount,
  }));

  const creditByRate: Array<VatRateBreakdown & { computable: boolean }> = [
    ...[...groupByRate(creditLines).entries()].map(([rate, v]) => ({ rate, taxableBase: v.taxableBase, vatAmount: v.vatAmount, computable: true })),
    ...[...groupByRate(nonComputableLines).entries()].map(([rate, v]) => ({ rate, taxableBase: v.taxableBase, vatAmount: v.vatAmount, computable: false })),
  ];

  return { settlement, debitByRate, creditByRate };
}

export type GrossIncomeJurisdictionConfig = {
  jurisdictionCode: string;
  activityCode?: string;
  taxRate: Decimal;
  coefficient?: Decimal;
  credits?: Array<{ amount: Decimal }>;
  previousFavorBalance?: Decimal;
  /** Base imponible asignada a esta actividad (reparto por monto entre actividades de una jurisdicción). */
  assignedBaseOverride?: Decimal;
};

export type GrossIncomeSettlementView = {
  settlement: GrossIncomeSettlementResult;
  taxableBase: Decimal;
};

export function buildGrossIncomeSettlement(input: {
  regime: GrossIncomeRegime;
  /** Documentos para derivar la base imponible (ventas gravadas netas). */
  documents: SettlementDocument[];
  jurisdictions: GrossIncomeJurisdictionConfig[];
}): GrossIncomeSettlementView {
  // Base imponible de IIBB = ventas gravadas netas (suma de bases gravadas de los documentos SALE).
  const taxableBase = input.documents
    .filter(d => d.direction === 'SALE')
    .flatMap(d => d.vatLines)
    .filter(l => l.kind === 'TAXED')
    .reduce((sum, l) => sum.add(l.taxableBase), new Decimal(0));

  const settlement = calculateGrossIncomeSettlement({
    regime: input.regime,
    taxableBase,
    jurisdictions: input.jurisdictions,
  });

  return { settlement, taxableBase };
}
