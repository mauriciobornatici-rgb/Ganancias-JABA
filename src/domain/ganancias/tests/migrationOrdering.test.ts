import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('orden seguro de migraciones MariaDB', () => {
  it('crea el índice reemplazante antes de eliminar el requerido por la FK de clientId', () => {
    const migration = readFileSync(
      path.resolve('prisma/migrations/20260710193000_version_iibb_coefficients/migration.sql'),
      'utf8',
    );

    const createReplacement = migration.indexOf(
      'CREATE UNIQUE INDEX `ConventionCoefficientVersion_clientId_year_version_key`',
    );
    const dropHistorical = migration.indexOf(
      'DROP INDEX `ConventionCoefficientVersion_clientId_year_key`',
    );

    expect(createReplacement).toBeGreaterThanOrEqual(0);
    expect(dropHistorical).toBeGreaterThan(createReplacement);
  });
});
