import type { PersonalDeductionsInput } from '../types';

export type WizardPersonalDeductionType = PersonalDeductionsInput['tipoDeduccionEspecial'];

export const WIZARD_PERSONAL_DEDUCTION_TYPES = [
  'Autonomo',
  'Emprendedor',
  'Dependiente',
  'Ninguna',
] as const satisfies readonly WizardPersonalDeductionType[];

export function isWizardPersonalDeductionType(value: string): value is WizardPersonalDeductionType {
  return WIZARD_PERSONAL_DEDUCTION_TYPES.includes(value as WizardPersonalDeductionType);
}

export function coerceWizardPersonalDeductionType(value: string): WizardPersonalDeductionType {
  return isWizardPersonalDeductionType(value) ? value : 'Ninguna';
}

export type WizardCellValue = string | number | boolean | null | undefined | Date;
export type WizardEditableRecord = Record<string, unknown>;
export type WizardMoneyValue = string | number;
export type WizardParameterScalar = string | number | null | undefined;
export type WizardImportKind = 'sales' | 'purchases' | 'withholdings';

export function createWizardFixedAssetId(): string {
  return globalThis.crypto.randomUUID();
}

export function wizardMoneyToString(value: WizardMoneyValue | null | undefined, fallback = '0'): string {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

export function wizardMoneyToNumber(value: WizardMoneyValue | null | undefined, fallback = 0): number {
  const parsed = Number(wizardMoneyToString(value, String(fallback)));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export type WizardOtherJustificationColumn = 1 | 2;

export type WizardOtherJustificationPresetKey =
  | 'herenciaDonacion'
  | 'gastoNoDeducible'
  | 'gananciaExenta'
  | 'amortizacionTercera'
  | 'axiPositivo'
  | 'axiNegativo';

export type WizardOtherJustificationPreset = {
  key: WizardOtherJustificationPresetKey;
  label: string;
  concept: string;
  column: WizardOtherJustificationColumn;
  reference: string;
};

export const WIZARD_OTHER_JUSTIFICATION_PRESETS = [
  {
    key: 'herenciaDonacion',
    label: 'Herencia / donacion',
    concept: 'Bienes recibidos por herencia, legado o donacion',
    column: 2,
    reference: 'JVP!D11',
  },
  {
    key: 'gastoNoDeducible',
    label: 'Gasto no deducible',
    concept: 'Otros conceptos que no justifican erogaciones o aumentos patrimoniales',
    column: 1,
    reference: 'JVP!C8',
  },
  {
    key: 'gananciaExenta',
    label: 'Ganancia exenta',
    concept: 'Ganancias exentas o no gravadas',
    column: 2,
    reference: 'JVP!D9',
  },
  {
    key: 'amortizacionTercera',
    label: 'Amortizacion 3ra',
    concept: 'Amortizacion tercera categoria',
    column: 2,
    reference: 'JVP!D13',
  },
  {
    key: 'axiPositivo',
    label: 'AXI positivo',
    concept: 'Ajuste por inflacion positivo',
    column: 1,
    reference: 'JVP!C8',
  },
  {
    key: 'axiNegativo',
    label: 'AXI negativo',
    concept: 'Ajuste por inflacion negativo',
    column: 2,
    reference: 'JVP!D13',
  },
] as const satisfies readonly WizardOtherJustificationPreset[];

export function coerceWizardOtherJustificationColumn(value: WizardMoneyValue | null | undefined): WizardOtherJustificationColumn {
  return Number(value) === 1 ? 1 : 2;
}

export function buildDefaultWizardOtherJustification(): WizardOtherJustification {
  return {
    concept: 'Nueva justificacion patrimonial',
    column: 2,
    amount: '0',
  };
}

export function buildWizardOtherJustificationFromPreset(
  key: WizardOtherJustificationPresetKey
): WizardOtherJustification {
  const preset = WIZARD_OTHER_JUSTIFICATION_PRESETS.find(item => item.key === key);

  return {
    concept: preset?.concept || 'Nueva justificacion patrimonial',
    column: preset?.column || 2,
    amount: '0',
  };
}

export function resolveWizardRouteReturnId(routeId: string | null | undefined): string {
  return routeId && routeId !== 'crear' ? routeId : '';
}

export function shouldResetWizardDetailsOnIdentityChange({
  activeReturnId,
  hasSavedState,
}: {
  activeReturnId: string;
  hasSavedState: boolean;
}): boolean {
  return !activeReturnId && !hasSavedState;
}

export function shouldApplyWizardSnapshotField(snapshot: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(snapshot, field);
}

export function shouldRequestActiveTaxParameters(taxParameterSetId: string): boolean {
  return taxParameterSetId.trim() !== '';
}

export type TaxResolutionOption = WizardEditableRecord & {
  id: string;
  resolution: string;
  version: string | number;
};

export type WizardTaxParameterSet = Record<string, WizardParameterScalar> & {
  sourceLaw?: string;
  version?: string | number;
};

export type WizardTaxBracket = Record<string, WizardParameterScalar> & {
  fromAmount?: WizardParameterScalar;
  toAmount?: WizardParameterScalar;
  fixedAmount?: WizardParameterScalar;
  percentage?: WizardParameterScalar;
  excessOf?: WizardParameterScalar;
};

export type WizardIpcIndex = Record<string, WizardParameterScalar> & {
  monthIndex?: WizardParameterScalar;
  ipcValue?: WizardParameterScalar;
};

export type ActiveTaxParameters = WizardEditableRecord & {
  parameterSet?: WizardTaxParameterSet | null;
  previousDecemberIndex?: {
    year?: WizardParameterScalar;
    ipcValue?: WizardParameterScalar;
  } | null;
  brackets?: WizardTaxBracket[];
  indices?: WizardIpcIndex[];
};

export type WizardClient = WizardEditableRecord & {
  id: string;
  cuit: string;
  name: string;
  status?: string | null;
  fiscalCondition?: string;
  mainActivity?: string | null;
};

export type WizardTaxReturnSummary = WizardEditableRecord & {
  id: string;
  clientId?: string;
  cuit?: string;
  year: number;
  status?: string;
};

export type WizardSale = WizardEditableRecord & {
  date?: string;
  netAmount?: WizardMoneyValue;
  isExempt?: boolean;
  invoiceType?: string;
  invoiceNumber?: string;
  customerName?: string;
  counterpartyCuit?: string;
  ivaAmount?: WizardMoneyValue;
  totalAmount?: WizardMoneyValue;
  importSource?: string;
  sourceFiscalDocumentId?: string;
};

export type WizardPurchase = WizardEditableRecord & {
  date?: string;
  netAmount?: WizardMoneyValue;
  isDeductible?: boolean;
  isExempt?: boolean;
  expenseType?: string;
  invoiceType?: string;
  invoiceNumber?: string;
  vendorName?: string;
  counterpartyCuit?: string;
  ivaAmount?: WizardMoneyValue;
  totalAmount?: WizardMoneyValue;
  importSource?: string;
  sourceFiscalDocumentId?: string;
};

export type WizardFixedAsset = WizardEditableRecord & {
  id?: string;
  name?: string;
  type?: string;
  purchaseDate?: string;
  originalCost?: WizardMoneyValue;
  usefulLife?: WizardMoneyValue;
  yearsElapsed?: WizardMoneyValue;
  customReexpIndex?: WizardMoneyValue;
  isRetired?: boolean | string;
};

export type WizardBankAccount = WizardEditableRecord & {
  id?: string;
  name?: string;
  cuitBank?: string;
  accountNumber?: string;
  accountType?: string;
  currency?: string;
  nominalInitial?: WizardMoneyValue;
  nominalFinal?: WizardMoneyValue;
  tcInitial?: WizardMoneyValue;
  tcFinal?: WizardMoneyValue;
  interests?: WizardMoneyValue;
};

export type WizardCashHolding = WizardEditableRecord & {
  currency?: string;
  nominalInitial?: WizardMoneyValue;
  nominalFinal?: WizardMoneyValue;
  tcFinal?: WizardMoneyValue;
};

export type WizardReceivable = WizardEditableRecord & {
  description?: string;
  type?: string;
  balanceInitial?: WizardMoneyValue;
  balanceFinal?: WizardMoneyValue;
};

export type WizardLiability = WizardEditableRecord & {
  description?: string;
  type?: string;
  balanceInitial?: WizardMoneyValue;
  balanceFinal?: WizardMoneyValue;
};

export type WizardAxiStaticCategory = {
  total: string;
  computable: string;
};

export type WizardAxiStaticBreakdown = {
  activo: Record<string, WizardAxiStaticCategory>;
  pasivo: Record<string, WizardAxiStaticCategory>;
};

export type WizardAxiStaticSuggestion = {
  breakdown: WizardAxiStaticBreakdown;
  activoTotalInicio: string;
  pasivoTotalInicio: string;
  bienesNoComputablesInicio: string;
};

export const DEFAULT_WIZARD_AXI_STATIC_BREAKDOWN: WizardAxiStaticBreakdown = {
  activo: {
    disponibilidadesBancos: { total: '0', computable: '0' },
    retencionesGanancias: { total: '0', computable: '0' },
    anticiposGanancias: { total: '0', computable: '0' },
    creditoFiscal: { total: '0', computable: '0' },
    ivaSaf: { total: '0', computable: '0' },
    safIibb: { total: '0', computable: '0' },
    impuestoLey: { total: '0', computable: '0' },
    deudoresVentas: { total: '0', computable: '0' },
    bienesCambio: { total: '0', computable: '0' },
    bienesUso: { total: '0', computable: '0' },
  },
  pasivo: {
    deudasSociales: { total: '0', computable: '0' },
    deudasFiscales: { total: '0', computable: '0' },
    deudasComerciales: { total: '0', computable: '0' },
    prestamos: { total: '0', computable: '0' },
  },
};

function formatWizardAxiMoney(value: number): string {
  return Math.abs(value) < 0.005 ? '0.00' : value.toFixed(2);
}

function normalizeWizardAxiText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function sumWizardAxiCategories(categories: Record<string, WizardAxiStaticCategory>, field: 'total' | 'computable'): number {
  return Object.values(categories).reduce((sum, item) => sum + wizardMoneyToNumber(item[field]), 0);
}

function buildWizardAxiCategory(total: number, computable: number): WizardAxiStaticCategory {
  return {
    total: formatWizardAxiMoney(total),
    computable: formatWizardAxiMoney(computable),
  };
}

function classifyWizardReceivableForAxi(receivable: WizardReceivable): string {
  const text = normalizeWizardAxiText(`${receivable.description ?? ''} ${receivable.type ?? ''}`);

  if ((text.includes('retencion') || text.includes('percepcion')) && text.includes('ganancia')) {
    return 'retencionesGanancias';
  }

  if (text.includes('anticipo') && text.includes('ganancia')) {
    return 'anticiposGanancias';
  }

  if (text.includes('iva') && (text.includes('saf') || text.includes('saldo a favor'))) {
    return 'ivaSaf';
  }

  if ((text.includes('iibb') || text.includes('ingresos brutos')) && (text.includes('saf') || text.includes('saldo a favor'))) {
    return 'safIibb';
  }

  if (text.includes('impuesto ley')) {
    return 'impuestoLey';
  }

  if (text.includes('saf') || text.includes('saldo a favor')) {
    return 'creditoFiscal';
  }

  return 'deudoresVentas';
}

function classifyWizardLiabilityForAxi(liability: WizardLiability): string {
  const text = normalizeWizardAxiText(`${liability.description ?? ''} ${liability.type ?? ''}`);

  if (
    text.includes('carga') ||
    text.includes('social') ||
    text.includes('sueldo') ||
    text.includes('sindicato') ||
    text.includes('previsional')
  ) {
    return 'deudasSociales';
  }

  if (text.includes('afip') || text.includes('fiscal') || text.includes('impuesto')) {
    return 'deudasFiscales';
  }

  if (
    text.includes('proveedor') ||
    text.includes('comercial') ||
    normalizeWizardAxiText(liability.type).includes('proveedores')
  ) {
    return 'deudasComerciales';
  }

  return 'prestamos';
}

export function buildWizardAxiStaticSuggestion({
  bankAccounts = [],
  cashHoldings = [],
  receivables = [],
  liabilities = [],
  fixedAssets = [],
  initialStock,
  fiscalYear,
}: {
  bankAccounts?: WizardBankAccount[];
  cashHoldings?: WizardCashHolding[];
  receivables?: WizardReceivable[];
  liabilities?: WizardLiability[];
  fixedAssets?: WizardFixedAsset[];
  initialStock?: WizardMoneyValue | null;
  fiscalYear: number;
}): WizardAxiStaticSuggestion {
  const initialBanks = bankAccounts.reduce(
    (sum, bank) => sum + wizardMoneyToNumber(bank.nominalInitial) * wizardMoneyToNumber(bank.tcInitial, 1),
    0
  );
  const initialCash = cashHoldings.reduce(
    (sum, cash) => sum + wizardMoneyToNumber(cash.nominalInitial) * wizardMoneyToNumber(cash.tcFinal, 1),
    0
  );

  const receivableTotals: Record<string, number> = {
    retencionesGanancias: 0,
    anticiposGanancias: 0,
    creditoFiscal: 0,
    ivaSaf: 0,
    safIibb: 0,
    impuestoLey: 0,
    deudoresVentas: 0,
  };

  receivables.forEach(receivable => {
    const key = classifyWizardReceivableForAxi(receivable);
    receivableTotals[key] = (receivableTotals[key] ?? 0) + wizardMoneyToNumber(receivable.balanceInitial);
  });

  const liabilityTotals: Record<string, number> = {
    deudasSociales: 0,
    deudasFiscales: 0,
    deudasComerciales: 0,
    prestamos: 0,
  };

  liabilities.forEach(liability => {
    const key = classifyWizardLiabilityForAxi(liability);
    liabilityTotals[key] = (liabilityTotals[key] ?? 0) + wizardMoneyToNumber(liability.balanceInitial);
  });

  const totalBienesUso = fixedAssets
    .filter(asset => {
      if (!asset.purchaseDate) return false;
      const purchaseYear = new Date(asset.purchaseDate).getFullYear();
      return Number.isFinite(purchaseYear) && purchaseYear < fiscalYear;
    })
    .reduce((sum, asset) => sum + wizardMoneyToNumber(asset.originalCost), 0);

  const totalStock = wizardMoneyToNumber(initialStock);

  const breakdown: WizardAxiStaticBreakdown = {
    activo: {
      disponibilidadesBancos: buildWizardAxiCategory(initialBanks + initialCash, initialBanks + initialCash),
      retencionesGanancias: buildWizardAxiCategory(receivableTotals.retencionesGanancias, 0),
      anticiposGanancias: buildWizardAxiCategory(receivableTotals.anticiposGanancias, 0),
      creditoFiscal: buildWizardAxiCategory(receivableTotals.creditoFiscal, 0),
      ivaSaf: buildWizardAxiCategory(receivableTotals.ivaSaf, 0),
      safIibb: buildWizardAxiCategory(receivableTotals.safIibb, 0),
      impuestoLey: buildWizardAxiCategory(receivableTotals.impuestoLey, 0),
      deudoresVentas: buildWizardAxiCategory(receivableTotals.deudoresVentas, receivableTotals.deudoresVentas),
      bienesCambio: buildWizardAxiCategory(totalStock, totalStock),
      bienesUso: buildWizardAxiCategory(totalBienesUso, 0),
    },
    pasivo: {
      deudasSociales: buildWizardAxiCategory(liabilityTotals.deudasSociales, liabilityTotals.deudasSociales),
      deudasFiscales: buildWizardAxiCategory(liabilityTotals.deudasFiscales, liabilityTotals.deudasFiscales),
      deudasComerciales: buildWizardAxiCategory(liabilityTotals.deudasComerciales, liabilityTotals.deudasComerciales),
      prestamos: buildWizardAxiCategory(liabilityTotals.prestamos, liabilityTotals.prestamos),
    },
  };

  const sumTotalActivo = sumWizardAxiCategories(breakdown.activo, 'total');
  const sumComputableActivo = sumWizardAxiCategories(breakdown.activo, 'computable');
  const sumComputablePasivo = sumWizardAxiCategories(breakdown.pasivo, 'computable');

  return {
    breakdown,
    activoTotalInicio: formatWizardAxiMoney(sumTotalActivo),
    pasivoTotalInicio: formatWizardAxiMoney(sumComputablePasivo),
    bienesNoComputablesInicio: formatWizardAxiMoney(sumTotalActivo - sumComputableActivo),
  };
}

export type WizardEspAuxiliarySummary = {
  efectivosInicio: number;
  efectivosCierre: number;
  creditosInicio: number;
  creditosCierre: number;
  activosAuxiliaresInicio: number;
  activosAuxiliaresCierre: number;
  pasivosAuxiliaresInicio: number;
  pasivosAuxiliaresCierre: number;
  patrimonioNetoAuxiliarInicio: number;
  patrimonioNetoAuxiliarCierre: number;
  diferenciaActivoInicio: number;
  diferenciaPasivoInicio: number;
  hasAuxiliaryData: boolean;
  hasInitialAggregateDifference: boolean;
};

export function buildDefaultWizardCashHolding(): WizardCashHolding {
  return {
    currency: 'ARS',
    nominalInitial: '0',
    nominalFinal: '0',
    tcFinal: '1',
  };
}

export function buildDefaultWizardReceivable(): WizardReceivable {
  return {
    description: 'Nuevo credito',
    type: 'Comercial',
    balanceInitial: '0',
    balanceFinal: '0',
  };
}

export function buildDefaultWizardLiability(): WizardLiability {
  return {
    description: 'Nuevo pasivo comercial',
    type: 'Otros',
    balanceInitial: '0',
    balanceFinal: '0',
  };
}

export function buildWizardEspAuxiliarySummary({
  cashHoldings = [],
  receivables = [],
  liabilities = [],
  activoTotalInicio,
  pasivoTotalInicio,
}: {
  cashHoldings?: WizardCashHolding[];
  receivables?: WizardReceivable[];
  liabilities?: WizardLiability[];
  activoTotalInicio?: WizardMoneyValue | null;
  pasivoTotalInicio?: WizardMoneyValue | null;
}): WizardEspAuxiliarySummary {
  const efectivosInicio = cashHoldings.reduce(
    (sum, cash) => sum + wizardMoneyToNumber(cash.nominalInitial) * wizardMoneyToNumber(cash.tcFinal, 1),
    0
  );
  const efectivosCierre = cashHoldings.reduce(
    (sum, cash) => sum + wizardMoneyToNumber(cash.nominalFinal) * wizardMoneyToNumber(cash.tcFinal, 1),
    0
  );
  const creditosInicio = receivables.reduce((sum, item) => sum + wizardMoneyToNumber(item.balanceInitial), 0);
  const creditosCierre = receivables.reduce((sum, item) => sum + wizardMoneyToNumber(item.balanceFinal), 0);
  const pasivosAuxiliaresInicio = liabilities.reduce((sum, item) => sum + wizardMoneyToNumber(item.balanceInitial), 0);
  const pasivosAuxiliaresCierre = liabilities.reduce((sum, item) => sum + wizardMoneyToNumber(item.balanceFinal), 0);
  const activosAuxiliaresInicio = efectivosInicio + creditosInicio;
  const activosAuxiliaresCierre = efectivosCierre + creditosCierre;
  const patrimonioNetoAuxiliarInicio = activosAuxiliaresInicio - pasivosAuxiliaresInicio;
  const patrimonioNetoAuxiliarCierre = activosAuxiliaresCierre - pasivosAuxiliaresCierre;
  const diferenciaActivoInicio = activosAuxiliaresInicio - wizardMoneyToNumber(activoTotalInicio);
  const diferenciaPasivoInicio = pasivosAuxiliaresInicio - wizardMoneyToNumber(pasivoTotalInicio);
  const hasAuxiliaryData = cashHoldings.length > 0 || receivables.length > 0 || liabilities.length > 0;

  return {
    efectivosInicio,
    efectivosCierre,
    creditosInicio,
    creditosCierre,
    activosAuxiliaresInicio,
    activosAuxiliaresCierre,
    pasivosAuxiliaresInicio,
    pasivosAuxiliaresCierre,
    patrimonioNetoAuxiliarInicio,
    patrimonioNetoAuxiliarCierre,
    diferenciaActivoInicio,
    diferenciaPasivoInicio,
    hasAuxiliaryData,
    hasInitialAggregateDifference: hasAuxiliaryData && (
      Math.abs(diferenciaActivoInicio) > 0.01 ||
      Math.abs(diferenciaPasivoInicio) > 0.01
    ),
  };
}

export type WizardWithholding = WizardEditableRecord & {
  amount?: WizardMoneyValue;
  taxCode?: string;
  cuitAgent?: string;
  agentName?: string;
  taxDescription?: string;
  regimeCode?: string;
  regimeDescription?: string;
  date?: string;
  certificateNumber?: string;
  operationDescription?: string;
};

type WizardImportDuplicateRow = WizardSale | WizardPurchase | WizardWithholding;

export type WizardImportDuplicateResult<T extends WizardImportDuplicateRow> = {
  acceptedRows: T[];
  duplicateRows: T[];
  duplicateCount: number;
  duplicateLabels: string[];
};

function normalizeImportText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeImportCuit(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeImportMoney(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : raw;
}

function normalizeImportDate(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString().split('T')[0];
}

function buildWizardImportDuplicateKey(kind: WizardImportKind, row: WizardImportDuplicateRow): string | null {
  if (kind === 'withholdings') {
    const withholding = row as WizardWithholding;
    const certificateNumber = normalizeImportText(withholding.certificateNumber);
    const amount = normalizeImportMoney(withholding.amount);
    if (!certificateNumber || !amount) return null;

    return [
      'withholding',
      certificateNumber,
      normalizeImportCuit(withholding.cuitAgent),
      normalizeImportDate(withholding.date),
      amount,
    ].join('|');
  }

  const invoice = row as WizardSale | WizardPurchase;
  const invoiceNumber = normalizeImportText(invoice.invoiceNumber);
  const amount = normalizeImportMoney(invoice.netAmount);
  if (!invoiceNumber || !amount) return null;

  return [
    kind,
    invoiceNumber,
    normalizeImportCuit(invoice.counterpartyCuit),
    normalizeImportDate(invoice.date),
    amount,
  ].join('|');
}

function buildWizardImportDuplicateLabel(kind: WizardImportKind, row: WizardImportDuplicateRow): string {
  if (kind === 'withholdings') {
    const withholding = row as WizardWithholding;
    return `certificado ${withholding.certificateNumber || 'sin certificado'} por $${wizardMoneyToString(withholding.amount)}`;
  }

  const invoice = row as WizardSale | WizardPurchase;
  return `comprobante ${invoice.invoiceNumber || 'sin comprobante'} por $${wizardMoneyToString(invoice.netAmount)}`;
}

export function splitWizardImportDuplicates<T extends WizardImportDuplicateRow>({
  kind,
  existingRows,
  incomingRows,
}: {
  kind: WizardImportKind;
  existingRows: T[];
  incomingRows: T[];
}): WizardImportDuplicateResult<T> {
  const knownKeys = new Set(
    existingRows
      .map(row => buildWizardImportDuplicateKey(kind, row))
      .filter((key): key is string => Boolean(key))
  );
  const acceptedRows: T[] = [];
  const duplicateRows: T[] = [];
  const duplicateLabels: string[] = [];

  incomingRows.forEach(row => {
    const key = buildWizardImportDuplicateKey(kind, row);
    if (!key) {
      acceptedRows.push(row);
      return;
    }

    if (knownKeys.has(key)) {
      duplicateRows.push(row);
      duplicateLabels.push(buildWizardImportDuplicateLabel(kind, row));
      return;
    }

    knownKeys.add(key);
    acceptedRows.push(row);
  });

  return {
    acceptedRows,
    duplicateRows,
    duplicateCount: duplicateRows.length,
    duplicateLabels,
  };
}

export type WizardPersonalAsset = WizardEditableRecord & {
  description?: string;
  type?: string;
  valueInitial?: WizardMoneyValue;
  valueFinal?: WizardMoneyValue;
  detail?: string;
};

export type WizardPersonalLiability = WizardEditableRecord & {
  description?: string;
  valueInitial?: WizardMoneyValue;
  valueFinal?: WizardMoneyValue;
};

export type WizardOtherJustification = WizardEditableRecord & {
  concept?: string;
  column?: WizardOtherJustificationColumn;
  amount?: WizardMoneyValue;
};

export type WizardAxiDynamic = WizardEditableRecord & {
  concept?: string;
  type?: string;
  amount?: WizardMoneyValue;
  date?: string;
  coef?: WizardMoneyValue;
  factor?: WizardMoneyValue;
  computedAxi?: WizardMoneyValue;
};

export type WizardPreviousReturnData = WizardEditableRecord & {
  finalStock?: WizardMoneyValue;
  bankAccounts?: WizardBankAccount[];
  personalAssets?: WizardPersonalAsset[];
  fixedAssets?: WizardFixedAsset[];
};
