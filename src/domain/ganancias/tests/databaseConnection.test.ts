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
