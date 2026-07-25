import { describe, expect, it } from 'vitest';
import { buildProdMigrationPlan, maskDatabaseUrl } from '../../../../scripts/run-prod-migration.mjs';

/**
 * `npm run db:prod:migrate` es el único camino habilitado para migrar producción desde una terminal
 * local. Estos tests fijan las condiciones: sin intención explícita no corre, y nunca sirve para
 * otra base que la productiva.
 */
const PROD_URL = 'mysql://usuario:secreta@srv1199.hstgr.io:3306/u669600172_ganancias_jaba';
const TEST_URL = 'mysql://jaba_test:jaba_test_pass@127.0.0.1:3317/ganancias_jaba_test';

describe('buildProdMigrationPlan', () => {
  it('exige DATABASE_URL', () => {
    const plan = buildProdMigrationPlan({});
    expect(plan.ok).toBe(false);
    expect(plan.error).toContain('Falta DATABASE_URL');
  });

  it('rechaza una DATABASE_URL invalida', () => {
    const plan = buildProdMigrationPlan({ DATABASE_URL: 'no-es-una-url', CONFIRM_PROD_MIGRATION: '1' });
    expect(plan.ok).toBe(false);
    expect(plan.error).toContain('no es una URL valida');
  });

  it('no sirve para la base de Docker: manda a db:test:migrate', () => {
    const plan = buildProdMigrationPlan({ DATABASE_URL: TEST_URL, CONFIRM_PROD_MIGRATION: '1' });
    expect(plan.ok).toBe(false);
    expect(plan.error).toContain('db:test:migrate');
  });

  it('rechaza el nombre productivo apuntando a localhost', () => {
    const plan = buildProdMigrationPlan({
      DATABASE_URL: 'mysql://u:p@127.0.0.1:3306/u669600172_ganancias_jaba',
      CONFIRM_PROD_MIGRATION: '1',
    });
    expect(plan.ok).toBe(false);
    expect(plan.error).toContain('Revise el destino');
  });

  it('sin CONFIRM_PROD_MIGRATION=1 no corre (y recuerda el backup)', () => {
    const plan = buildProdMigrationPlan({ DATABASE_URL: PROD_URL });
    expect(plan.ok).toBe(false);
    expect(plan.error).toContain('backup');

    const flojo = buildProdMigrationPlan({ DATABASE_URL: PROD_URL, CONFIRM_PROD_MIGRATION: 'true' });
    expect(flojo.ok).toBe(false);
  });

  it('con destino productivo y confirmacion explicita habilita la excepcion NOMBRADA de la guarda', () => {
    const plan = buildProdMigrationPlan({ DATABASE_URL: PROD_URL, CONFIRM_PROD_MIGRATION: '1' });
    expect(plan.ok).toBe(true);
    expect(plan.databaseName).toBe('u669600172_ganancias_jaba');
    const env: Record<string, string> = plan.env ?? {};
    expect(env.PRISMA_ALLOW_PRODUCTION_MIGRATION).toBe('u669600172_ganancias_jaba');
    // APP_ENV=test-db exigiria Docker: se limpia para no chocar con la guarda.
    expect(env.APP_ENV).toBe('');
  });

  it('respeta PRODUCTION_DATABASE_NAME cuando la base productiva es otra', () => {
    const plan = buildProdMigrationPlan({
      DATABASE_URL: 'mysql://u:p@srv1199.hstgr.io:3306/otra_prod',
      PRODUCTION_DATABASE_NAME: 'otra_prod',
      CONFIRM_PROD_MIGRATION: '1',
    });
    expect(plan.ok).toBe(true);
    const env: Record<string, string> = plan.env ?? {};
    expect(env.PRISMA_ALLOW_PRODUCTION_MIGRATION).toBe('otra_prod');
  });
});

describe('maskDatabaseUrl', () => {
  it('nunca muestra la password', () => {
    const masked = maskDatabaseUrl(PROD_URL);
    expect(masked).toBe('mysql://usuario:***@srv1199.hstgr.io:3306/u669600172_ganancias_jaba');
    expect(masked).not.toContain('secreta');
  });

  it('tolera una URL invalida sin explotar', () => {
    expect(maskDatabaseUrl('no-es-una-url')).toContain('invalida');
  });
});
