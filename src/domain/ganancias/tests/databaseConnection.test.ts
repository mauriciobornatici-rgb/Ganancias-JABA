import { describe, expect, it } from 'vitest';
import {
  buildMariaDbConnectionConfig,
  maskDatabaseUrl,
} from '../persistence/databaseConnection';

describe('buildMariaDbConnectionConfig', () => {
  it('parsea una DATABASE_URL de Hostinger con caracteres especiales codificados', () => {
    const config = buildMariaDbConnectionConfig(
      'mysql://u669600172_jaba_app:p%40ss%3Aword%2F2026@sql123.hostinger.com:3306/u669600172_ganancias_jaba'
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
      'mariadb://u669600172_jaba_app:secret@sql123.hostinger.com/u669600172_ganancias_jaba'
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
