import { describe, expect, it } from 'vitest';
import { calculateTaxReturn } from '../calculations/determinacionImpuesto';
import { buildPilotTaxReturnFixture } from '../fixtures/pilotTaxReturnFixture';
import { buildTaxReturnCalculationInput } from '../mappers/calculationInputMapper';
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

type CreateManyCapture = {
  data: Record<string, unknown>[];
};

type CalculationCreateCapture = {
  data: Record<string, unknown> & {
    variablesSnapshot: string;
  };
};

describe('pilot tax return fixture', () => {
  it('builds a realistic end-to-end input for manual pilot validation', () => {
    const fixture = buildPilotTaxReturnFixture();
    const input = buildTaxReturnCalculationInput(fixture.declarationData, fixture.taxParameters);
    const result = calculateTaxReturn(input);

    expect(input.clientName).toBe('Caso Piloto JABA');
    expect(fixture.taxParameters.indices).toHaveLength(12);
    expect(fixture.declarationData.sales[0]).toMatchObject({
      invoiceNumber: '0003-00001529',
      counterpartyCuit: '24-30000000-0',
    });
    expect(fixture.declarationData.purchases[0]).toMatchObject({
      invoiceNumber: '0004-00000243',
      counterpartyCuit: '30-71414141-9',
    });
    expect(input.sales).toHaveLength(2);
    expect(input.purchases).toHaveLength(2);
    expect(input.cashHoldings[0]).toMatchObject({ currency: 'USD' });
    expect(input.receivables[0].description).toBe('Clientes al cierre');
    expect(input.liabilities[0].description).toBe('Proveedor local');
    expect(input.withholdings[0]).toMatchObject({
      cuitAgent: '30-70809010-9',
      agentName: 'Banco Galicia SA',
      certificateNumber: 'RET-2025-00012345',
    });
    expect(input.otherJustifications.map(item => item.concept)).toContain('Bienes recibidos por herencia, legado o donacion');
    expect(input.axiDynamic[0]).toMatchObject({ concept: 'Retiro titular marzo', type: 'RetiroSocio' });

    expect(result.errors).toEqual([]);
    expect(result.ventasGravadas.gt(0)).toBe(true);
    expect(result.retencionesYPercepciones.toNumber()).toBe(12501);
    expect(result.jvpTotalColumnaI.gt(0)).toBe(true);
    expect(result.jvpTotalColumnaII.gt(0)).toBe(true);
    expect(result.impuestoDeterminado.gte(0)).toBe(true);
  });

  it('persists the pilot declaration payload into the critical detail structures', async () => {
    const fixture = buildPilotTaxReturnFixture();
    const parameterSet = {
      id: 'params-2025',
      ...fixture.taxParameters.parameterSet,
    };
    const captures: {
      salesCreateMany?: CreateManyCapture;
      purchasesCreateMany?: CreateManyCapture;
      cashCreateMany?: CreateManyCapture;
      receivablesCreateMany?: CreateManyCapture;
      liabilitiesCreateMany?: CreateManyCapture;
      withholdingCreateMany?: CreateManyCapture;
      patrimonialCreateMany?: CreateManyCapture;
      calculationCreate?: CalculationCreateCapture;
    } = {};

    const db = {
      taxParameterSet: model({ findUnique: async () => parameterSet }),
      taxArt94Bracket: model({ findMany: async () => fixture.taxParameters.brackets }),
      updateIndex: model({
        findMany: async () => fixture.taxParameters.indices,
        findFirst: async () => ({ monthIndex: 12, ipcValue: '7697.0515' }),
      }),
      salesInvoice: model({ createMany: async (args: unknown) => { captures.salesCreateMany = args as CreateManyCapture; } }),
      purchaseInvoice: model({ createMany: async (args: unknown) => { captures.purchasesCreateMany = args as CreateManyCapture; } }),
      fixedAsset: model(),
      inventoryValue: model(),
      bankAccountBalance: model(),
      cashHolding: model({ createMany: async (args: unknown) => { captures.cashCreateMany = args as CreateManyCapture; } }),
      receivableDebt: model({ createMany: async (args: unknown) => { captures.receivablesCreateMany = args as CreateManyCapture; } }),
      payableDebt: model({ createMany: async (args: unknown) => { captures.liabilitiesCreateMany = args as CreateManyCapture; } }),
      taxWithholding: model({ createMany: async (args: unknown) => { captures.withholdingCreateMany = args as CreateManyCapture; } }),
      personalAsset: model(),
      personalLiability: model(),
      patrimonialJustification: model({ createMany: async (args: unknown) => { captures.patrimonialCreateMany = args as CreateManyCapture; } }),
      axiDynamicItem: model(),
      calculationRun: model({ create: async (args: unknown) => { captures.calculationCreate = args as CalculationCreateCapture; } }),
      taxReturn: model(),
    };

    await persistTaxReturnDetails({
      db,
      taxReturnId: 'return-pilot',
      existingReturn: {
        taxParameterSetId: 'params-2025',
        fiscalYearId: 'fy-2025',
        status: 'Borrador',
        client: { name: 'Caso Piloto JABA', cuit: '20-00000000-0' },
        fiscalYear: { year: 2025 },
      },
      payload: {
        ...fixture.declarationData,
        taxParameterSetId: 'params-2025',
      },
    });

    expect(captures.salesCreateMany?.data[0]).toMatchObject({
      taxReturnId: 'return-pilot',
      invoiceNumber: '0003-00001529',
      customerName: 'Cliente Gravado SRL',
    });
    expect(captures.purchasesCreateMany?.data[0]).toMatchObject({
      taxReturnId: 'return-pilot',
      invoiceNumber: '0004-00000243',
      vendorName: 'Proveedor Insumos SRL',
    });
    expect(captures.cashCreateMany?.data[0]).toMatchObject({ currency: 'USD' });
    expect(captures.receivablesCreateMany?.data[0]).toMatchObject({ description: 'Clientes al cierre' });
    expect(captures.liabilitiesCreateMany?.data[0]).toMatchObject({ description: 'Proveedor local' });
    expect(captures.withholdingCreateMany?.data[0]).toMatchObject({
      cuitAgent: '30-70809010-9',
      certificateNumber: 'RET-2025-00012345',
    });
    expect(captures.patrimonialCreateMany?.data).toHaveLength(2);

    const snapshot = JSON.parse(captures.calculationCreate?.data.variablesSnapshot || '{}');
    expect(snapshot.taxParameterSetId).toBe('params-2025');
    expect(snapshot.cashHoldings[0].currency).toBe('USD');
    expect(snapshot.withholdings[0].certificateNumber).toBe('RET-2025-00012345');
    expect(snapshot.otherJustifications).toHaveLength(2);
  });
});
