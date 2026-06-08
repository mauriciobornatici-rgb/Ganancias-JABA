import { describe, expect, it } from 'vitest';
import {
  createSimpleAuthToken,
  getSimpleAuthConfig,
  isProtectedPath,
  verifySimpleAuthPassword,
  verifySimpleAuthToken,
} from '../auth/simpleAuth';
import { sanitizeSimpleAuthRedirectPath } from '../auth/redirect';

const authEnv = {
  AUTH_PASSWORD: 'ClaveSimple2026!',
  AUTH_SECRET: 'secret-local-de-prueba-con-largo-suficiente',
  NODE_ENV: 'production',
};

describe('simpleAuth', () => {
  it('usa password y secret configurados por entorno', () => {
    expect(getSimpleAuthConfig(authEnv)).toEqual({
      password: 'ClaveSimple2026!',
      secret: 'secret-local-de-prueba-con-largo-suficiente',
      isConfigured: true,
      isProduction: true,
    });
  });

  it('valida la clave correcta y rechaza claves incorrectas', () => {
    expect(verifySimpleAuthPassword('ClaveSimple2026!', authEnv)).toBe(true);
    expect(verifySimpleAuthPassword('otra-clave', authEnv)).toBe(false);
    expect(verifySimpleAuthPassword('', authEnv)).toBe(false);
  });

  it('firma tokens de sesion, rechaza manipulaciones y respeta expiracion', async () => {
    const now = 1_800_000_000;
    const token = await createSimpleAuthToken(authEnv, now);

    await expect(verifySimpleAuthToken(token, authEnv, now + 60)).resolves.toBe(true);
    await expect(verifySimpleAuthToken(`${token}x`, authEnv, now + 60)).resolves.toBe(false);
    await expect(verifySimpleAuthToken(token, authEnv, now + 60 * 60 * 13)).resolves.toBe(false);
  });

  it('protege la app y deja publicos login, auth y assets', () => {
    expect(isProtectedPath('/')).toBe(true);
    expect(isProtectedPath('/api/clientes')).toBe(true);
    expect(isProtectedPath('/declaraciones/123/wizard')).toBe(true);
    expect(isProtectedPath('/login')).toBe(false);
    expect(isProtectedPath('/api/auth/login')).toBe(false);
    expect(isProtectedPath('/api/auth/logout')).toBe(false);
    expect(isProtectedPath('/_next/static/app.js')).toBe(false);
    expect(isProtectedPath('/favicon.ico')).toBe(false);
  });

  it('sanitiza redirecciones del login para evitar destinos externos', () => {
    expect(sanitizeSimpleAuthRedirectPath('/declaraciones/abc?step=2')).toBe('/declaraciones/abc?step=2');
    expect(sanitizeSimpleAuthRedirectPath('/')).toBe('/');
    expect(sanitizeSimpleAuthRedirectPath(null)).toBe('/');
    expect(sanitizeSimpleAuthRedirectPath('https://example.com')).toBe('/');
    expect(sanitizeSimpleAuthRedirectPath('//example.com/login')).toBe('/');
    expect(sanitizeSimpleAuthRedirectPath('/\\example.com')).toBe('/');
  });
});
