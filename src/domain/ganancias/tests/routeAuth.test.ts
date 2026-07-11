import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { requireRouteAuth } from '../auth/routeAuth';
import { createSimpleAuthToken, SIMPLE_AUTH_COOKIE_NAME } from '../auth/simpleAuth';

const originalPassword = process.env.AUTH_PASSWORD;
const originalSecret = process.env.AUTH_SECRET;

afterEach(() => {
  if (originalPassword === undefined) delete process.env.AUTH_PASSWORD;
  else process.env.AUTH_PASSWORD = originalPassword;
  if (originalSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalSecret;
});

describe('requireRouteAuth', () => {
  it('rechaza una mutación sin cookie de sesión', async () => {
    process.env.AUTH_PASSWORD = 'test-password';
    process.env.AUTH_SECRET = 'test-secret-with-enough-entropy';
    const response = await requireRouteAuth(new NextRequest('http://localhost/api/declaraciones', { method: 'POST' }));
    expect(response?.status).toBe(401);
  });

  it('acepta una sesión firmada válida', async () => {
    process.env.AUTH_PASSWORD = 'test-password';
    process.env.AUTH_SECRET = 'test-secret-with-enough-entropy';
    const token = await createSimpleAuthToken();
    const request = new NextRequest('http://localhost/api/declaraciones', {
      method: 'POST',
      headers: { cookie: `${SIMPLE_AUTH_COOKIE_NAME}=${token}` },
    });
    expect(await requireRouteAuth(request)).toBeNull();
  });
});
