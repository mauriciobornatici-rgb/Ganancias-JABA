import { NextRequest, NextResponse } from 'next/server';
import {
  SIMPLE_AUTH_COOKIE_NAME,
  SIMPLE_AUTH_TTL_SECONDS,
  createSimpleAuthToken,
  getSimpleAuthConfig,
  verifySimpleAuthPassword,
} from '@/domain/ganancias/auth/simpleAuth';
import {
  DEFAULT_LOGIN_RATE_LIMIT,
  clientKeyFromForwardedFor,
  evaluateLoginAttempt,
  registerLoginFailure,
  type LoginAttemptState,
} from '@/domain/ganancias/auth/loginRateLimit';

// P31.3: estado en memoria por instancia (mejor esfuerzo en serverless; ver loginRateLimit.ts).
const loginAttempts = new Map<string, LoginAttemptState>();

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  const config = getSimpleAuthConfig();
  if (!config.isConfigured) {
    return NextResponse.json(
      { success: false, error: 'Autenticacion no configurada. Definir AUTH_PASSWORD y AUTH_SECRET.' },
      { status: 503 },
    );
  }

  const clientKey = clientKeyFromForwardedFor(req.headers.get('x-forwarded-for'));
  const nowMs = Date.now();
  const attempt = evaluateLoginAttempt(loginAttempts.get(clientKey), nowMs);
  if (!attempt.allowed) {
    return NextResponse.json(
      { success: false, error: `Demasiados intentos fallidos. Reintente en ${attempt.retryAfterSeconds} segundos.` },
      { status: 429, headers: { 'Retry-After': String(attempt.retryAfterSeconds) } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';
  if (!verifySimpleAuthPassword(password)) {
    loginAttempts.set(clientKey, registerLoginFailure(loginAttempts.get(clientKey), nowMs));
    // Demora fija ante fallo: encarece la fuerza bruta sin afectar el uso normal.
    await sleep(DEFAULT_LOGIN_RATE_LIMIT.failureDelayMs);
    return NextResponse.json(
      { success: false, error: 'Clave incorrecta.' },
      { status: 401 },
    );
  }

  loginAttempts.delete(clientKey);
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
