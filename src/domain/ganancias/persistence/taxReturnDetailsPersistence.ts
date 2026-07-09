import { Decimal } from 'decimal.js';
import { calculateFixedAssetDepreciation } from '../calculations/amortizaciones';
import { calculateAxiDynamic } from '../calculations/ajustePorInflacion';
import { calculateTaxReturn } from '../calculations/determinacionImpuesto';
import { buildTaxReturnCalculationInput } from '../mappers/calculationInputMapper';
import { buildUsefulCoefficientsFromIndexes } from '../mappers/taxParameterUsefulCoefficients';
import { normalizeArgentineAmountInput } from '../presentation/moneyFormat';
import { TaxReturnInvalidPayloadError } from './taxReturnPersistencePolicy';
import type { AxiDynamicInput } from '../types';

type NumericValue = string | number;
type DateValue = string | number | Date;
type RawRecord = Record<string, unknown>;
type FixedAssetType = 'Rodado' | 'Inmueble' | 'Equipamiento' | 'Otro';

type PersistenceModel = {
  findUnique(args: unknown): Promise<unknown>;
  findFirst(args: unknown): Promise<unknown>;
  findMany(args: unknown): Promise<unknown>;
  deleteMany(args: unknown): Promise<unknown>;
  createMany(args: unknown): Promise<unknown>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  upsert?(args: unknown): Promise<unknown>;
};

type PersistenceDb = {
  taxParameterSet: PersistenceModel;
  taxArt94Bracket: PersistenceModel;
  updateIndex: PersistenceModel;
  salesInvoice: PersistenceModel;
  purchaseInvoice: PersistenceModel;
  fixedAsset: PersistenceModel;
  inventoryValue: PersistenceModel;
  bankAccountBalance: PersistenceModel;
  cashHolding?: PersistenceModel;
  receivableDebt?: PersistenceModel;
  payableDebt?: PersistenceModel;
  taxWithholding: PersistenceModel;
  personalAsset: PersistenceModel;
  personalLiability: PersistenceModel;
  patrimonialJustification?: PersistenceModel;
  generalDeduction?: PersistenceModel;
  personalDeduction?: PersistenceModel;
  axiStaticItem?: PersistenceModel;
  axiDynamicItem: PersistenceModel;
  calculationRun: PersistenceModel;
  taxReturn: PersistenceModel;
};

type ExistingTaxReturn = {
  taxParameterSetId?: string | null;
  fiscalYearId: string;
  status: string;
  client: {
    name: string;
    cuit: string;
  };
  fiscalYear: {
    year: number;
  };
};

type SalesPayload = {
  date?: DateValue;
  netAmount?: NumericValue;
  isExempt?: boolean;
  invoiceType?: string;
  invoiceNumber?: string;
  customerName?: string;
  counterpartyCuit?: string;
  ivaAmount?: NumericValue;
  totalAmount?: NumericValue;
};

type PurchasePayload = SalesPayload & {
  isDeductible?: boolean;
  expenseType?: string;
  vendorName?: string;
};

type FixedAssetPayload = {
  id?: string;
  name?: string;
  type?: string;
  purchaseDate?: DateValue;
  originalCost?: NumericValue;
  usefulLife?: NumericValue;
  yearsElapsed?: NumericValue;
  customReexpIndex?: NumericValue;
  isRetired?: boolean | string;
};

type BankAccountPayload = {
  name?: string;
  cuitBank?: string;
  accountNumber?: string;
  accountType?: string;
  nominalInitial?: NumericValue;
  nominalFinal?: NumericValue;
  tcInitial?: NumericValue;
  tcFinal?: NumericValue;
  interests?: NumericValue;
};

type CashHoldingPayload = {
  currency?: string;
  nominalInitial?: NumericValue;
  nominalFinal?: NumericValue;
  tcFinal?: NumericValue;
};

type ReceivablePayload = {
  description?: string;
  type?: string;
  balanceInitial?: NumericValue;
  balanceFinal?: NumericValue;
};

type PayablePayload = {
  description?: string;
  type?: string;
  balanceInitial?: NumericValue;
  balanceFinal?: NumericValue;
};

type WithholdingPayload = {
  taxCode?: string;
  amount?: NumericValue;
  cuitAgent?: string;
  agentName?: string;
  taxDescription?: string;
  regimeCode?: string;
  regimeDescription?: string;
  date?: DateValue;
  certificateNumber?: string;
  operationDescription?: string;
};

type PersonalAssetPayload = {
  description?: string;
  type?: string;
  valueInitial?: NumericValue;
  valueFinal?: NumericValue;
};

type PersonalLiabilityPayload = {
  description?: string;
  valueInitial?: NumericValue;
  valueFinal?: NumericValue;
};

type OtherJustificationPayload = {
  concept?: string;
  column?: NumericValue;
  amount?: NumericValue;
};

type PersonalDeductionsPayload = {
  tieneConyuge?: boolean;
  cantidadHijos?: NumericValue;
  cantidadHijosIncapacitados?: NumericValue;
  tipoDeduccionEspecial?: string;
  esJubiladoOchoHaberes?: boolean;
  [key: string]: unknown;
};

type AxiDynamicPayload = {
  concept?: string;
  type?: string;
  date?: DateValue;
  amount?: NumericValue;
};

type TaxReturnPersistencePayload = {
  cuit?: string;
  clientName?: string;
  fiscalYear?: NumericValue;
  currentStep?: number;
  taxParameterSetId?: string | null;
  sales?: SalesPayload[];
  purchases?: PurchasePayload[];
  fixedAssets?: FixedAssetPayload[];
  initialStock?: NumericValue;
  finalStock?: NumericValue;
  bankAccounts?: BankAccountPayload[];
  cashHoldings?: CashHoldingPayload[];
  receivables?: ReceivablePayload[];
  liabilities?: PayablePayload[];
  withholdings?: WithholdingPayload[];
  generalDeductions?: RawRecord;
  personalDeductions?: PersonalDeductionsPayload;
  personalAssets?: PersonalAssetPayload[];
  personalLiabilities?: PersonalLiabilityPayload[];
  otherJustifications?: OtherJustificationPayload[];
  activoTotalInicio?: NumericValue;
  pasivoTotalInicio?: NumericValue;
  bienesNoComputablesInicio?: NumericValue;
  saldoAFavorAnterior?: NumericValue;
  quebrantosAnteriores?: NumericValue;
  axiDynamic?: AxiDynamicPayload[];
  status?: string;
  autoCalcInitialBalances?: boolean;
  axiStaticBreakdown?: RawRecord;
};

type DbParameterSet = RawRecord & { id: string };
type DbIpcIndex = {
  monthIndex: number;
  ipcValue: Decimal | number | string | { toString(): string };
};

function parseNumericInput(value: NumericValue | undefined, fallback: number, fieldPath: string): number {
  if (value === undefined || value === null || value === '') return fallback;

  const normalizedValue = typeof value === 'string' && value.includes(',')
    ? normalizeArgentineAmountInput(value)
    : value;
  const parsed = Number(normalizedValue);
  if (!Number.isFinite(parsed)) {
    throw new TaxReturnInvalidPayloadError(fieldPath, value);
  }

  return parsed;
}

function assertValidNumberInput(value: NumericValue | undefined, fieldPath: string, required = false): void {
  if (value === undefined || value === null || value === '') {
    if (required) throw new TaxReturnInvalidPayloadError(fieldPath, value);
    return;
  }

  parseNumericInput(value, 0, fieldPath);
}

function numberInput(value: NumericValue | undefined, fallback = 0, fieldPath = 'importe'): number {
  return parseNumericInput(value, fallback, fieldPath);
}

function integerInput(value: NumericValue | undefined, fallback = 0, fieldPath = 'importe'): number {
  return Math.trunc(numberInput(value, fallback, fieldPath));
}

function stringInput(value: string | undefined, fallback = ''): string {
  return value ?? fallback;
}

function booleanInput(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return fallback;
}

function asRecord(value: unknown): RawRecord {
  return value !== null && typeof value === 'object' ? value as RawRecord : {};
}

function assertValidDateInput(value: DateValue | undefined, fieldPath: string): void {
  if (value === undefined || value === null || value === '') {
    throw new TaxReturnInvalidPayloadError(fieldPath, value);
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TaxReturnInvalidPayloadError(fieldPath, value);
  }
}

function dateInput(value: DateValue | undefined, fieldPath = 'fecha'): Date {
  assertValidDateInput(value, fieldPath);
  return value instanceof Date ? value : new Date(value as string | number);
}

function fixedAssetType(value: string | undefined): FixedAssetType {
  if (value === 'Rodado' || value === 'Inmueble' || value === 'Equipamiento' || value === 'Otro') {
    return value;
  }

  return 'Otro';
}

function axiDynamicType(value: string | undefined): AxiDynamicInput['type'] {
  if (value === 'RetiroSocio' || value === 'AporteCapital' || value === 'Dividendo' || value === 'Otro') {
    return value;
  }

  return 'Otro';
}

function patrimonialColumn(value: NumericValue | undefined): number {
  return integerInput(value, 2) === 1 ? 1 : 2;
}

function validateAxiStaticBreakdown(axiStaticBreakdown: RawRecord | undefined): void {
  if (!axiStaticBreakdown) return;

  for (const [sectionKey, section] of Object.entries(axiStaticBreakdown)) {
    const categories = asRecord(section);
    for (const [categoryKey, rawCategory] of Object.entries(categories)) {
      const category = asRecord(rawCategory);
      assertValidNumberInput(category.total as NumericValue | undefined, `axiStaticBreakdown.${sectionKey}.${categoryKey}.total`);
      assertValidNumberInput(category.computable as NumericValue | undefined, `axiStaticBreakdown.${sectionKey}.${categoryKey}.computable`);
    }
  }
}

function validateTaxReturnPersistencePayload(payload: TaxReturnPersistencePayload): void {
  assertValidNumberInput(payload.fiscalYear, 'fiscalYear');
  assertValidNumberInput(payload.initialStock, 'initialStock');
  assertValidNumberInput(payload.finalStock, 'finalStock');
  assertValidNumberInput(payload.activoTotalInicio, 'activoTotalInicio');
  assertValidNumberInput(payload.pasivoTotalInicio, 'pasivoTotalInicio');
  assertValidNumberInput(payload.bienesNoComputablesInicio, 'bienesNoComputablesInicio');
  assertValidNumberInput(payload.saldoAFavorAnterior, 'saldoAFavorAnterior');
  assertValidNumberInput(payload.quebrantosAnteriores, 'quebrantosAnteriores');

  payload.sales?.forEach((sale, index) => {
    assertValidDateInput(sale.date, `ventas[${index}].date`);
    assertValidNumberInput(sale.netAmount, `ventas[${index}].netAmount`, true);
    assertValidNumberInput(sale.ivaAmount, `ventas[${index}].ivaAmount`);
    assertValidNumberInput(sale.totalAmount, `ventas[${index}].totalAmount`);
  });

  payload.purchases?.forEach((purchase, index) => {
    assertValidDateInput(purchase.date, `compras[${index}].date`);
    assertValidNumberInput(purchase.netAmount, `compras[${index}].netAmount`, true);
    assertValidNumberInput(purchase.ivaAmount, `compras[${index}].ivaAmount`);
    assertValidNumberInput(purchase.totalAmount, `compras[${index}].totalAmount`);
  });

  payload.fixedAssets?.forEach((asset, index) => {
    assertValidDateInput(asset.purchaseDate, `bienesUso[${index}].purchaseDate`);
    assertValidNumberInput(asset.originalCost, `bienesUso[${index}].originalCost`, true);
    assertValidNumberInput(asset.usefulLife, `bienesUso[${index}].usefulLife`);
    assertValidNumberInput(asset.yearsElapsed, `bienesUso[${index}].yearsElapsed`);
    assertValidNumberInput(asset.customReexpIndex, `bienesUso[${index}].customReexpIndex`);
  });

  payload.bankAccounts?.forEach((bank, index) => {
    assertValidNumberInput(bank.nominalInitial, `bancos[${index}].nominalInitial`);
    assertValidNumberInput(bank.nominalFinal, `bancos[${index}].nominalFinal`);
    assertValidNumberInput(bank.tcInitial, `bancos[${index}].tcInitial`);
    assertValidNumberInput(bank.tcFinal, `bancos[${index}].tcFinal`);
    assertValidNumberInput(bank.interests, `bancos[${index}].interests`);
  });

  payload.cashHoldings?.forEach((cash, index) => {
    assertValidNumberInput(cash.nominalInitial, `efectivo[${index}].nominalInitial`);
    assertValidNumberInput(cash.nominalFinal, `efectivo[${index}].nominalFinal`);
    assertValidNumberInput(cash.tcFinal, `efectivo[${index}].tcFinal`);
  });

  payload.receivables?.forEach((receivable, index) => {
    assertValidNumberInput(receivable.balanceInitial, `creditos[${index}].balanceInitial`);
    assertValidNumberInput(receivable.balanceFinal, `creditos[${index}].balanceFinal`);
  });

  payload.liabilities?.forEach((liability, index) => {
    assertValidNumberInput(liability.balanceInitial, `pasivos[${index}].balanceInitial`);
    assertValidNumberInput(liability.balanceFinal, `pasivos[${index}].balanceFinal`);
  });

  payload.withholdings?.forEach((withholding, index) => {
    assertValidDateInput(withholding.date, `retenciones[${index}].date`);
    assertValidNumberInput(withholding.amount, `retenciones[${index}].amount`, true);
  });

  if (payload.personalDeductions) {
    [
      'cantidadHijos',
      'cantidadHijosIncapacitados',
    ].forEach(key => {
      assertValidNumberInput(
        payload.personalDeductions?.[key] as NumericValue | undefined,
        `deduccionesPersonales.${key}`
      );
    });
  }

  payload.personalAssets?.forEach((asset, index) => {
    assertValidNumberInput(asset.valueInitial, `bienesPersonales[${index}].valueInitial`);
    assertValidNumberInput(asset.valueFinal, `bienesPersonales[${index}].valueFinal`);
  });

  payload.personalLiabilities?.forEach((liability, index) => {
    assertValidNumberInput(liability.valueInitial, `deudasPersonales[${index}].valueInitial`);
    assertValidNumberInput(liability.valueFinal, `deudasPersonales[${index}].valueFinal`);
  });

  payload.otherJustifications?.forEach((justification, index) => {
    assertValidNumberInput(justification.column, `otrasJustificaciones[${index}].column`);
    assertValidNumberInput(justification.amount, `otrasJustificaciones[${index}].amount`, true);
  });

  payload.axiDynamic?.forEach((item, index) => {
    assertValidDateInput(item.date, `axiDinamico[${index}].date`);
    assertValidNumberInput(item.amount, `axiDinamico[${index}].amount`, true);
  });

  if (payload.generalDeductions) {
    for (const key of GENERAL_DEDUCTION_KEYS) {
      assertValidNumberInput(payload.generalDeductions[key] as NumericValue | undefined, `deduccionesGenerales.${key}`);
    }
  }

  validateAxiStaticBreakdown(payload.axiStaticBreakdown);
}

const GENERAL_DEDUCTION_KEYS = [
  'autonomos',
  'servicioDomestico',
  'seguroVida',
  'seguroRetiro',
  'gastosSepelio',
  'interesesHipoteca',
  'gastosEducativos',
  'alquilerCasaHabitacion',
  'deduccionLocadorLocatario',
  'donaciones',
  'medicosAsistencial',
  'honorariosMedicos',
] as const;

function buildGeneralDeductionData(taxReturnId: string, generalDeductions: RawRecord | undefined) {
  if (!generalDeductions) return null;

  return GENERAL_DEDUCTION_KEYS.reduce<Record<string, unknown>>((data, key) => {
    data[key] = numberInput(generalDeductions[key] as NumericValue | undefined);
    return data;
  }, { taxReturnId });
}

function buildPersonalDeductionData(taxReturnId: string, personalDeductions: PersonalDeductionsPayload | undefined) {
  if (!personalDeductions) return null;

  return {
    taxReturnId,
    tieneConyuge: booleanInput(personalDeductions.tieneConyuge),
    cantidadHijos: integerInput(personalDeductions.cantidadHijos),
    cantidadHijosIncapacitados: integerInput(personalDeductions.cantidadHijosIncapacitados),
    tipoDeduccionEspecial: personalDeductions.tipoDeduccionEspecial || 'Ninguna',
    esJubiladoOchoHaberes: booleanInput(personalDeductions.esJubiladoOchoHaberes),
  };
}

function omitTaxReturnId(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => key !== 'taxReturnId')
  );
}

const AXI_STATIC_LABELS: Record<string, string> = {
  disponibilidadesBancos: 'Disponibilidades-Bancos',
  retencionesGanancias: 'Retenciones de Ganancias',
  anticiposGanancias: 'Ganancias Anticipos',
  creditoFiscal: 'Credito Fiscal',
  ivaSaf: 'IVA SAF',
  safIibb: 'SAF IIBB',
  impuestoLey: 'Impuesto Ley Computable',
  deudoresVentas: 'Deudores por Ventas',
  bienesCambio: 'Bienes de Cambio',
  bienesUso: 'Bienes de Uso',
  deudasSociales: 'Deudas Sociales',
  deudasFiscales: 'Deudas Fiscales',
  deudasComerciales: 'Deudas Comerciales',
  prestamos: 'Prestamos',
};

function buildAxiStaticRows(taxReturnId: string, axiStaticBreakdown: RawRecord | undefined): Record<string, unknown>[] {
  if (!axiStaticBreakdown) return [];

  const rows: Record<string, unknown>[] = [];
  const activo = asRecord(axiStaticBreakdown.activo);
  const pasivo = asRecord(axiStaticBreakdown.pasivo);

  Object.entries(activo).forEach(([categoryKey, rawCategory]) => {
    const category = asRecord(rawCategory);
    const totalAmount = numberInput(category.total as NumericValue | undefined);
    const computableAmount = numberInput(category.computable as NumericValue | undefined);
    const concept = stringInput(category.label as string | undefined, AXI_STATIC_LABELS[categoryKey] || categoryKey);

    rows.push({
      taxReturnId,
      concept,
      section: Math.abs(computableAmount) > 0 ? 'ACTIVO_TOTAL' : 'BIEN_NO_COMPUTABLE',
      categoryKey,
      amount: totalAmount,
      totalAmount,
      computableAmount,
      isComputable: Math.abs(computableAmount) > 0,
    });
  });

  Object.entries(pasivo).forEach(([categoryKey, rawCategory]) => {
    const category = asRecord(rawCategory);
    const totalAmount = numberInput(category.total as NumericValue | undefined);
    const computableAmount = numberInput(category.computable as NumericValue | undefined, totalAmount);
    const concept = stringInput(category.label as string | undefined, AXI_STATIC_LABELS[categoryKey] || categoryKey);

    rows.push({
      taxReturnId,
      concept,
      section: 'PASIVO_TOTAL',
      categoryKey,
      amount: totalAmount,
      totalAmount,
      computableAmount,
      isComputable: Math.abs(computableAmount) > 0,
    });
  });

  return rows;
}

export async function persistTaxReturnDetails({
  db,
  taxReturnId,
  existingReturn,
  payload,
}: {
  db: PersistenceDb;
  taxReturnId: string;
  existingReturn: ExistingTaxReturn;
  payload: TaxReturnPersistencePayload;
}): Promise<void> {
  validateTaxReturnPersistencePayload(payload);

  const {
    cuit,
    clientName,
    fiscalYear,
    currentStep,
    taxParameterSetId,
    sales = [],
    purchases = [],
    fixedAssets = [],
    initialStock = '0',
    finalStock = '0',
    bankAccounts = [],
    cashHoldings = [],
    receivables = [],
    liabilities = [],
    withholdings = [],
    generalDeductions,
    personalDeductions,
    personalAssets = [],
    personalLiabilities = [],
    otherJustifications = [],
    activoTotalInicio = '0',
    pasivoTotalInicio = '0',
    bienesNoComputablesInicio = '0',
    saldoAFavorAnterior = '0',
    quebrantosAnteriores = '0',
    axiDynamic = [],
    status,
    autoCalcInitialBalances = true,
  } = payload;

  const fiscalYearNumber = integerInput(fiscalYear, existingReturn.fiscalYear.year);
  const requestedResId = taxParameterSetId || existingReturn.taxParameterSetId;
  let dbParamSet: DbParameterSet | null = null;
  if (requestedResId) {
    dbParamSet = await db.taxParameterSet.findUnique({
      where: { id: requestedResId },
    }) as DbParameterSet | null;
  }

  if (!dbParamSet) {
    dbParamSet = await db.taxParameterSet.findFirst({
      where: { fiscalYear: { year: fiscalYearNumber } },
      orderBy: { version: 'desc' },
    }) as DbParameterSet | null;
  }

  if (!dbParamSet) {
    throw new Error(`No se encontraron parametros impositivos registrados en la base de datos para el anio ${fiscalYearNumber}. Cargue una resolucion primero en Parametros.`);
  }

  const dbBrackets = await db.taxArt94Bracket.findMany({
    where: {
      OR: [
        { taxParameterSetId: dbParamSet.id },
        { fiscalYearId: existingReturn.fiscalYearId, taxParameterSetId: null },
      ],
    },
  }) as unknown[];

  const dbIpcIndices = await db.updateIndex.findMany({
    where: { fiscalYearId: existingReturn.fiscalYearId },
    orderBy: { monthIndex: 'asc' },
  }) as DbIpcIndex[];
  const previousDecemberIndex = await db.updateIndex.findFirst({
    where: {
      fiscalYear: { year: fiscalYearNumber - 1 },
      monthIndex: 12,
    },
  }) as DbIpcIndex | null;
  const usefulCoefficients = buildUsefulCoefficientsFromIndexes(dbIpcIndices, previousDecemberIndex);

  const calculationInput = buildTaxReturnCalculationInput({
    clientName: clientName || existingReturn.client.name,
    cuit: cuit || existingReturn.client.cuit,
    fiscalYear: fiscalYearNumber,
    sales,
    purchases,
    fixedAssets,
    initialStock,
    finalStock,
    bankAccounts,
    cashHoldings,
    receivables,
    liabilities,
    withholdings,
    generalDeductions,
    personalDeductions: {
      tieneConyuge: personalDeductions?.tieneConyuge || false,
      cantidadHijos: integerInput(personalDeductions?.cantidadHijos),
      cantidadHijosIncapacitados: integerInput(personalDeductions?.cantidadHijosIncapacitados),
      tipoDeduccionEspecial: personalDeductions?.tipoDeduccionEspecial || 'Ninguna',
      esJubiladoOchoHaberes: personalDeductions?.esJubiladoOchoHaberes || false,
    },
    personalAssets,
    personalLiabilities,
    otherJustifications,
    activoTotalInicio,
    bienesNoComputablesInicio,
    pasivoTotalInicio,
    axiDynamic,
    saldoAFavorAnterior,
    quebrantosAnteriores,
  }, {
    parameterSet: dbParamSet,
    brackets: dbBrackets,
    indices: dbIpcIndices,
    usefulCoefficients,
  });

  const calcResult = calculateTaxReturn(calculationInput);

  await db.salesInvoice.deleteMany({ where: { taxReturnId } });
  await db.purchaseInvoice.deleteMany({ where: { taxReturnId } });
  await db.fixedAsset.deleteMany({ where: { taxReturnId } });
  await db.inventoryValue.deleteMany({ where: { taxReturnId } });
  await db.bankAccountBalance.deleteMany({ where: { taxReturnId } });
  await db.cashHolding?.deleteMany({ where: { taxReturnId } });
  await db.receivableDebt?.deleteMany({ where: { taxReturnId } });
  await db.payableDebt?.deleteMany({ where: { taxReturnId } });
  await db.taxWithholding.deleteMany({ where: { taxReturnId } });
  await db.personalAsset.deleteMany({ where: { taxReturnId } });
  await db.personalLiability.deleteMany({ where: { taxReturnId } });
  await db.patrimonialJustification?.deleteMany({ where: { taxReturnId } });
  await db.axiStaticItem?.deleteMany({ where: { taxReturnId } });
  await db.axiDynamicItem.deleteMany({ where: { taxReturnId } });

  if (sales.length > 0) {
    await db.salesInvoice.createMany({
      data: sales.map(s => ({
        taxReturnId,
        date: dateInput(s.date, 'ventas.date'),
        invoiceType: stringInput(s.invoiceType, 'Factura'),
        invoiceNumber: stringInput(s.invoiceNumber, '00000000'),
        customerName: stringInput(s.customerName, 'Cliente General'),
        counterpartyCuit: stringInput(s.counterpartyCuit) || undefined,
        netAmount: numberInput(s.netAmount, 0, 'ventas.netAmount'),
        ivaAmount: numberInput(s.ivaAmount, 0, 'ventas.ivaAmount'),
        totalAmount: numberInput(s.totalAmount, numberInput(s.netAmount, 0, 'ventas.netAmount'), 'ventas.totalAmount'),
        isExempt: s.isExempt || false,
      })),
    });
  }

  if (purchases.length > 0) {
    await db.purchaseInvoice.createMany({
      data: purchases.map(p => ({
        taxReturnId,
        date: dateInput(p.date, 'compras.date'),
        invoiceType: stringInput(p.invoiceType, 'Factura'),
        invoiceNumber: stringInput(p.invoiceNumber, '00000000'),
        vendorName: stringInput(p.vendorName, 'Proveedor General'),
        counterpartyCuit: stringInput(p.counterpartyCuit) || undefined,
        netAmount: numberInput(p.netAmount, 0, 'compras.netAmount'),
        ivaAmount: numberInput(p.ivaAmount, 0, 'compras.ivaAmount'),
        totalAmount: numberInput(p.totalAmount, numberInput(p.netAmount, 0, 'compras.netAmount'), 'compras.totalAmount'),
        isDeductible: p.isDeductible !== false,
        isExempt: p.isExempt || false,
        expenseType: p.expenseType || 'GastosGenerales',
      })),
    });
  }

  for (const asset of fixedAssets) {
    const assetId = stringInput(asset.id);
    const assetName = stringInput(asset.name);
    const assetType = fixedAssetType(asset.type);
    const purchaseDate = dateInput(asset.purchaseDate, 'bienesUso.purchaseDate');
    const originalCost = numberInput(asset.originalCost, 0, 'bienesUso.originalCost');
    const usefulLife = integerInput(asset.usefulLife, 10, 'bienesUso.usefulLife');
    const yearsElapsed = integerInput(asset.yearsElapsed, 0, 'bienesUso.yearsElapsed');
    const customReexpIndex = numberInput(asset.customReexpIndex, 1, 'bienesUso.customReexpIndex');
    const isRetired = booleanInput(asset.isRetired);

    const depResult = calculateFixedAssetDepreciation({
      id: assetId,
      name: assetName,
      type: assetType,
      purchaseDate,
      originalCost: new Decimal(originalCost),
      usefulLife,
      yearsElapsed,
      customReexpIndex: new Decimal(customReexpIndex),
      isRetired,
    });

    await db.fixedAsset.create({
      data: {
        id: assetId || undefined,
        taxReturnId,
        name: assetName,
        type: assetType,
        purchaseDate,
        originalCost,
        usefulLife,
        yearsElapsed,
        customReexpIndex,
        isRetired,
        annualDepreciationHist: depResult.annualDepreciationHist.toNumber(),
        annualDepreciationAdj: depResult.annualDepreciationAdj.toNumber(),
        residualValueHist: depResult.residualValueHist.toNumber(),
        residualValueAdj: depResult.residualValueAdj.toNumber(),
        bajaLossHist: depResult.bajaLossHist?.toNumber() ?? 0,
        bajaLossAdj: depResult.bajaLossAdj?.toNumber() ?? 0,
      },
    });
  }

  await db.inventoryValue.create({
    data: {
      taxReturnId,
      concept: 'Bienes de Cambio',
      initialStock: numberInput(initialStock, 0, 'initialStock'),
      finalStock: numberInput(finalStock, 0, 'finalStock'),
    },
  });

  if (bankAccounts.length > 0) {
    await db.bankAccountBalance.createMany({
      data: bankAccounts.map(bank => {
        const nominalInitial = numberInput(bank.nominalInitial, 0, 'bancos.nominalInitial');
        const nominalFinal = numberInput(bank.nominalFinal, 0, 'bancos.nominalFinal');
        const tcInitial = numberInput(bank.tcInitial, 1, 'bancos.tcInitial');
        const tcFinal = numberInput(bank.tcFinal, 1, 'bancos.tcFinal');

        return {
          taxReturnId,
          bankName: stringInput(bank.name),
          cuitBank: stringInput(bank.cuitBank),
          accountNumber: stringInput(bank.accountNumber),
          accountType: stringInput(bank.accountType, 'Cuenta Corriente'),
          nominalBalanceInitial: nominalInitial,
          nominalBalanceFinal: nominalFinal,
          tcInitial,
          tcFinal,
          balanceInitialArs: nominalInitial * tcInitial,
          balanceFinalArs: nominalFinal * tcFinal,
          interests: numberInput(bank.interests, 0, 'bancos.interests'),
        };
      }),
    });
  }

  if (db.cashHolding && cashHoldings.length > 0) {
    await db.cashHolding.createMany({
      data: cashHoldings.map(cash => {
        const nominalInitial = numberInput(cash.nominalInitial, 0, 'efectivo.nominalInitial');
        const nominalFinal = numberInput(cash.nominalFinal, 0, 'efectivo.nominalFinal');
        const tcFinal = numberInput(cash.tcFinal, 1, 'efectivo.tcFinal');

        return {
          taxReturnId,
          currency: stringInput(cash.currency, 'ARS'),
          nominalInitial,
          nominalFinal,
          tcFinal,
          totalInitialArs: nominalInitial * tcFinal,
          totalFinalArs: nominalFinal * tcFinal,
        };
      }),
    });
  }

  if (db.receivableDebt && receivables.length > 0) {
    await db.receivableDebt.createMany({
      data: receivables.map(receivable => ({
        taxReturnId,
        type: stringInput(receivable.type, 'Comercial'),
        description: stringInput(receivable.description),
        balanceInitial: numberInput(receivable.balanceInitial, 0, 'creditos.balanceInitial'),
        balanceFinal: numberInput(receivable.balanceFinal, 0, 'creditos.balanceFinal'),
      })),
    });
  }

  if (db.payableDebt && liabilities.length > 0) {
    await db.payableDebt.createMany({
      data: liabilities.map(liability => ({
        taxReturnId,
        type: stringInput(liability.type, 'Otros'),
        description: stringInput(liability.description),
        balanceInitial: numberInput(liability.balanceInitial, 0, 'pasivos.balanceInitial'),
        balanceFinal: numberInput(liability.balanceFinal, 0, 'pasivos.balanceFinal'),
      })),
    });
  }

  if (withholdings.length > 0) {
    await db.taxWithholding.createMany({
      data: withholdings.map(withholding => ({
        taxReturnId,
        cuitAgent: stringInput(withholding.cuitAgent) || undefined,
        agentName: stringInput(withholding.agentName, 'Agente Retencion'),
        taxCode: withholding.taxCode || 'Ganancias',
        taxDescription: stringInput(withholding.taxDescription, withholding.taxCode === 'Otros' ? 'Otros Impuestos' : 'Impuesto a las Ganancias'),
        regimeCode: stringInput(withholding.regimeCode) || undefined,
        regimeDescription: stringInput(withholding.regimeDescription) || undefined,
        date: dateInput(withholding.date, 'retenciones.date'),
        certificateNumber: stringInput(withholding.certificateNumber, '00000000'),
        operationDescription: stringInput(withholding.operationDescription) || undefined,
        amount: numberInput(withholding.amount, 0, 'retenciones.amount'),
      })),
    });
  }

  if (personalAssets.length > 0) {
    await db.personalAsset.createMany({
      data: personalAssets.map(asset => ({
        taxReturnId,
        description: stringInput(asset.description),
        type: stringInput(asset.type, 'Otros'),
        valueInitial: numberInput(asset.valueInitial, 0, 'bienesPersonales.valueInitial'),
        valueFinal: numberInput(asset.valueFinal, 0, 'bienesPersonales.valueFinal'),
      })),
    });
  }

  if (personalLiabilities.length > 0) {
    await db.personalLiability.createMany({
      data: personalLiabilities.map(liability => ({
        taxReturnId,
        description: stringInput(liability.description),
        valueInitial: numberInput(liability.valueInitial, 0, 'deudasPersonales.valueInitial'),
        valueFinal: numberInput(liability.valueFinal, 0, 'deudasPersonales.valueFinal'),
      })),
    });
  }

  if (db.patrimonialJustification && otherJustifications.length > 0) {
    await db.patrimonialJustification.createMany({
      data: otherJustifications.map(justification => ({
        taxReturnId,
        concept: stringInput(justification.concept),
        column: patrimonialColumn(justification.column),
        amount: numberInput(justification.amount, 0, 'otrasJustificaciones.amount'),
      })),
    });
  }

  const generalDeductionData = buildGeneralDeductionData(taxReturnId, generalDeductions);
  if (db.generalDeduction?.upsert && generalDeductionData) {
    await db.generalDeduction.upsert({
      where: { taxReturnId },
      create: generalDeductionData,
      update: omitTaxReturnId(generalDeductionData),
    });
  }

  const personalDeductionData = buildPersonalDeductionData(taxReturnId, personalDeductions);
  if (db.personalDeduction?.upsert && personalDeductionData) {
    await db.personalDeduction.upsert({
      where: { taxReturnId },
      create: personalDeductionData,
      update: omitTaxReturnId(personalDeductionData),
    });
  }

  const axiStaticRows = buildAxiStaticRows(taxReturnId, payload.axiStaticBreakdown);
  if (db.axiStaticItem && axiStaticRows.length > 0) {
    await db.axiStaticItem.createMany({ data: axiStaticRows });
  }

  const normalizedAxiDynamic: AxiDynamicInput[] = axiDynamic.map(item => ({
    concept: stringInput(item.concept),
    type: axiDynamicType(item.type),
    date: dateInput(item.date, 'axiDinamico.date'),
    amount: new Decimal(numberInput(item.amount, 0, 'axiDinamico.amount')),
  }));
  const persistedAxiDynamic = calculateAxiDynamic(
    normalizedAxiDynamic,
    dbIpcIndices.map(index => ({
      monthIndex: index.monthIndex,
      ipcValue: new Decimal(index.ipcValue.toString()),
    })),
    usefulCoefficients
  );

  for (const [index, item] of normalizedAxiDynamic.entries()) {
    const calculatedLine = persistedAxiDynamic.lines[index];
    const factor = item.type === 'AporteCapital' ? -1 : 1;
    await db.axiDynamicItem.create({
      data: {
        taxReturnId,
        concept: calculatedLine.concept,
        type: item.type,
        date: item.date,
        amount: Math.round(calculatedLine.amount.toNumber()),
        coef: calculatedLine.factorActualizacion.toNumber(),
        factor,
        computedAxi: Math.round(calculatedLine.computedAxi.toNumber()),
      },
    });
  }

  const extraStateData = {
    currentStep: currentStep || 1,
    taxParameterSetId: dbParamSet.id,
    generalDeductions,
    personalDeductions,
    activoTotalInicio,
    pasivoTotalInicio,
    bienesNoComputablesInicio,
    saldoAFavorAnterior,
    quebrantosAnteriores,
    sales,
    purchases,
    cashHoldings,
    receivables,
    liabilities,
    withholdings,
    otherJustifications,
    axiDynamic,
    autoCalcInitialBalances,
    personalAssets,
    fixedAssets,
    axiStaticBreakdown: payload.axiStaticBreakdown,
  };

  await db.calculationRun.create({
    data: {
      taxReturnId,
      resultThirdCategory: calcResult.resultadoComercialNeto.toNumber(),
      resultTotalNet: calcResult.resultadoNetoTodasCategorias.toNumber(),
      totalGeneralDeductions: calcResult.deduccionesGenerales.totalDeduccionesGeneralesAdmitidas.toNumber(),
      impositiveResultBeforeQuebrantos: calcResult.resultadoNetoAntesQuebrantos.toNumber(),
      // Quebrantos efectivamente aplicados = resultado positivo antes de quebrantos - resultado neto
      quebrantosApplied: Decimal.max(calcResult.resultadoNetoAntesQuebrantos, 0).sub(calcResult.resultadoImpositivoNeto).toNumber(),
      impositiveResultNet: calcResult.resultadoImpositivoNeto.toNumber(),
      totalPersonalDeductions: calcResult.deduccionesPersonales.totalDeduccionesPersonalesAdmitidas.toNumber(),
      taxableIncome: calcResult.gananciaNetaSujetaImpuesto.toNumber(),
      taxDetermined: calcResult.impuestoDeterminado.toNumber(),
      // Retenciones + anticipos cancelados + IDCB computable + combustibles (IG 25 F62:F67)
      totalPaymentsOnAccount: calcResult.retencionesYPercepciones
        .add(calcResult.anticiposCanceladosEfectivo ?? 0)
        .add(calcResult.anticiposCanceladosIdcb ?? 0)
        .add(calcResult.anticiposCanceladosMisFacilidades ?? 0)
        .add(calcResult.computoIdcb ?? 0)
        .add(calcResult.computoCombustibles ?? 0)
        .sub(calcResult.saldoTrasladableIdcb ?? 0)
        .toNumber(),
      finalBalance: calcResult.impuestoAPagarOARCA.toNumber(),
      computedConsumo: calcResult.consumoDiferencial.toNumber(),
      justificationDiff: calcResult.jvpJustificationDiff.toNumber(),
      axiStaticResult: calcResult.axiStaticResult.toNumber(),
      axiDynamicResult: calcResult.axiDynamicResult.toNumber(),
      axiNetAdjustment: calcResult.resultadoAjustePorInflacion.toNumber(),
      variablesSnapshot: JSON.stringify(extraStateData),
      hasErrors: calcResult.warnings.length > 0,
      errorMessages: calcResult.warnings.join(' | '),
    },
  });

  await db.taxReturn.update({
    where: { id: taxReturnId },
    data: {
      status: status || existingReturn.status,
      taxParameterSetId: dbParamSet.id,
      updatedAt: new Date(),
    },
  });
}
