/**
 * P31.3 - Limite de intentos de login (proteccion de fuerza bruta sobre la clave unica).
 * Logica pura y testeable; el estado en memoria vive en la ruta de login. En Vercel cada
 * instancia serverless tiene su propio mapa: es una proteccion de mejor esfuerzo que, junto
 * con la demora fija ante fallo, encarece el ataque sin agregar dependencias externas.
 */

export type LoginAttemptState = {
  failures: number;
  firstFailureAtMs: number;
  lockedUntilMs: number;
};

export type LoginRateLimitConfig = {
  maxFailures: number;
  windowMs: number;
  lockMs: number;
  failureDelayMs: number;
};

export const DEFAULT_LOGIN_RATE_LIMIT: LoginRateLimitConfig = {
  maxFailures: 5,
  windowMs: 15 * 60_000,
  lockMs: 15 * 60_000,
  failureDelayMs: 1_000,
};

export function evaluateLoginAttempt(
  state: LoginAttemptState | undefined,
  nowMs: number,
): { allowed: boolean; retryAfterSeconds: number } {
  if (state && state.lockedUntilMs > nowMs) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((state.lockedUntilMs - nowMs) / 1000),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function registerLoginFailure(
  state: LoginAttemptState | undefined,
  nowMs: number,
  config: LoginRateLimitConfig = DEFAULT_LOGIN_RATE_LIMIT,
): LoginAttemptState {
  const isNewWindow = !state || nowMs - state.firstFailureAtMs > config.windowMs;
  const failures = isNewWindow ? 1 : state!.failures + 1;
  const firstFailureAtMs = isNewWindow ? nowMs : state!.firstFailureAtMs;
  const lockedUntilMs = failures >= config.maxFailures ? nowMs + config.lockMs : 0;

  return { failures, firstFailureAtMs, lockedUntilMs };
}

/** Clave del cliente a partir de x-forwarded-for (primer IP) con fallback estable. */
export function clientKeyFromForwardedFor(forwardedFor: string | null | undefined): string {
  if (!forwardedFor) return 'unknown';
  const first = forwardedFor.split(',')[0]?.trim();
  return first || 'unknown';
}
