import { NextRequest, NextResponse } from 'next/server';
import {
  SIMPLE_AUTH_COOKIE_NAME,
  isApiPath,
  isProtectedPath,
  getSimpleAuthConfig,
  verifySimpleAuthToken,
} from './src/domain/ganancias/auth/simpleAuth';

function buildLoginUrl(req: NextRequest): URL {
  const loginUrl = new URL('/login', req.url);
  const nextPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  loginUrl.searchParams.set('next', nextPath);
  return loginUrl;
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (!isProtectedPath(pathname)) {
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
    return NextResponse.next();
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
