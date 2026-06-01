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

export type WizardWithholding = WizardEditableRecord & {
  amount?: WizardMoneyValue;
  taxCode?: string;
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
