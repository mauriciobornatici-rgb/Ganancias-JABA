import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from '../../../../scripts/testDbConfig.mjs';
import { PrismaClient } from '../../../generated/client/client';
import { buildMariaDbConnectionConfig } from '../persistence/databaseConnection';
import { persistTaxReturnDetails } from '../persistence/taxReturnDetailsPersistence';

const TEST_DATABASE_URL = resolveTestDatabaseUrl();
const TEST_CLIENT_CUITS = ['20-00000001-0', '20-00000002-0'];
const shouldRunDockerValidation = process.env.RUN_DOCKER_DB_VALIDATION === '1';
const describeDocker = shouldRunDockerValidation ? describe : describe.skip;

describeDocker('FixedAsset identity persistence against Docker', () => {
  let prisma: PrismaClient;

  async function cleanupTestClients() {
    await prisma.client.deleteMany({ where: { cuit: { in: TEST_CLIENT_CUITS } } });
  }

  beforeAll(async () => {
    expect(process.env.DATABASE_URL).toBe(TEST_DATABASE_URL);
    prisma = new PrismaClient({
      adapter: new PrismaMariaDb(buildMariaDbConnectionConfig()),
      log: ['error'],
    });
    await cleanupTestClients();
  });

  afterAll(async () => {
    await cleanupTestClients();
    await prisma?.$disconnect();
  });

  it('guarda dos veces una DDJJ legada aunque asset-1 pertenezca a otra DDJJ', async () => {
    const fiscalYear = await prisma.fiscalYear.findUnique({ where: { year: 2025 } });
    expect(fiscalYear).not.toBeNull();

    const parameterSet = await prisma.taxParameterSet.findFirst({
      where: { fiscalYearId: fiscalYear!.id },
      orderBy: { version: 'desc' },
    });
    expect(parameterSet).not.toBeNull();

    const [ownerClient, currentClient] = await Promise.all(TEST_CLIENT_CUITS.map((cuit, index) => (
      prisma.client.create({
        data: {
          cuit,
          name: index === 0 ? 'Titular del ID legado' : 'DDJJ que recupera el borrador',
          type: 'Persona Humana',
          fiscalCondition: 'Responsable Inscripto',
          mainActivity: 'Regresion bienes de uso',
          status: 'Activo',
        },
      })
    )));

    const [ownerReturn, currentReturn] = await Promise.all([
      prisma.taxReturn.create({
        data: {
          clientId: ownerClient.id,
          fiscalYearId: fiscalYear!.id,
          taxParameterSetId: parameterSet!.id,
          status: 'Borrador',
          version: 0,
        },
      }),
      prisma.taxReturn.create({
        data: {
          clientId: currentClient.id,
          fiscalYearId: fiscalYear!.id,
          taxParameterSetId: parameterSet!.id,
          status: 'Borrador',
          version: 0,
        },
      }),
    ]);

    await prisma.fixedAsset.create({
      data: {
        id: 'asset-1',
        taxReturnId: ownerReturn.id,
        name: 'Bien de la primera DDJJ',
        type: 'Equipamiento',
        purchaseDate: new Date('2025-01-01T00:00:00.000Z'),
        originalCost: 100,
        usefulLife: 10,
        yearsElapsed: 0,
        customReexpIndex: 1,
        annualDepreciationHist: 10,
        annualDepreciationAdj: 10,
        residualValueHist: 90,
        residualValueAdj: 90,
      },
    });

    const payload = {
      fiscalYear: 2025,
      taxParameterSetId: parameterSet!.id,
      fixedAssets: [{
        id: 'asset-1',
        name: 'Bien recuperado desde copia local',
        type: 'Equipamiento',
        purchaseDate: '2025-01-01',
        originalCost: '100000',
        usefulLife: 10,
        yearsElapsed: 0,
        customReexpIndex: '1',
      }],
    };
    const persistCurrentReturn = () => prisma.$transaction(async tx => {
      await persistTaxReturnDetails({
        db: tx,
        taxReturnId: currentReturn.id,
        existingReturn: {
          ...currentReturn,
          client: currentClient,
          fiscalYear: fiscalYear!,
        },
        payload,
      });
    }, { timeout: 20000 });

    await persistCurrentReturn();
    const firstSave = await prisma.fixedAsset.findMany({ where: { taxReturnId: currentReturn.id } });
    expect(firstSave).toHaveLength(1);
    expect(firstSave[0].id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(firstSave[0].id).not.toBe('asset-1');
    expect(firstSave[0].name).toBe('Bien recuperado desde copia local');

    await persistCurrentReturn();
    const secondSave = await prisma.fixedAsset.findMany({ where: { taxReturnId: currentReturn.id } });
    expect(secondSave).toHaveLength(1);
    expect(secondSave[0].id).toBe(firstSave[0].id);

    const originalOwnerAsset = await prisma.fixedAsset.findUnique({ where: { id: 'asset-1' } });
    expect(originalOwnerAsset?.taxReturnId).toBe(ownerReturn.id);
  });
});
