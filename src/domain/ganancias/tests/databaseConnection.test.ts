import { describe, expect, it } from 'vitest';
import {
  assertDatabaseEnvironmentSafety,
  buildMariaDbConnectionConfig,
  maskDatabaseUrl,
} from '../persistence/databaseConnection';

const vercelProductionEnv = {
  VERCEL: '1',
  VERCEL_ENV: 'production',
  VERCEL_GIT_COMMIT_REF: 'main',
};

describe('buildMariaDbConnectionConfig', () => {
  it('parsea una DATABASE_URL de Hostinger con caracteres especiales codificados', () => {
    const config = buildMariaDbConnectionConfig(
      'mysql://u669600172_jaba_app:p%40ss%3Aword%2F2026@sql123.hostinger.com:3306/u669600172_ganancias_jaba',
      vercelProductionEnv,
    );

    expect(config).toMatchObject({
      host: 'sql123.hostinger.com',
      port: 3306,
      user: 'u669600172_jaba_app',
      password: 'p@ss:word/2026',
      database: 'u669600172_ganancias_jaba',
      allowPublicKeyRetrieval: true,
    });
  });

  it('cierra conexiones ociosas antes del wait_timeout=20s de Hostinger para no bloquear la IP', () => {
    const config = buildMariaDbConnectionConfig(
      'mysql://user:pass@sql123.hostinger.com:3306/db'
    );

    // Guarda del incidente 2026-07-11: max_connect_errors=5 en Hostinger bloquea la IP de Vercel
    // si el pool reusa conexiones que el servidor ya mato (wait_timeout=20).
    expect(config.idleTimeout).toBeLessThan(20);
    // Debe ser MENOR que connectionLimit (si son iguales el pool nunca libera ociosas)
    // y MAYOR que 0 (con 0 el adapter de Prisma se queda sin conexiones: "pool is closed").
    expect(config.minimumIdle).toBeGreaterThan(0);
    expect(config.minimumIdle).toBeLessThan(config.connectionLimit);
    expect(config.connectionLimit).toBeLessThanOrEqual(5);
  });

  it('usa puerto 3306 por defecto cuando la URL no lo informa', () => {
    const config = buildMariaDbConnectionConfig(
      'mariadb://u669600172_jaba_app:secret@sql123.hostinger.com/u669600172_ganancias_jaba',
      vercelProductionEnv,
    );

    expect(config.port).toBe(3306);
  });

  it('falla explicitamente si DATABASE_URL no esta configurada', () => {
    expect(() => buildMariaDbConnectionConfig('')).toThrow('DATABASE_URL');
  });

  it('falla explicitamente si el protocolo no es MySQL/MariaDB', () => {
    expect(() => buildMariaDbConnectionConfig('postgresql://user:pass@localhost:5432/db')).toThrow('mysql');
  });
});

describe('assertDatabaseEnvironmentSafety', () => {
  const productionUrl = 'mysql://user:pass@srv1199.hstgr.io:3306/u669600172_ganancias_jaba';
  const testUrl = 'mysql://jaba_test:jaba_test_pass@127.0.0.1:3317/ganancias_jaba_test';

  it('bloquea la base productiva desde desarrollo local', () => {
    expect(() => assertDatabaseEnvironmentSafety(productionUrl, { NODE_ENV: 'development' }))
      .toThrow('CONEXIÃ“N BLOQUEADA');
  });

  it('bloquea la base productiva desde test y Preview aunque exista la antigua bandera de excepcion', () => {
    expect(() => assertDatabaseEnvironmentSafety(productionUrl, {
      APP_ENV: 'test-db',
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      ALLOW_PRODUCTION_DATABASE_OUTSIDE_PRODUCTION: 'true',
    })).toThrow('CONEXIÃ“N BLOQUEADA');
  });

  it('permite la base productiva solamente en Vercel Production desde main', () => {
    expect(() => assertDatabaseEnvironmentSafety(productionUrl, vercelProductionEnv)).not.toThrow();
  });

  it('permite la base Docker aislada en desarrollo y test', () => {
    expect(() => assertDatabaseEnvironmentSafety(testUrl, {
      NODE_ENV: 'development',
      APP_ENV: 'test-db',
    })).not.toThrow();
  });

  it('rechaza cualquier otra base cuando APP_ENV declara un entorno de prueba', () => {
    expect(() => assertDatabaseEnvironmentSafety(
      'mysql://user:pass@127.0.0.1:3306/otra_base',
      { APP_ENV: 'test-db' },
    )).toThrow('ganancias_jaba_test');
  });
});

describe('maskDatabaseUrl', () => {
  it('oculta la contrasena y conserva host/base para diagnostico', () => {
    expect(maskDatabaseUrl(
      'mysql://u669600172_jaba_app:p%40ss%3Aword%2F2026@sql123.hostinger.com:3306/u669600172_ganancias_jaba'
    )).toBe('mysql://u669600172_jaba_app:***@sql123.hostinger.com:3306/u669600172_ganancias_jaba');
  });

  it('devuelve marcador seguro cuando la URL no existe', () => {
    expect(maskDatabaseUrl('')).toBe('[DATABASE_URL no configurada]');
  });
});
