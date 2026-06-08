import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../../generated/client/client';
import { buildExcelCaptureCaseFixture } from '../fixtures/excelCaptureCaseFixture';
import { buildUsefulCoefficientsFromIndexes } from '../mappers/taxParameterUsefulCoefficients';
import { buildMariaDbConnectionConfig } from '../persistence/databaseConnection';
import { persistTaxReturnDetails } from '../persistence/taxReturnDetailsPersistence';
import {
  mapAxiStaticItemsForWizard,
  mapPatrimonialJustificationForWizard,
} from '../persistence/taxReturnReadMapper';

const TEST_DATABASE_URL = 'mysql://jaba_test:jaba_test_pass@127.0.0.1:3317/ganancias_jaba_test';
const shouldRunDockerValidation = process.env.RUN_DOCKER_DB_VALIDATION === '1';
const describeDocker = shouldRunDockerValidation ? describe : describe.skip;

function assertTestDatabaseUrl() {
  expect(process.env.DATABASE_URL).toBe(TEST_DATABASE_URL);
}

function decimalNumber(value: unknown): number {
  if (value && typeof value === 'object' && 'toString' in value) {
    return Number(value.toString());
  }

  return Number(value);
}

function rounded(value: unknown): number {
  return Math.round(decimalNumber(value));
}

function monthName(monthIndex: number): string {
  return [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ][monthIndex - 1] || `Mes ${monthIndex}`;
}

describeDocker('P19 - validacion caso Excel/capturas contra Docker', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    assertTestDatabaseUrl();
    prisma = new PrismaClient({
      adapter: new PrismaMariaDb(buildMariaDbConnectionConfig()),
      log: ['error'],
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('guarda, recalcula y reabre el caso Lobato 2024 con los totales esperados', async () => {
    const { declarationData, taxParameters, expected } = buildExcelCaptureCaseFixture();
    const fiscalYear2023 = await prisma.fiscalYear.upsert({
      where: { year: 2023 },
      create: { year: 2023, isEnabled: true },
      update: { isEnabled: true },
    });
    const fiscalYear2024 = await prisma.fiscalYear.upsert({
      where: { year: 2024 },
      create: { year: 2024, isEnabled: true },
      update: { isEnabled: true },
    });

    const client = await prisma.client.upsert({
      where: { cuit: declarationData.cuit },
      create: {
        cuit: declarationData.cuit,
        name: declarationData.clientName,
        type: 'Persona Humana',
        fiscalCondition: 'Responsable Inscripto',
        mainActivity: 'Caso P19 Docker',
        status: 'Activo',
      },
      update: {
        name: declarationData.clientName,
        status: 'Activo',
      },
    });

    const parameterSet = await prisma.taxParameterSet.upsert({
      where: {
        fiscalYearId_version: {
          fiscalYearId: fiscalYear2024.id,
          version: 1,
        },
      },
      create: {
        fiscalYearId: fiscalYear2024.id,
        ...taxParameters.parameterSet,
        status: 'validado',
        sourceLaw: 'Fixture P19 Excel/capturas 2024',
        version: 1,
      },
      update: {
        ...taxParameters.parameterSet,
        status: 'validado',
        sourceLaw: 'Fixture P19 Excel/capturas 2024',
      },
    });

    await prisma.taxArt94Bracket.deleteMany({ where: { fiscalYearId: fiscalYear2024.id } });

    await prisma.updateIndex.upsert({
      where: {
        fiscalYearId_monthIndex: {
          fiscalYearId: fiscalYear2023.id,
          monthIndex: taxParameters.previousDecemberIndex.monthIndex,
        },
      },
      create: {
        fiscalYearId: fiscalYear2023.id,
        monthIndex: taxParameters.previousDecemberIndex.monthIndex,
        monthName: 'Diciembre',
        ipcValue: taxParameters.previousDecemberIndex.ipcValue,
      },
      update: {
        monthName: 'Diciembre',
        ipcValue: taxParameters.previousDecemberIndex.ipcValue,
      },
    });

    for (const index of taxParameters.indices) {
      await prisma.updateIndex.upsert({
        where: {
          fiscalYearId_monthIndex: {
            fiscalYearId: fiscalYear2024.id,
            monthIndex: index.monthIndex,
          },
        },
        create: {
          fiscalYearId: fiscalYear2024.id,
          monthIndex: index.monthIndex,
          monthName: monthName(index.monthIndex),
          ipcValue: index.ipcValue,
        },
        update: {
          monthName: monthName(index.monthIndex),
          ipcValue: index.ipcValue,
        },
      });
    }

    await prisma.taxReturn.deleteMany({
      where: {
        clientId: client.id,
        fiscalYearId: fiscalYear2024.id,
        version: 0,
      },
    });

    const taxReturn = await prisma.taxReturn.create({
      data: {
        clientId: client.id,
        fiscalYearId: fiscalYear2024.id,
        taxParameterSetId: parameterSet.id,
        status: 'Borrador',
        version: 0,
      },
    });

    await prisma.$transaction(async (tx) => {
      await persistTaxReturnDetails({
        db: tx,
        taxReturnId: taxReturn.id,
        existingReturn: {
          ...taxReturn,
          client,
          fiscalYear: fiscalYear2024,
        },
        payload: {
          ...declarationData,
          taxParameterSetId: parameterSet.id,
        },
      });
    }, { timeout: 20000 });

    const reloaded = await prisma.taxReturn.findUnique({
      where: { id: taxReturn.id },
      include: {
        client: true,
        fiscalYear: true,
        sales: true,
        purchases: true,
        inventory: true,
        bankAccounts: true,
        receivables: true,
        liabilities: true,
        personalAssets: true,
        personalLiabilities: true,
        justifications: true,
        generalDeduction: true,
        personalDeduction: true,
        axiStaticItems: true,
        calculations: {
          orderBy: { runDate: 'desc' },
          take: 1,
        },
      },
    });

    expect(reloaded).not.toBeNull();
    expect(reloaded?.client.cuit).toBe('20-34590216-4');
    expect(reloaded?.fiscalYear.year).toBe(2024);
    expect(reloaded?.sales).toHaveLength(1);
    expect(reloaded?.purchases).toHaveLength(3);
    expect(reloaded?.inventory).toHaveLength(1);
    expect(reloaded?.bankAccounts).toHaveLength(1);
    expect(reloaded?.receivables).toHaveLength(2);
    expect(reloaded?.liabilities).toHaveLength(1);
    expect(reloaded?.personalAssets).toHaveLength(2);
    expect(reloaded?.personalLiabilities).toHaveLength(1);
    expect(reloaded?.justifications).toHaveLength(3);
    expect(reloaded?.generalDeduction).not.toBeNull();
    expect(reloaded?.personalDeduction).not.toBeNull();
    expect(reloaded?.axiStaticItems).toHaveLength(4);

    const latestCalculation = reloaded?.calculations[0];
    expect(rounded(latestCalculation?.resultThirdCategory)).toBe(expected.resultadoComercialNeto);
    expect(rounded(latestCalculation?.impositiveResultNet)).toBe(expected.resultadoImpositivoNeto);
    expect(rounded(latestCalculation?.axiStaticResult)).toBe(expected.axiStaticResult);
    expect(rounded(latestCalculation?.axiDynamicResult)).toBe(expected.axiDynamicResult);
    expect(rounded(latestCalculation?.axiNetAdjustment)).toBe(expected.resultadoAjustePorInflacion);
    expect(rounded(latestCalculation?.computedConsumo)).toBe(expected.consumoDiferencial);
    expect(rounded(latestCalculation?.justificationDiff)).toBe(expected.jvpJustificationDiff);

    const snapshot = JSON.parse(latestCalculation?.variablesSnapshot || '{}');
    expect(snapshot.currentStep).toBe(6);
    expect(snapshot.sales[0].netAmount).toBe('55188790.74');
    expect(snapshot.purchases).toHaveLength(3);
    expect(snapshot.generalDeductions.autonomos).toBe('0');
    expect(snapshot.otherJustifications).toHaveLength(3);
    expect(snapshot.axiStaticBreakdown.activo.deudoresVentas.total).toBe('1021370.64');

    const reopenedAxiStaticBreakdown = mapAxiStaticItemsForWizard(reloaded?.axiStaticItems || []);
    expect(Number(reopenedAxiStaticBreakdown?.activo.disponibilidadesBancos.total)).toBeCloseTo(580157);
    expect(Number(reopenedAxiStaticBreakdown?.activo.deudoresVentas.computable)).toBeCloseTo(1021370.64);
    expect(Number(reopenedAxiStaticBreakdown?.pasivo.deudasComerciales.total)).toBeCloseTo(1565731.18);
    const reopenedJustifications = new Map(
      (reloaded?.justifications || [])
        .map(mapPatrimonialJustificationForWizard)
        .map(item => [item.concept, item])
    );
    expect(reopenedJustifications.get('Intereses prestamo')?.column).toBe(1);
    expect(Number(reopenedJustifications.get('Intereses prestamo')?.amount)).toBeCloseTo(956882.98);
    expect(reopenedJustifications.get('Impuesto determinado anio anterior')?.column).toBe(1);
    expect(Number(reopenedJustifications.get('Impuesto determinado anio anterior')?.amount)).toBeCloseTo(392146.90);
    expect(reopenedJustifications.get('Blanqueo')?.column).toBe(2);
    expect(Number(reopenedJustifications.get('Blanqueo')?.amount)).toBeCloseTo(3300000.00);

    const usefulCoefficients = buildUsefulCoefficientsFromIndexes(
      taxParameters.indices,
      taxParameters.previousDecemberIndex
    );
    expect(usefulCoefficients.decPreviousToDecCurrent?.toDecimalPlaces(6).toString()).toBe('2.177634');
  });
});
