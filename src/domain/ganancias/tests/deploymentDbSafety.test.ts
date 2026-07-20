import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type DeploymentDbSafetyResult = {
  ok: boolean;
  severity: 'safe' | 'blocked';
  message: string;
};

type DeploymentDbSafetyModule = {
  evaluateDeploymentDatabaseSafety: (env: Record<string, string | undefined>) => DeploymentDbSafetyResult;
};

const loadSafetyModule = async () => {
  const moduleUrl = pathToFileURL(join(process.cwd(), 'scripts/check-deployment-db-safety.mjs')).href;
  return await import(moduleUrl) as DeploymentDbSafetyModule;
};

const productionDatabaseUrl = 'mysql://user:placeholder@srv1199.hstgr.io:3306/u669600172_ganancias_jaba';
const stagingDatabaseUrl = 'mysql://user:placeholder@srv1199.hstgr.io:3306/u669600172_ganancias_jaba_staging';

describe('evaluateDeploymentDatabaseSafety', () => {
  it('bloquea desarrollo local si apunta a la base productiva', async () => {
    const { evaluateDeploymentDatabaseSafety } = await loadSafetyModule();

    const result = evaluateDeploymentDatabaseSafety({
      DATABASE_URL: productionDatabaseUrl,
    });

    expect(result.ok).toBe(false);
    expect(result.severity).toBe('blocked');
    expect(result.message).toContain('entorno local');
  });

  it('bloquea Vercel Production si falta DATABASE_URL', async () => {
    const { evaluateDeploymentDatabaseSafety } = await loadSafetyModule();

    const result = evaluateDeploymentDatabaseSafety({
      VERCEL: '1',
      VERCEL_ENV: 'production',
      VERCEL_GIT_COMMIT_REF: 'main',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('DATABASE_URL');
  });

  it('permite Vercel Production desde main con DATABASE_URL configurada', async () => {
    const { evaluateDeploymentDatabaseSafety } = await loadSafetyModule();

    const result = evaluateDeploymentDatabaseSafety({
      VERCEL: '1',
      VERCEL_ENV: 'production',
      VERCEL_GIT_COMMIT_REF: 'main',
      DATABASE_URL: productionDatabaseUrl,
      AUTH_PASSWORD: 'ClaveProduccionSegura!',
      AUTH_SECRET: 'secreto-largo-produccion-para-firmar-sesion',
    });

    expect(result.ok).toBe(true);
  });

  it('bloquea Vercel Production si falta la configuracion de autenticacion', async () => {
    const { evaluateDeploymentDatabaseSafety } = await loadSafetyModule();

    const result = evaluateDeploymentDatabaseSafety({
      VERCEL: '1',
      VERCEL_ENV: 'production',
      VERCEL_GIT_COMMIT_REF: 'main',
      DATABASE_URL: productionDatabaseUrl,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('AUTH_PASSWORD');
    expect(result.message).toContain('AUTH_SECRET');
  });

  it('permite Preview sin DATABASE_URL para evitar tocar la base real', async () => {
    const { evaluateDeploymentDatabaseSafety } = await loadSafetyModule();

    const result = evaluateDeploymentDatabaseSafety({
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_REF: 'staging',
    });

    expect(result.ok).toBe(true);
  });

  it('bloquea Preview si apunta a la base productiva de Hostinger', async () => {
    const { evaluateDeploymentDatabaseSafety } = await loadSafetyModule();

    const result = evaluateDeploymentDatabaseSafety({
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_REF: 'staging',
      DATABASE_URL: productionDatabaseUrl,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('base productiva');
  });

  it('permite Preview con una base staging separada', async () => {
    const { evaluateDeploymentDatabaseSafety } = await loadSafetyModule();

    const result = evaluateDeploymentDatabaseSafety({
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_REF: 'staging',
      DATABASE_URL: stagingDatabaseUrl,
    });

    expect(result.ok).toBe(true);
  });

  it('no permite excepciones de Preview hacia la base productiva', async () => {
    const { evaluateDeploymentDatabaseSafety } = await loadSafetyModule();

    const result = evaluateDeploymentDatabaseSafety({
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_REF: 'staging',
      DATABASE_URL: productionDatabaseUrl,
      ALLOW_PRODUCTION_DATABASE_OUTSIDE_PRODUCTION: 'true',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('base productiva');
  });

  it('permite desarrollo local con la base Docker aislada', async () => {
    const { evaluateDeploymentDatabaseSafety } = await loadSafetyModule();

    const result = evaluateDeploymentDatabaseSafety({
      DATABASE_URL: 'mysql://jaba_test:jaba_test_pass@127.0.0.1:3317/ganancias_jaba_test',
      APP_ENV: 'test-db',
    });

    expect(result.ok).toBe(true);
    expect(result.severity).toBe('safe');
  });
});
