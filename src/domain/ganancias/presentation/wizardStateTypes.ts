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
};

export const WIZARD_OTHER_JUSTIFICATION_PRESETS = [
  {
    key: 'herenciaDonacion',
    label: 'Herencia / donacion',
    concept: 'Bienes recibidos por herencia, legado o donacion',
    column: 2,
  },
  {
    key: 'gastoNoDeducible',
    label: 'Gasto no deducible',
    concept: 'Otros conceptos que no justifican erogaciones o aumentos patrimoniales',
    column: 1,
  },
  {
    key: 'gananciaExenta',
    label: 'Ganancia exenta',
    concept: 'Ganancias exentas o no gravadas',
    column: 2,
  },
  {
    key: 'amortizacionTercera',
    label: 'Amortizacion 3ra',
    concept: 'Amortizacion tercera categoria',
    column: 2,
  },
  {
    key: 'axiPositivo',
    label: 'AXI positivo',
    concept: 'Ajuste por inflacion positivo',
    column: 1,
  },
  {
    key: 'axiNegativo',
    label: 'AXI negativo',
    concept: 'Ajuste por inflacion negativo',
    column: 2,
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
  brackets?: WizardTaxBracket[];
  indices?: WizardIpcIndex[];
};

export type WizardClient = WizardEditableRecord & {
  id: string;
  cuit: string;
  name: string;
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

export type WizardPersonalAsset = WizardEditableRecord & {
  description?: string;
  type?: string;
  valueInitial?: WizardMoneyValue;
  valueFinal?: WizardMoneyValue;
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
