import * as mariadb from 'mariadb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from '../../../../scripts/testDbConfig.mjs';

const shouldRunDockerValidation = process.env.RUN_DOCKER_DB_VALIDATION === '1';
const describeDocker = shouldRunDockerValidation ? describe : describe.skip;

function connectionConfig(databaseUrl: string) {
  const parsed = new URL(databaseUrl);

  return {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.slice(1)),
  };
}

describeDocker('Fiscal monthly ledger Docker seed', () => {
  let connection: Awaited<ReturnType<typeof mariadb.createConnection>>;

  beforeAll(async () => {
    connection = await mariadb.createConnection(connectionConfig(resolveTestDatabaseUrl()));
  });

  afterAll(async () => {
    await connection?.end();
  });

  it('seeds an ARBA local profile and a CM general profile with coefficients totaling one', async () => {
    const profiles = await connection.query(`
      SELECT c.cuit, p.grossIncomeRegime, p.conventionRegime
      FROM ClientTaxProfileVersion p
      INNER JOIN Client c ON c.id = p.clientId
      WHERE c.cuit IN ('27-95430211-3', '30-71451236-3')
        AND p.validFrom = (
          SELECT MIN(seedProfile.validFrom)
          FROM ClientTaxProfileVersion seedProfile
          WHERE seedProfile.clientId = p.clientId
        )
      ORDER BY c.cuit
    `);

    expect(profiles.map((profile: { cuit: string; grossIncomeRegime: string; conventionRegime: string }) => ({
      cuit: profile.cuit,
      grossIncomeRegime: profile.grossIncomeRegime,
      conventionRegime: profile.conventionRegime,
    }))).toEqual([
      {
        cuit: '27-95430211-3',
        grossIncomeRegime: 'ARBA_LOCAL',
        conventionRegime: 'NONE',
      },
      {
        cuit: '30-71451236-3',
        grossIncomeRegime: 'CM_REGIMEN_GENERAL',
        conventionRegime: 'GENERAL',
      },
    ]);

    const coefficients = await connection.query(`
      SELECT SUM(line.unifiedCoefficient) AS total
      FROM ConventionCoefficientVersion version
      INNER JOIN Client c ON c.id = version.clientId
      INNER JOIN ConventionCoefficientLine line ON line.coefficientVersionId = version.id
      WHERE c.cuit = '30-71451236-3' AND version.year = 2025
    `);

    expect(Number(coefficients[0].total)).toBeCloseTo(1, 10);
  });
});
