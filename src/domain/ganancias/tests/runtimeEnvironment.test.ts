import { describe, expect, it } from 'vitest';
import { getRuntimeEnvironmentNotice } from '../environment/runtimeEnvironment';

describe('getRuntimeEnvironmentNotice', () => {
  it('identifica claramente la base Docker de prueba', () => {
    expect(getRuntimeEnvironmentNotice({ APP_ENV: 'test-db', NODE_ENV: 'development' }))
      .toEqual({
        label: 'ENTORNO DE PRUEBA',
        detail: 'Base Docker aislada: los datos no afectan producción.',
      });
  });

  it('los textos del cartel no tienen acentos mal codificados (mojibake)', () => {
    for (const env of [{ APP_ENV: 'test-db' }, { VERCEL_ENV: 'preview' }, { NODE_ENV: 'development' }]) {
      const notice = getRuntimeEnvironmentNotice(env);
      expect(`${notice?.label} ${notice?.detail}`).not.toMatch(/Ã|â€/);
    }
  });

  it('identifica un Preview como entorno no productivo', () => {
    expect(getRuntimeEnvironmentNotice({ VERCEL_ENV: 'preview', NODE_ENV: 'production' })?.label)
      .toBe('PREVIEW DE PRUEBA');
  });

  it('no muestra advertencia en Vercel Production', () => {
    expect(getRuntimeEnvironmentNotice({ VERCEL_ENV: 'production', NODE_ENV: 'production' }))
      .toBeNull();
  });
});
