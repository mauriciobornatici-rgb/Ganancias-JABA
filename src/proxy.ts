import { NextRequest, NextResponse } from 'next/server';
import {
  SIMPLE_AUTH_COOKIE_NAME,
  SIMPLE_AUTH_TTL_SECONDS,
  createSimpleAuthToken,
  isApiPath,
  isAuthorizedHealthToken,
  isProtectedPath,
  getSimpleAuthConfig,
  shouldRenewSimpleAuthToken,
  verifySimpleAuthToken,
} from './domain/ganancias/auth/simpleAuth';

// Convencion Next 16: este archivo reemplaza a middleware.ts y la funcion debe llamarse `proxy`
// (next/dist/build/templates/middleware.js: `(isProxy ? mod.proxy : mod.middleware) || mod.default`).
// Con estructura `src/app`, DEBE vivir en `src/proxy.ts`; en la raiz Next lo ignora en silencio
// (causa del incidente de seguridad del 2026-06-10). Ver middlewareLocation.test.ts.

function buildLoginUrl(req: NextRequest): URL {
  const loginUrl = new URL('/login', req.url);
  const nextPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  loginUrl.searchParams.set('next', nextPath);
  return loginUrl;
}

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  // P31.5: monitoreo externo de salud con token dedicado (sin sesion de usuario).
  if (pathname === '/api/health' && isAuthorizedHealthToken(req.headers.get('x-health-token'))) {
    return NextResponse.next();
  }

  const config = getSimpleAuthConfig();
  if (!config.isConfigured) {
    if (isApiPath(pathname)) {
      return NextResponse.json(
        { success: false, error: 'Autenticacion no configurada. Definir AUTH_PASSWORD y AUTH_SECRET.' },
        { status: 503 },
      );
    }

    const loginUrl = buildLoginUrl(req);
    loginUrl.searchParams.set('setup', '1');
    return NextResponse.redirect(loginUrl);
  }

  const token = req.cookies.get(SIMPLE_AUTH_COOKIE_NAME)?.value;
  const isAuthenticated = await verifySimpleAuthToken(token);
  if (isAuthenticated) {
    const response = NextResponse.next();

    // P31.8: renovacion deslizante de sesion. Si el token ya consumio mas de la mitad
    // de sus 12 hs, se reemite con la actividad para no cortar una carga larga.
    if (shouldRenewSimpleAuthToken(token)) {
      const renewedToken = await createSimpleAuthToken();
      response.cookies.set({
        name: SIMPLE_AUTH_COOKIE_NAME,
        value: renewedToken,
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProduction,
        path: '/',
        maxAge: SIMPLE_AUTH_TTL_SECONDS,
      });
    }

    return response;
  }

  if (isApiPath(pathname)) {
    return NextResponse.json(
      { success: false, error: 'Sesion no autenticada.' },
      { status: 401 },
    );
  }

  return NextResponse.redirect(buildLoginUrl(req));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
