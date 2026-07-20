import { describe, expect, it } from 'vitest';
import { assertPrismaDatabaseSafety } from '../../../../scripts/prismaDatabaseSafety';

describe('assertPrismaDatabaseSafety', () => {
  const productionUrl = 'mysql://user:pass@srv1199.hstgr.io:3306/u669600172_ganancias_jaba';
  const testUrl = 'mysql://jaba_test:jaba_test_pass@127.0.0.1:3317/ganancias_jaba_test';

  it('bloquea comandos Prisma locales contra producciÃ³n', () => {
    expect(() => assertPrismaDatabaseSafety({ DATABASE_URL: productionUrl }))
      .toThrow('PRISMA BLOQUEADO');
  });

  it('bloquea el antiguo bypass fuera de Vercel Production', () => {
    expect(() => assertPrismaDatabaseSafety({
      DATABASE_URL: productionUrl,
      ALLOW_PRODUCTION_DATABASE_OUTSIDE_PRODUCTION: 'true',
    })).toThrow('PRISMA BLOQUEADO');
  });

  it('permite Prisma productivo Ãºnicamente en Vercel Production/main', () => {
    expect(() => assertPrismaDatabaseSafety({
      DATABASE_URL: productionUrl,
      VERCEL: '1',
      VERCEL_ENV: 'production',
      VERCEL_GIT_COMMIT_REF: 'main',
    })).not.toThrow();
  });

  it('permite los comandos Docker del runner', () => {
    expect(() => assertPrismaDatabaseSafety({ DATABASE_URL: testUrl, APP_ENV: 'test-db' }))
      .not.toThrow();
  });
});
