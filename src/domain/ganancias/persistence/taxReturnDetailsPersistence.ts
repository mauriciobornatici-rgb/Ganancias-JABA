import { Decimal } from 'decimal.js';
import { calculateFixedAssetDepreciation } from '../calculations/amortizaciones';
import { calculateAxiDynamic } from '../calculations/ajustePorInflacion';
import { calculateTaxReturn } from '../calculations/determinacionImpuesto';
import { buildTaxReturnCalculationInput } from '../mappers/calculationInputMapper';
import { buildUsefulCoefficientsFromIndexes } from '../mappers/taxParameterUsefulCoefficients';
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
};

type DbParameterSet = RawRecord & { id: string };
type DbIpcIndex = {
  monthIndex: number;
  ipcValue: Decimal | number | string | { toString(): string };
};

function numberInput(value: NumericValue | undefined, fallback = 0): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integerInput(value: NumericValue | undefined, fallback = 0): number {
  return Math.trunc(numberInput(value, fallback));
}

function stringInput(value: string | undefined, fallback = ''): string {
  return value ?? fallback;
}

function dateInput(value: DateValue | undefined): Date {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
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
  await db.axiDynamicItem.deleteMany({ where: { taxReturnId } });
  await db.calculationRun.deleteMany({ where: { taxReturnId } });

  if (sales.length > 0) {
    await db.salesInvoice.createMany({
      data: sales.map(s => ({
        taxReturnId,
        date: dateInput(s.date),
        invoiceType: stringInput(s.invoiceType, 'Factura'),
        invoiceNumber: stringInput(s.invoiceNumber, '00000000'),
        customerName: stringInput(s.customerName, 'Cliente General'),
        netAmount: numberInput(s.netAmount),
        ivaAmount: numberInput(s.ivaAmount),
        totalAmount: numberInput(s.totalAmount, numberInput(s.netAmount)),
        isExempt: s.isExempt || false,
      })),
    });
  }

  if (purchases.length > 0) {
    await db.purchaseInvoice.createMany({
      data: purchases.map(p => ({
        taxReturnId,
        date: dateInput(p.date),
        invoiceType: stringInput(p.invoiceType, 'Factura'),
        invoiceNumber: stringInput(p.invoiceNumber, '00000000'),
        vendorName: stringInput(p.vendorName, 'Proveedor General'),
        netAmount: numberInput(p.netAmount),
        ivaAmount: numberInput(p.ivaAmount),
        totalAmount: numberInput(p.totalAmount, numberInput(p.netAmount)),
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
    const purchaseDate = dateInput(asset.purchaseDate);
    const originalCost = numberInput(asset.originalCost);
    const usefulLife = integerInput(asset.usefulLife, 10);
    const yearsElapsed = integerInput(asset.yearsElapsed);
    const customReexpIndex = numberInput(asset.customReexpIndex, 1);

    const depResult = calculateFixedAssetDepreciation({
      id: assetId,
      name: assetName,
      type: assetType,
      purchaseDate,
      originalCost: new Decimal(originalCost),
      usefulLife,
      yearsElapsed,
      customReexpIndex: new Decimal(customReexpIndex),
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
        annualDepreciationHist: depResult.annualDepreciationHist.toNumber(),
        annualDepreciationAdj: depResult.annualDepreciationAdj.toNumber(),
        residualValueHist: depResult.residualValueHist.toNumber(),
        residualValueAdj: depResult.residualValueAdj.toNumber(),
      },
    });
  }

  await db.inventoryValue.create({
    data: {
      taxReturnId,
      concept: 'Bienes de Cambio',
      initialStock: numberInput(initialStock),
      finalStock: numberInput(finalStock),
    },
  });

  if (bankAccounts.length > 0) {
    await db.bankAccountBalance.createMany({
      data: bankAccounts.map(bank => {
        const nominalInitial = numberInput(bank.nominalInitial);
        const nominalFinal = numberInput(bank.nominalFinal);
        const tcInitial = numberInput(bank.tcInitial, 1);
        const tcFinal = numberInput(bank.tcFinal, 1);

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
          interests: numberInput(bank.interests),
        };
      }),
    });
  }

  if (db.cashHolding && cashHoldings.length > 0) {
    await db.cashHolding.createMany({
      data: cashHoldings.map(cash => {
        const nominalInitial = numberInput(cash.nominalInitial);
        const nominalFinal = numberInput(cash.nominalFinal);
        const tcFinal = numberInput(cash.tcFinal, 1);

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
        balanceInitial: numberInput(receivable.balanceInitial),
        balanceFinal: numberInput(receivable.balanceFinal),
      })),
    });
  }

  if (db.payableDebt && liabilities.length > 0) {
    await db.payableDebt.createMany({
      data: liabilities.map(liability => ({
        taxReturnId,
        type: stringInput(liability.type, 'Otros'),
        description: stringInput(liability.description),
        balanceInitial: numberInput(liability.balanceInitial),
        balanceFinal: numberInput(liability.balanceFinal),
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
        date: dateInput(withholding.date),
        certificateNumber: stringInput(withholding.certificateNumber, '00000000'),
        operationDescription: stringInput(withholding.operationDescription) || undefined,
        amount: numberInput(withholding.amount),
      })),
    });
  }

  if (personalAssets.length > 0) {
    await db.personalAsset.createMany({
      data: personalAssets.map(asset => ({
        taxReturnId,
        description: stringInput(asset.description),
        type: stringInput(asset.type, 'Otros'),
        valueInitial: numberInput(asset.valueInitial),
        valueFinal: numberInput(asset.valueFinal),
      })),
    });
  }

  if (personalLiabilities.length > 0) {
    await db.personalLiability.createMany({
      data: personalLiabilities.map(liability => ({
        taxReturnId,
        description: stringInput(liability.description),
        valueInitial: numberInput(liability.valueInitial),
        valueFinal: numberInput(liability.valueFinal),
      })),
    });
  }

  if (db.patrimonialJustification && otherJustifications.length > 0) {
    await db.patrimonialJustification.createMany({
      data: otherJustifications.map(justification => ({
        taxReturnId,
        concept: stringInput(justification.concept),
        column: patrimonialColumn(justification.column),
        amount: numberInput(justification.amount),
      })),
    });
  }

  const normalizedAxiDynamic: AxiDynamicInput[] = axiDynamic.map(item => ({
    concept: stringInput(item.concept),
    type: axiDynamicType(item.type),
    date: dateInput(item.date),
    amount: new Decimal(numberInput(item.amount)),
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
        amount: calculatedLine.amount.toNumber(),
        coef: calculatedLine.factorActualizacion.toNumber(),
        factor,
        computedAxi: calculatedLine.computedAxi.toNumber(),
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
  };

  await db.calculationRun.create({
    data: {
      taxReturnId,
      resultThirdCategory: calcResult.resultadoComercialNeto.toNumber(),
      resultTotalNet: calcResult.resultadoNetoTodasCategorias.toNumber(),
      totalGeneralDeductions: calcResult.deduccionesGenerales.totalDeduccionesGeneralesAdmitidas.toNumber(),
      impositiveResultBeforeQuebrantos: calcResult.resultadoNetoAntesQuebrantos.toNumber(),
      quebrantosApplied: 0,
      impositiveResultNet: calcResult.resultadoImpositivoNeto.toNumber(),
      totalPersonalDeductions: calcResult.deduccionesPersonales.totalDeduccionesPersonalesAdmitidas.toNumber(),
      taxableIncome: calcResult.gananciaNetaSujetaImpuesto.toNumber(),
      taxDetermined: calcResult.impuestoDeterminado.toNumber(),
      totalPaymentsOnAccount: calcResult.retencionesYPercepciones.toNumber(),
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
