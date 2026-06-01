import { describe, expect, it } from 'vitest';
import { persistTaxReturnDetails } from '../persistence/taxReturnDetailsPersistence';

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
  data: {
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
    expect(snapshot.sales[0]).toMatchObject({
      invoiceNumber: '0003-00001529',
      counterpartyCuit: '24300000000',
    });
    expect(snapshot.purchases[0]).toMatchObject({
      invoiceNumber: '0004-00000243',
      counterpartyCuit: '307141419',
    });
  });
});
