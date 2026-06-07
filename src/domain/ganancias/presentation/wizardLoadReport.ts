import {
  wizardMoneyToNumber,
  type WizardAxiDynamic,
  type WizardAxiStaticBreakdown,
  type WizardBankAccount,
  type WizardCashHolding,
  type WizardFixedAsset,
  type WizardLiability,
  type WizardMoneyValue,
  type WizardOtherJustification,
  type WizardPersonalAsset,
  type WizardPersonalDeductionType,
  type WizardPersonalLiability,
  type WizardPurchase,
  type WizardReceivable,
  type WizardSale,
  type WizardWithholding,
} from './wizardStateTypes';

export type WizardLoadReportRow = {
  label: string;
  value: string;
  detail?: string;
};

export type WizardLoadReportSection = {
  title: string;
  subtitle: string;
  rows: WizardLoadReportRow[];
};

export type WizardLoadReportMetric = {
  label: string;
  value: string;
  tone: 'neutral' | 'ok' | 'warning';
};

export type WizardLoadReportMetadata = {
  title: string;
  clientName: string;
  cuit: string;
  fiscalYear: string;
  status: string;
  emittedAt: string;
};

export type WizardLoadReport = {
  metadata: WizardLoadReportMetadata;
  metrics: WizardLoadReportMetric[];
  sections: WizardLoadReportSection[];
  validationNotices: string[];
};

export type WizardLoadReportGeneralDeductions = Record<string, WizardMoneyValue | boolean | null | undefined>;

export type WizardLoadReportPersonalDeductions = {
  tieneConyuge?: boolean;
  cantidadHijos?: number;
  cantidadHijosIncapacitados?: number;
  tipoDeduccionEspecial?: WizardPersonalDeductionType;
  esJubiladoOchoHaberes?: boolean;
};

export type WizardLoadReportCalculationResult = {
  resultadoComercialNeto?: unknown;
  resultadoImpositivoNeto?: unknown;
  impuestoDeterminado?: unknown;
  impuestoAPagarOARCA?: unknown;
  jvpJustificationDiff?: unknown;
};

export type WizardLoadReportInput = {
  clientName?: string;
  cuit?: string;
  fiscalYear?: number | string;
  status?: string;
  emittedAt?: Date;
  currentStep?: number;
  sales?: WizardSale[];
  purchases?: WizardPurchase[];
  initialStock?: WizardMoneyValue;
  finalStock?: WizardMoneyValue;
  fixedAssets?: WizardFixedAsset[];
  bankAccounts?: WizardBankAccount[];
  cashHoldings?: WizardCashHolding[];
  receivables?: WizardReceivable[];
  liabilities?: WizardLiability[];
  withholdings?: WizardWithholding[];
  generalDeductions?: WizardLoadReportGeneralDeductions;
  personalDeductions?: WizardLoadReportPersonalDeductions;
  personalAssets?: WizardPersonalAsset[];
  personalLiabilities?: WizardPersonalLiability[];
  otherJustifications?: WizardOtherJustification[];
  activoTotalInicio?: WizardMoneyValue;
  pasivoTotalInicio?: WizardMoneyValue;
  bienesNoComputablesInicio?: WizardMoneyValue;
  saldoAFavorAnterior?: WizardMoneyValue;
  quebrantosAnteriores?: WizardMoneyValue;
  axiDynamic?: WizardAxiDynamic[];
  axiStaticBreakdown?: WizardAxiStaticBreakdown | null;
  calculationResult?: WizardLoadReportCalculationResult | null;
};

function decimalLikeToNumber(value: unknown): number {
  if (
    typeof value === 'object' &&
    value !== null &&
    'toNumber' in value &&
    typeof (value as { toNumber: () => number }).toNumber === 'function'
  ) {
    const parsed = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return wizardMoneyToNumber(value as WizardMoneyValue | null | undefined);
}

export function formatWizardReportMoney(value: unknown): string {
  return `$ ${decimalLikeToNumber(value).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatWizardReportCount(value: number): string {
  return value.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

function formatWizardReportDate(value: Date): string {
  return value.toLocaleString('es-AR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sumRows<T>(rows: T[], selector: (row: T) => unknown): number {
  return rows.reduce((sum, row) => sum + decimalLikeToNumber(selector(row)), 0);
}

function sumGeneralDeductions(generalDeductions: WizardLoadReportGeneralDeductions): number {
  return Object.values(generalDeductions).reduce<number>((sum, value) => {
    if (typeof value === 'boolean') return sum;
    return sum + decimalLikeToNumber(value);
  }, 0);
}

function countAxiStaticRows(axiStaticBreakdown: WizardAxiStaticBreakdown | null | undefined): number {
  if (!axiStaticBreakdown) return 0;
  return Object.keys(axiStaticBreakdown.activo).length + Object.keys(axiStaticBreakdown.pasivo).length;
}

function buildValidationNotices(input: RequiredReportCollections, calculationResult: WizardLoadReportCalculationResult | null | undefined): string[] {
  const notices = [
    'Legajo generado con datos en memoria del wizard; guardar la DDJJ para conservar la carga en base de datos.',
    'Este reporte es soporte interno de carga y no reemplaza comprobantes, papeles de trabajo ni documentacion AFIP.',
  ];

  if (!input.clientName.trim() || !input.cuit.trim()) {
    notices.push('Falta completar contribuyente o CUIT antes de cerrar la DDJJ.');
  }

  if (input.sales.length === 0) {
    notices.push('No hay ventas cargadas; verificar si corresponde importar archivos AFIP de ventas.');
  }

  if (input.purchases.length === 0) {
    notices.push('No hay compras/gastos cargados; verificar si corresponde importar archivos AFIP de compras.');
  }

  const jvpDiff = decimalLikeToNumber(calculationResult?.jvpJustificationDiff);
  if (Math.abs(jvpDiff) > 1) {
    notices.push(`La justificacion patrimonial no cuadra: diferencia ${formatWizardReportMoney(jvpDiff)}.`);
  }

  return notices;
}

type RequiredReportCollections = Required<Omit<
  WizardLoadReportInput,
  | 'emittedAt'
  | 'calculationResult'
  | 'axiStaticBreakdown'
  | 'generalDeductions'
  | 'personalDeductions'
>> & {
  generalDeductions: WizardLoadReportGeneralDeductions;
  personalDeductions: WizardLoadReportPersonalDeductions;
  axiStaticBreakdown: WizardAxiStaticBreakdown | null;
};

function normalizeInput(input: WizardLoadReportInput): RequiredReportCollections {
  return {
    clientName: input.clientName ?? '',
    cuit: input.cuit ?? '',
    fiscalYear: input.fiscalYear ?? '',
    status: input.status ?? 'Borrador',
    currentStep: input.currentStep ?? 1,
    sales: input.sales ?? [],
    purchases: input.purchases ?? [],
    initialStock: input.initialStock ?? '0',
    finalStock: input.finalStock ?? '0',
    fixedAssets: input.fixedAssets ?? [],
    bankAccounts: input.bankAccounts ?? [],
    cashHoldings: input.cashHoldings ?? [],
    receivables: input.receivables ?? [],
    liabilities: input.liabilities ?? [],
    withholdings: input.withholdings ?? [],
    generalDeductions: input.generalDeductions ?? {},
    personalDeductions: input.personalDeductions ?? {},
    personalAssets: input.personalAssets ?? [],
    personalLiabilities: input.personalLiabilities ?? [],
    otherJustifications: input.otherJustifications ?? [],
    activoTotalInicio: input.activoTotalInicio ?? '0',
    pasivoTotalInicio: input.pasivoTotalInicio ?? '0',
    bienesNoComputablesInicio: input.bienesNoComputablesInicio ?? '0',
    saldoAFavorAnterior: input.saldoAFavorAnterior ?? '0',
    quebrantosAnteriores: input.quebrantosAnteriores ?? '0',
    axiDynamic: input.axiDynamic ?? [],
    axiStaticBreakdown: input.axiStaticBreakdown ?? null,
  };
}

export function buildWizardLoadReport(input: WizardLoadReportInput): WizardLoadReport {
  const normalized = normalizeInput(input);
  const emittedAt = input.emittedAt ?? new Date();
  const salesTaxed = normalized.sales.filter(sale => !sale.isExempt);
  const salesExempt = normalized.sales.filter(sale => sale.isExempt);
  const purchasesDeductible = normalized.purchases.filter(purchase => purchase.isDeductible && !purchase.isExempt);
  const purchasesNonDeductible = normalized.purchases.filter(purchase => !purchase.isDeductible && !purchase.isExempt);
  const purchasesExempt = normalized.purchases.filter(purchase => purchase.isExempt);
  const fixedAssetsTotal = sumRows(normalized.fixedAssets, asset => asset.originalCost);
  const bankInitial = sumRows(normalized.bankAccounts, bank => decimalLikeToNumber(bank.nominalInitial) * decimalLikeToNumber(bank.tcInitial || 1));
  const bankFinal = sumRows(normalized.bankAccounts, bank => decimalLikeToNumber(bank.nominalFinal) * decimalLikeToNumber(bank.tcFinal || 1));
  const cashFinal = sumRows(normalized.cashHoldings, cash => decimalLikeToNumber(cash.nominalFinal) * decimalLikeToNumber(cash.tcFinal || 1));
  const receivablesFinal = sumRows(normalized.receivables, receivable => receivable.balanceFinal);
  const liabilitiesFinal = sumRows(normalized.liabilities, liability => liability.balanceFinal);
  const withholdingsTotal = sumRows(normalized.withholdings, withholding => withholding.amount);
  const generalDeductionsTotal = sumGeneralDeductions(normalized.generalDeductions);
  const otherJustificationsColumnI = normalized.otherJustifications
    .filter(row => Number(row.column) === 1)
    .reduce((sum, row) => sum + decimalLikeToNumber(row.amount), 0);
  const otherJustificationsColumnII = normalized.otherJustifications
    .filter(row => Number(row.column) !== 1)
    .reduce((sum, row) => sum + decimalLikeToNumber(row.amount), 0);

  const sections: WizardLoadReportSection[] = [
    {
      title: 'Paso 1 - Contribuyente y saldos iniciales',
      subtitle: 'Identificacion, periodo fiscal y saldos base para AXI/JVP.',
      rows: [
        { label: 'Contribuyente', value: normalized.clientName || 'Sin informar' },
        { label: 'CUIT', value: normalized.cuit || 'Sin informar' },
        { label: 'Periodo fiscal', value: String(normalized.fiscalYear || 'Sin informar') },
        { label: 'Estado', value: String(normalized.status) },
        { label: 'Activo total al inicio', value: formatWizardReportMoney(normalized.activoTotalInicio) },
        { label: 'Pasivo total al inicio', value: formatWizardReportMoney(normalized.pasivoTotalInicio) },
        { label: 'Bienes no computables al inicio', value: formatWizardReportMoney(normalized.bienesNoComputablesInicio) },
        { label: 'Saldo a favor anterior', value: formatWizardReportMoney(normalized.saldoAFavorAnterior) },
        { label: 'Quebrantos anteriores', value: formatWizardReportMoney(normalized.quebrantosAnteriores) },
      ],
    },
    {
      title: 'Paso 2 - Ingresos y ventas',
      subtitle: 'Ventas importadas o cargadas manualmente.',
      rows: [
        { label: 'Comprobantes de venta', value: formatWizardReportCount(normalized.sales.length) },
        { label: 'Ventas gravadas', value: formatWizardReportMoney(sumRows(salesTaxed, sale => sale.netAmount)) },
        { label: 'Ventas exentas/no gravadas', value: formatWizardReportMoney(sumRows(salesExempt, sale => sale.netAmount)) },
      ],
    },
    {
      title: 'Paso 3 - Gastos, compras y existencias',
      subtitle: 'Compras, gastos y datos que alimentan CMV.',
      rows: [
        { label: 'Comprobantes de compra/gasto', value: formatWizardReportCount(normalized.purchases.length) },
        { label: 'Compras deducibles', value: formatWizardReportMoney(sumRows(purchasesDeductible, purchase => purchase.netAmount)) },
        { label: 'Compras no deducibles', value: formatWizardReportMoney(sumRows(purchasesNonDeductible, purchase => purchase.netAmount)) },
        { label: 'Compras exentas/no gravadas', value: formatWizardReportMoney(sumRows(purchasesExempt, purchase => purchase.netAmount)) },
        { label: 'Existencia inicial', value: formatWizardReportMoney(normalized.initialStock) },
        { label: 'Existencia final', value: formatWizardReportMoney(normalized.finalStock) },
      ],
    },
    {
      title: 'Paso 4 - Patrimonio, bancos y bienes',
      subtitle: 'Patrimonio comercial y personal utilizado para ESP/JVP.',
      rows: [
        { label: 'Bienes de uso cargados', value: formatWizardReportCount(normalized.fixedAssets.length), detail: formatWizardReportMoney(fixedAssetsTotal) },
        { label: 'Bancos al inicio', value: formatWizardReportMoney(bankInitial) },
        { label: 'Bancos al cierre', value: formatWizardReportMoney(bankFinal) },
        { label: 'Efectivo al cierre', value: formatWizardReportMoney(cashFinal) },
        { label: 'Creditos al cierre', value: formatWizardReportMoney(receivablesFinal) },
        { label: 'Pasivos al cierre', value: formatWizardReportMoney(liabilitiesFinal) },
        { label: 'Activos personales', value: formatWizardReportCount(normalized.personalAssets.length) },
        { label: 'Pasivos personales', value: formatWizardReportCount(normalized.personalLiabilities.length) },
      ],
    },
    {
      title: 'Paso 5 - Deducciones, retenciones, JVP y AXI',
      subtitle: 'Deducciones y ajustes que impactan la determinacion.',
      rows: [
        { label: 'Deducciones generales cargadas', value: formatWizardReportMoney(generalDeductionsTotal) },
        { label: 'Deduccion especial seleccionada', value: normalized.personalDeductions.tipoDeduccionEspecial ?? 'Ninguna' },
        { label: 'Conyuge', value: normalized.personalDeductions.tieneConyuge ? 'Si' : 'No' },
        { label: 'Hijos', value: formatWizardReportCount(normalized.personalDeductions.cantidadHijos ?? 0) },
        { label: 'Retenciones cargadas', value: formatWizardReportMoney(withholdingsTotal), detail: `${normalized.withholdings.length} registros` },
        { label: 'Otras justificaciones columna I', value: formatWizardReportMoney(otherJustificationsColumnI) },
        { label: 'Otras justificaciones columna II', value: formatWizardReportMoney(otherJustificationsColumnII) },
        { label: 'Movimientos AXI dinamico', value: formatWizardReportCount(normalized.axiDynamic.length) },
        { label: 'Rubros AXI estatico cargados', value: formatWizardReportCount(countAxiStaticRows(normalized.axiStaticBreakdown)) },
      ],
    },
    {
      title: 'Paso 6 - Liquidacion y controles',
      subtitle: 'Resultados calculados al momento de generar el legajo.',
      rows: [
        { label: 'Resultado comercial neto', value: formatWizardReportMoney(input.calculationResult?.resultadoComercialNeto) },
        { label: 'Resultado impositivo neto', value: formatWizardReportMoney(input.calculationResult?.resultadoImpositivoNeto) },
        { label: 'Impuesto determinado', value: formatWizardReportMoney(input.calculationResult?.impuestoDeterminado) },
        { label: 'Saldo final', value: formatWizardReportMoney(input.calculationResult?.impuestoAPagarOARCA) },
        { label: 'Diferencia JVP', value: formatWizardReportMoney(input.calculationResult?.jvpJustificationDiff) },
      ],
    },
  ];

  return {
    metadata: {
      title: 'Legajo de Carga - Ganancias Personas Humanas',
      clientName: normalized.clientName || 'Sin informar',
      cuit: normalized.cuit || 'Sin informar',
      fiscalYear: String(normalized.fiscalYear || 'Sin informar'),
      status: String(normalized.status),
      emittedAt: formatWizardReportDate(emittedAt),
    },
    metrics: [
      { label: 'Ventas cargadas', value: formatWizardReportCount(normalized.sales.length), tone: normalized.sales.length > 0 ? 'ok' : 'warning' },
      { label: 'Compras cargadas', value: formatWizardReportCount(normalized.purchases.length), tone: normalized.purchases.length > 0 ? 'ok' : 'warning' },
      { label: 'Retenciones', value: formatWizardReportCount(normalized.withholdings.length), tone: 'neutral' },
      { label: 'Resultado impositivo neto', value: formatWizardReportMoney(input.calculationResult?.resultadoImpositivoNeto), tone: 'neutral' },
    ],
    sections,
    validationNotices: buildValidationNotices(normalized, input.calculationResult),
  };
}
