import { NextRequest, NextResponse } from 'next/server';
import {
  SIMPLE_AUTH_COOKIE_NAME,
  SIMPLE_AUTH_TTL_SECONDS,
  createSimpleAuthToken,
  getSimpleAuthConfig,
  verifySimpleAuthPassword,
} from '@/domain/ganancias/auth/simpleAuth';

export async function POST(req: NextRequest) {
  const config = getSimpleAuthConfig();
  if (!config.isConfigured) {
    return NextResponse.json(
      { success: false, error: 'Autenticacion no configurada. Definir AUTH_PASSWORD y AUTH_SECRET.' },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';
  if (!verifySimpleAuthPassword(password)) {
    return NextResponse.json(
      { success: false, error: 'Clave incorrecta.' },
      { status: 401 },
    );
  }

  const token = await createSimpleAuthToken();
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: SIMPLE_AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: SIMPLE_AUTH_TTL_SECONDS,
  });
  return response;
}
