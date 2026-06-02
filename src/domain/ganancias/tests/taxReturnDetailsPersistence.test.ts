import { describe, expect, it } from 'vitest';
import { persistTaxReturnDetails } from '../persistence/taxReturnDetailsPersistence';
import { buildTaxReturnPreview } from '../presentation/taxReturnPreview';

function model(overrides: Record<string, unknown> = {}) {
  return {
    findUnique: async () => null,
    findFirst: async () => null,
    findMany: async () => [],
    deleteMany: async () => undefined,
    createMany: async () => undefined,
    create: async () => undefined,
    update: async () => undefined,
    ...overrides,
  };
}

const parameterSet = {
  id: 'params-2025',
  minimoNoImponible: 0,
  conyuge: 0,
  hijo: 0,
  hijoIncapacitado: 0,
  especialAutonomo: 0,
  especialEmprendedor: 0,
  especialDependiente: 0,
  topeServicioDomestico: 0,
  topeSeguroVida: 0,
  topeSeguroRetiro: 0,
  topeGastosSepelio: 0,
  topeInteresHipoteca: 0,
  topeGastosEducativos: 0,
};

const bracket = {
  fromAmount: 0,
  toAmount: null,
  fixedAmount: 0,
  percentage: 0.05,
  excessOf: 0,
};

type CreateManyCapture = {
  data: Record<string, unknown>[];
};

type CalculationCreateCapture = {
  data: Record<string, unknown> & {
    variablesSnapshot: string;
  };
};

describe('persistTaxReturnDetails', () => {
  it('preserva comprobante y contraparte importados en ventas y compras', async () => {
    const captures: {
      salesCreateMany?: CreateManyCapture;
      purchasesCreateMany?: CreateManyCapture;
      calculationCreate?: CalculationCreateCapture;
    } = {};

    const db = {
      taxParameterSet: model({ findUnique: async () => parameterSet }),
      taxArt94Bracket: model({ findMany: async () => [bracket] }),
      updateIndex: model(),
      salesInvoice: model({ createMany: async (args: unknown) => { captures.salesCreateMany = args as CreateManyCapture; } }),
      purchaseInvoice: model({ createMany: async (args: unknown) => { captures.purchasesCreateMany = args as CreateManyCapture; } }),
      fixedAsset: model(),
      inventoryValue: model(),
      bankAccountBalance: model(),
      taxWithholding: model(),
      personalAsset: model(),
      personalLiability: model(),
      axiDynamicItem: model(),
      calculationRun: model({ create: async (args: unknown) => { captures.calculationCreate = args as CalculationCreateCapture; } }),
      taxReturn: model(),
    };

    await persistTaxReturnDetails({
      db,
      taxReturnId: 'return-123',
      existingReturn: {
        taxParameterSetId: 'params-2025',
        fiscalYearId: 'fy-2025',
        status: 'Borrador',
        client: { name: 'Cliente Test', cuit: '20-12345678-9' },
        fiscalYear: { year: 2025 },
      },
      payload: {
        fiscalYear: 2025,
        sales: [{
          date: '2025-02-03',
          netAmount: '9256.20',
          isExempt: false,
          invoiceType: '1',
          invoiceNumber: '0003-00001529',
          customerName: 'OIMASTI LUCIANO',
          counterpartyCuit: '24300000000',
          ivaAmount: '1943.80',
          totalAmount: '11200.00',
        }],
        purchases: [{
          date: '2025-02-01',
          netAmount: '21250.00',
          isDeductible: true,
          isExempt: false,
          expenseType: 'GastosGenerales',
          invoiceType: '1',
          invoiceNumber: '0004-00000243',
          vendorName: 'VAVCOMS.P',
          counterpartyCuit: '307141419',
          ivaAmount: '3118.75',
          totalAmount: '25833.75',
        }],
      },
    });

    expect(captures.salesCreateMany?.data[0]).toMatchObject({
      invoiceType: '1',
      invoiceNumber: '0003-00001529',
      customerName: 'OIMASTI LUCIANO',
      ivaAmount: 1943.8,
      totalAmount: 11200,
    });
    expect(captures.purchasesCreateMany?.data[0]).toMatchObject({
      invoiceType: '1',
      invoiceNumber: '0004-00000243',
      vendorName: 'VAVCOMS.P',
      ivaAmount: 3118.75,
      totalAmount: 25833.75,
    });

    expect(captures.calculationCreate).toBeDefined();
    const snapshot = JSON.parse(captures.calculationCreate?.data.variablesSnapshot || '{}');
    expect(snapshot.taxParameterSetId).toBe('params-2025');
    expect(snapshot.sales[0]).toMatchObject({
      invoiceNumber: '0003-00001529',
      counterpartyCuit: '24300000000',
    });
    expect(snapshot.purchases[0]).toMatchObject({
      invoiceNumber: '0004-00000243',
      counterpartyCuit: '307141419',
    });
  });

  it('persiste efectivo, creditos y pasivos comerciales cargados para ESP/JVP', async () => {
    const captures: {
      cashCreateMany?: CreateManyCapture;
      receivablesCreateMany?: CreateManyCapture;
      liabilitiesCreateMany?: CreateManyCapture;
      calculationCreate?: CalculationCreateCapture;
    } = {};

    const db = {
      taxParameterSet: model({ findUnique: async () => parameterSet }),
      taxArt94Bracket: model({ findMany: async () => [bracket] }),
      updateIndex: model(),
      salesInvoice: model(),
      purchaseInvoice: model(),
      fixedAsset: model(),
      inventoryValue: model(),
      bankAccountBalance: model(),
      cashHolding: model({ createMany: async (args: unknown) => { captures.cashCreateMany = args as CreateManyCapture; } }),
      receivableDebt: model({ createMany: async (args: unknown) => { captures.receivablesCreateMany = args as CreateManyCapture; } }),
      payableDebt: model({ createMany: async (args: unknown) => { captures.liabilitiesCreateMany = args as CreateManyCapture; } }),
      taxWithholding: model(),
      personalAsset: model(),
      personalLiability: model(),
      axiDynamicItem: model(),
      calculationRun: model({ create: async (args: unknown) => { captures.calculationCreate = args as CalculationCreateCapture; } }),
      taxReturn: model(),
    };

    await persistTaxReturnDetails({
      db,
      taxReturnId: 'return-esp',
      existingReturn: {
        taxParameterSetId: 'params-2025',
        fiscalYearId: 'fy-2025',
        status: 'Borrador',
        client: { name: 'Cliente ESP', cuit: '20-55555555-5' },
        fiscalYear: { year: 2025 },
      },
      payload: {
        fiscalYear: 2025,
        cashHoldings: [{
          currency: 'USD',
          nominalInitial: '100',
          nominalFinal: '150',
          tcFinal: '1446',
        }],
        receivables: [{
          description: 'IVA saldo tecnico',
          type: 'Fiscal',
          balanceInitial: '10000',
          balanceFinal: '25000',
        }],
        liabilities: [{
          description: 'Proveedor local',
          type: 'Proveedores',
          balanceInitial: '30000',
          balanceFinal: '12000',
        }],
      },
    });

    expect(captures.cashCreateMany?.data[0]).toMatchObject({
      taxReturnId: 'return-esp',
      currency: 'USD',
      nominalInitial: 100,
      nominalFinal: 150,
      tcFinal: 1446,
      totalInitialArs: 144600,
      totalFinalArs: 216900,
    });
    expect(captures.receivablesCreateMany?.data[0]).toMatchObject({
      taxReturnId: 'return-esp',
      description: 'IVA saldo tecnico',
      type: 'Fiscal',
      balanceInitial: 10000,
      balanceFinal: 25000,
    });
    expect(captures.liabilitiesCreateMany?.data[0]).toMatchObject({
      taxReturnId: 'return-esp',
      description: 'Proveedor local',
      type: 'Proveedores',
      balanceInitial: 30000,
      balanceFinal: 12000,
    });

    const snapshot = JSON.parse(captures.calculationCreate?.data.variablesSnapshot || '{}');
    expect(snapshot.cashHoldings[0].currency).toBe('USD');
    expect(snapshot.receivables[0].description).toBe('IVA saldo tecnico');
    expect(snapshot.liabilities[0].description).toBe('Proveedor local');
  });

  it('preserva detalle importado de retenciones para auditoria y reapertura', async () => {
    const captures: {
      withholdingCreateMany?: CreateManyCapture;
      calculationCreate?: CalculationCreateCapture;
    } = {};

    const db = {
      taxParameterSet: model({ findUnique: async () => parameterSet }),
      taxArt94Bracket: model({ findMany: async () => [bracket] }),
      updateIndex: model(),
      salesInvoice: model(),
      purchaseInvoice: model(),
      fixedAsset: model(),
      inventoryValue: model(),
      bankAccountBalance: model(),
      taxWithholding: model({ createMany: async (args: unknown) => { captures.withholdingCreateMany = args as CreateManyCapture; } }),
      personalAsset: model(),
      personalLiability: model(),
      axiDynamicItem: model(),
      calculationRun: model({ create: async (args: unknown) => { captures.calculationCreate = args as CalculationCreateCapture; } }),
      taxReturn: model(),
    };

    await persistTaxReturnDetails({
      db,
      taxReturnId: 'return-ret',
      existingReturn: {
        taxParameterSetId: 'params-2025',
        fiscalYearId: 'fy-2025',
        status: 'Borrador',
        client: { name: 'Cliente Retenciones', cuit: '20-77777777-7' },
        fiscalYear: { year: 2025 },
      },
      payload: {
        fiscalYear: 2025,
        withholdings: [{
          amount: '12500.65',
          taxCode: 'Ganancias',
          cuitAgent: '30-70809010-9',
          agentName: 'Banco Galicia SA',
          taxDescription: 'RETENCIONES GANANCIAS',
          regimeCode: '12',
          regimeDescription: 'RET-GANANCIAS REG-12',
          date: '2025-05-15',
          certificateNumber: '12345',
          operationDescription: 'Retencion de cuenta',
        }],
      },
    });

    expect(captures.withholdingCreateMany?.data[0]).toMatchObject({
      taxReturnId: 'return-ret',
      cuitAgent: '30-70809010-9',
      agentName: 'Banco Galicia SA',
      taxCode: 'Ganancias',
      taxDescription: 'RETENCIONES GANANCIAS',
      regimeCode: '12',
      regimeDescription: 'RET-GANANCIAS REG-12',
      certificateNumber: '12345',
      operationDescription: 'Retencion de cuenta',
      amount: 12500.65,
    });
    expect(captures.withholdingCreateMany?.data[0].date).toEqual(new Date('2025-05-15'));

    const snapshot = JSON.parse(captures.calculationCreate?.data.variablesSnapshot || '{}');
    expect(snapshot.withholdings[0]).toMatchObject({
      cuitAgent: '30-70809010-9',
      agentName: 'Banco Galicia SA',
      certificateNumber: '12345',
    });
  });

  it('mantiene la marca de jubilado para que la persistencia coincida con el preview backend', async () => {
    const captures: {
      calculationCreate?: CalculationCreateCapture;
    } = {};

    const db = {
      taxParameterSet: model({ findUnique: async () => parameterSet }),
      taxArt94Bracket: model({ findMany: async () => [bracket] }),
      updateIndex: model(),
      salesInvoice: model({ createMany: async () => undefined }),
      purchaseInvoice: model(),
      fixedAsset: model(),
      inventoryValue: model(),
      bankAccountBalance: model(),
      taxWithholding: model(),
      personalAsset: model(),
      personalLiability: model(),
      axiDynamicItem: model(),
      calculationRun: model({ create: async (args: unknown) => { captures.calculationCreate = args as CalculationCreateCapture; } }),
      taxReturn: model(),
    };

    const payload = {
      clientName: 'Cliente Jubilado',
      cuit: '20-12345678-9',
      fiscalYear: 2025,
      sales: [{ date: '2025-01-01', netAmount: '30000000', isExempt: false }],
      purchases: [],
      fixedAssets: [],
      initialStock: '0',
      finalStock: '0',
      bankAccounts: [],
      withholdings: [],
      generalDeductions: {},
      personalDeductions: {
        tieneConyuge: false,
        cantidadHijos: 0,
        cantidadHijosIncapacitados: 0,
        tipoDeduccionEspecial: 'Dependiente',
        esJubiladoOchoHaberes: true,
      },
      personalAssets: [],
      personalLiabilities: [],
      activoTotalInicio: '0',
      bienesNoComputablesInicio: '0',
      pasivoTotalInicio: '0',
      axiDynamic: [],
      saldoAFavorAnterior: '0',
      quebrantosAnteriores: '0',
    };

    const preview = buildTaxReturnPreview(payload, {
      parameterSet,
      brackets: [bracket],
      indices: [],
    });

    await persistTaxReturnDetails({
      db,
      taxReturnId: 'return-123',
      existingReturn: {
        taxParameterSetId: 'params-2025',
        fiscalYearId: 'fy-2025',
        status: 'Borrador',
        client: { name: 'Cliente Jubilado', cuit: '20-12345678-9' },
        fiscalYear: { year: 2025 },
      },
      payload,
    });

    expect(captures.calculationCreate?.data.totalPersonalDeductions).toBe(preview.deduccionesPersonales.totalDeduccionesPersonalesAdmitidas);
    expect(captures.calculationCreate?.data.finalBalance).toBe(preview.impuestoAPagarOARCA);
  });

  it('usa diciembre del anio anterior para el AXI estatico persistido cuando existe indice previo', async () => {
    const captures: {
      calculationCreate?: CalculationCreateCapture;
    } = {};

    const db = {
      taxParameterSet: model({ findUnique: async () => parameterSet }),
      taxArt94Bracket: model({ findMany: async () => [bracket] }),
      updateIndex: model({
        findMany: async () => [
          { monthIndex: 1, ipcValue: '7864.1257' },
          { monthIndex: 12, ipcValue: '10121.3715' },
        ],
        findFirst: async () => ({ monthIndex: 12, ipcValue: '7694.0075' }),
      }),
      salesInvoice: model(),
      purchaseInvoice: model(),
      fixedAsset: model(),
      inventoryValue: model(),
      bankAccountBalance: model(),
      taxWithholding: model(),
      personalAsset: model(),
      personalLiability: model(),
      axiDynamicItem: model(),
      calculationRun: model({ create: async (args: unknown) => { captures.calculationCreate = args as CalculationCreateCapture; } }),
      taxReturn: model(),
    };

    await persistTaxReturnDetails({
      db,
      taxReturnId: 'return-axi',
      existingReturn: {
        taxParameterSetId: 'params-2025',
        fiscalYearId: 'fy-2025',
        status: 'Borrador',
        client: { name: 'Cliente AXI', cuit: '20-33333333-3' },
        fiscalYear: { year: 2025 },
      },
      payload: {
        fiscalYear: 2025,
        activoTotalInicio: '1000000',
        bienesNoComputablesInicio: '0',
        pasivoTotalInicio: '0',
      },
    });

    expect(captures.calculationCreate?.data.axiStaticResult).toBe(-315488);
  });

  it('guarda el detalle AXI dinamico con coeficiente promedio anual para retiros agregados', async () => {
    const captures: {
      axiDynamicCreate?: {
        data: Record<string, unknown>;
      };
      calculationCreate?: CalculationCreateCapture;
    } = {};

    const db = {
      taxParameterSet: model({ findUnique: async () => parameterSet }),
      taxArt94Bracket: model({ findMany: async () => [bracket] }),
      updateIndex: model({
        findMany: async () => [
          { monthIndex: 1, ipcValue: '7864.1257' },
          { monthIndex: 2, ipcValue: '8052.9927' },
          { monthIndex: 3, ipcValue: '8353.3158' },
          { monthIndex: 4, ipcValue: '8585.6078' },
          { monthIndex: 5, ipcValue: '8714.4871' },
          { monthIndex: 6, ipcValue: '8855.5681' },
          { monthIndex: 7, ipcValue: '9023.973' },
          { monthIndex: 8, ipcValue: '9193.2441' },
          { monthIndex: 9, ipcValue: '9384.0922' },
          { monthIndex: 10, ipcValue: '9603.8623' },
          { monthIndex: 11, ipcValue: '9841.3581' },
          { monthIndex: 12, ipcValue: '10121.3715' },
        ],
        findFirst: async () => ({ monthIndex: 12, ipcValue: '7694.0075' }),
      }),
      salesInvoice: model(),
      purchaseInvoice: model(),
      fixedAsset: model(),
      inventoryValue: model(),
      bankAccountBalance: model(),
      taxWithholding: model(),
      personalAsset: model(),
      personalLiability: model(),
      axiDynamicItem: model({ create: async (args: unknown) => { captures.axiDynamicCreate = args as { data: Record<string, unknown> }; } }),
      calculationRun: model({ create: async (args: unknown) => { captures.calculationCreate = args as CalculationCreateCapture; } }),
      taxReturn: model(),
    };

    await persistTaxReturnDetails({
      db,
      taxReturnId: 'return-axi-dynamic',
      existingReturn: {
        taxParameterSetId: 'params-2025',
        fiscalYearId: 'fy-2025',
        status: 'Borrador',
        client: { name: 'Cliente AXI', cuit: '20-33333333-3' },
        fiscalYear: { year: 2025 },
      },
      payload: {
        fiscalYear: 2025,
        axiDynamic: [{
          concept: 'Retiros de los socios',
          type: 'RetiroSocio',
          amount: '3901371.69',
          date: '2025-12-31',
        }],
      },
    });

    expect(Number(captures.axiDynamicCreate?.data.coef)).toBeCloseTo(1.1288404539857682, 10);
    expect(captures.axiDynamicCreate?.data.computedAxi).toBe(502654);
    expect(captures.calculationCreate?.data.axiDynamicResult).toBe(502654);
  });

  it('persiste otras justificaciones patrimoniales y las conserva en snapshot', async () => {
    const captures: {
      justificationsCreateMany?: CreateManyCapture;
      calculationCreate?: CalculationCreateCapture;
    } = {};

    const db = {
      taxParameterSet: model({ findUnique: async () => parameterSet }),
      taxArt94Bracket: model({ findMany: async () => [bracket] }),
      updateIndex: model(),
      salesInvoice: model(),
      purchaseInvoice: model(),
      fixedAsset: model(),
      inventoryValue: model(),
      bankAccountBalance: model(),
      taxWithholding: model(),
      personalAsset: model(),
      personalLiability: model(),
      patrimonialJustification: model({ createMany: async (args: unknown) => { captures.justificationsCreateMany = args as CreateManyCapture; } }),
      axiDynamicItem: model(),
      calculationRun: model({ create: async (args: unknown) => { captures.calculationCreate = args as CalculationCreateCapture; } }),
      taxReturn: model(),
    };

    await persistTaxReturnDetails({
      db,
      taxReturnId: 'return-jvp',
      existingReturn: {
        taxParameterSetId: 'params-2025',
        fiscalYearId: 'fy-2025',
        status: 'Borrador',
        client: { name: 'Cliente JVP', cuit: '20-44444444-4' },
        fiscalYear: { year: 2025 },
      },
      payload: {
        fiscalYear: 2025,
        otherJustifications: [{
          concept: 'Herencia recibida',
          column: 2,
          amount: '750000',
        }],
      },
    });

    expect(captures.justificationsCreateMany?.data[0]).toMatchObject({
      taxReturnId: 'return-jvp',
      concept: 'Herencia recibida',
      column: 2,
      amount: 750000,
    });
    const snapshot = JSON.parse(captures.calculationCreate?.data.variablesSnapshot || '{}');
    expect(snapshot.otherJustifications[0]).toMatchObject({
      concept: 'Herencia recibida',
      column: 2,
      amount: '750000',
    });
  });
});
