import { NextRequest, NextResponse } from 'next/server';
import {
  SIMPLE_AUTH_COOKIE_NAME,
  getSimpleAuthConfig,
  verifySimpleAuthToken,
} from './simpleAuth';

/** Defensa en profundidad para Route Handlers que modifican información fiscal. */
export async function requireRouteAuth(request: NextRequest): Promise<NextResponse | null> {
  const config = getSimpleAuthConfig();
  if (!config.isConfigured) {
    return NextResponse.json(
      { success: false, error: 'Autenticación no configurada.' },
      { status: 503 },
    );
  }

  const token = request.cookies.get(SIMPLE_AUTH_COOKIE_NAME)?.value;
  if (!(await verifySimpleAuthToken(token))) {
    return NextResponse.json(
      { success: false, error: 'Sesión no autenticada.' },
      { status: 401 },
    );
  }
  return null;
}
