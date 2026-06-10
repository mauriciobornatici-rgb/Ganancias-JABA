import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOGIN_RATE_LIMIT,
  clientKeyFromForwardedFor,
  evaluateLoginAttempt,
  registerLoginFailure,
  type LoginAttemptState,
} from '../auth/loginRateLimit';

const T0 = 1_000_000;

describe('P31.3 - Rate limit de login', () => {
  it('permite intentos sin historial previo', () => {
    expect(evaluateLoginAttempt(undefined, T0)).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('bloquea al alcanzar el maximo de fallos dentro de la ventana', () => {
    let state: LoginAttemptState | undefined;
    for (let i = 0; i < DEFAULT_LOGIN_RATE_LIMIT.maxFailures; i++) {
      state = registerLoginFailure(state, T0 + i * 1000);
    }

    expect(state!.failures).toBe(DEFAULT_LOGIN_RATE_LIMIT.maxFailures);
    expect(state!.lockedUntilMs).toBeGreaterThan(T0);

    const attempt = evaluateLoginAttempt(state, T0 + 5000);
    expect(attempt.allowed).toBe(false);
    expect(attempt.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('libera el bloqueo cuando vence el lock', () => {
    let state: LoginAttemptState | undefined;
    for (let i = 0; i < DEFAULT_LOGIN_RATE_LIMIT.maxFailures; i++) {
      state = registerLoginFailure(state, T0);
    }

    const after = T0 + DEFAULT_LOGIN_RATE_LIMIT.lockMs + 1;
    expect(evaluateLoginAttempt(state, after).allowed).toBe(true);
  });

  it('reinicia el contador cuando los fallos quedan fuera de la ventana', () => {
    const oldState = registerLoginFailure(undefined, T0);
    const afterWindow = T0 + DEFAULT_LOGIN_RATE_LIMIT.windowMs + 1;
    const renewed = registerLoginFailure(oldState, afterWindow);

    expect(renewed.failures).toBe(1);
    expect(renewed.firstFailureAtMs).toBe(afterWindow);
    expect(renewed.lockedUntilMs).toBe(0);
  });

  it('extrae la primera IP de x-forwarded-for con fallback estable', () => {
    expect(clientKeyFromForwardedFor('203.0.113.5, 10.0.0.1')).toBe('203.0.113.5');
    expect(clientKeyFromForwardedFor('203.0.113.5')).toBe('203.0.113.5');
    expect(clientKeyFromForwardedFor(null)).toBe('unknown');
    expect(clientKeyFromForwardedFor('')).toBe('unknown');
  });
});
