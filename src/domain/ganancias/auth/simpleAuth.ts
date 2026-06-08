export const SIMPLE_AUTH_COOKIE_NAME = 'jaba_auth';
export const SIMPLE_AUTH_TTL_SECONDS = 60 * 60 * 12;

export type SimpleAuthEnv = {
  AUTH_PASSWORD?: string;
  AUTH_SECRET?: string;
  NODE_ENV?: string;
};

export type SimpleAuthConfig = {
  password: string;
  secret: string;
  isConfigured: boolean;
  isProduction: boolean;
};

type SimpleAuthPayload = {
  v: 1;
  sub: 'single-user';
  iat: number;
  exp: number;
};

const DEV_AUTH_PASSWORD = 'JabaDev2026!';
const DEV_AUTH_SECRET = 'jaba-dev-auth-secret-change-me-before-production';

function encodeBase64UrlBytes(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function encodeBase64UrlText(value: string): string {
  return encodeBase64UrlBytes(new TextEncoder().encode(value));
}

function decodeBase64UrlText(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return encodeBase64UrlBytes(new Uint8Array(signature));
}

export function getSimpleAuthConfig(env: SimpleAuthEnv = process.env): SimpleAuthConfig {
  const isProduction = env.NODE_ENV === 'production';
  const password = env.AUTH_PASSWORD || (isProduction ? '' : DEV_AUTH_PASSWORD);
  const secret = env.AUTH_SECRET || (isProduction ? '' : DEV_AUTH_SECRET);

  return {
    password,
    secret,
    isConfigured: password.length > 0 && secret.length > 0,
    isProduction,
  };
}

export function verifySimpleAuthPassword(password: string, env: SimpleAuthEnv = process.env): boolean {
  const config = getSimpleAuthConfig(env);
  if (!config.isConfigured || !password) return false;
  return safeEqual(password, config.password);
}

export async function createSimpleAuthToken(
  env: SimpleAuthEnv = process.env,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const config = getSimpleAuthConfig(env);
  if (!config.isConfigured) {
    throw new Error('Simple auth is not configured.');
  }

  const payload: SimpleAuthPayload = {
    v: 1,
    sub: 'single-user',
    iat: nowSeconds,
    exp: nowSeconds + SIMPLE_AUTH_TTL_SECONDS,
  };
  const encodedPayload = encodeBase64UrlText(JSON.stringify(payload));
  const signature = await signPayload(encodedPayload, config.secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifySimpleAuthToken(
  token: string | undefined,
  env: SimpleAuthEnv = process.env,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const config = getSimpleAuthConfig(env);
  if (!config.isConfigured || !token) return false;

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return false;

  const expectedSignature = await signPayload(encodedPayload, config.secret);
  if (!safeEqual(signature, expectedSignature)) return false;

  try {
    const payload = JSON.parse(decodeBase64UrlText(encodedPayload)) as Partial<SimpleAuthPayload>;
    return payload.v === 1 &&
      payload.sub === 'single-user' &&
      typeof payload.exp === 'number' &&
      payload.exp > nowSeconds;
  } catch {
    return false;
  }
}

export function isProtectedPath(pathname: string): boolean {
  if (pathname === '/login' || pathname.startsWith('/login/')) return false;
  if (pathname === '/api/auth/login' || pathname === '/api/auth/logout') return false;
  if (pathname.startsWith('/_next/')) return false;
  if (pathname === '/favicon.ico' || pathname === '/robots.txt' || pathname === '/sitemap.xml') return false;
  if (/\.(?:css|js|map|png|jpg|jpeg|gif|svg|ico|webp|avif|woff2?)$/i.test(pathname)) return false;
  return true;
}

export function isApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/');
}
