export type MariaDbConnectionConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  allowPublicKeyRetrieval: boolean;
  connectionLimit: number;
  idleTimeout: number;
  minimumIdle: number;
};

export type DatabaseRuntimeEnvironment = Record<string, string | undefined>;

const DEFAULT_PRODUCTION_DATABASE_NAME = 'u669600172_ganancias_jaba';
const TEST_DATABASE_NAME = 'ganancias_jaba_test';

/**
 * Impide que un servidor local, un test o un Preview de Vercel abra la base productiva.
 * La Ãºnica autorizaciÃ³n posible es el runtime Production de Vercel desplegado desde main.
 */
export function assertDatabaseEnvironmentSafety(
  databaseUrl: string,
  env: DatabaseRuntimeEnvironment = process.env,
): void {
  const parsed = new URL(databaseUrl);
  const host = parsed.hostname.toLowerCase();
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  const productionDatabaseName = env.PRODUCTION_DATABASE_NAME ?? DEFAULT_PRODUCTION_DATABASE_NAME;
  const isProductionTarget = database === productionDatabaseName;
  const isVercelProduction = env.VERCEL === '1'
    && env.VERCEL_ENV === 'production'
    && (!env.VERCEL_GIT_COMMIT_REF || env.VERCEL_GIT_COMMIT_REF === 'main');

  if (isProductionTarget && !isVercelProduction) {
    throw new Error(
      'CONEXIÃ“N BLOQUEADA: la base productiva solo puede usarse desde Vercel Production en main. '
      + 'Para desarrollo ejecute npm run dev y use la base Docker aislada.',
    );
  }

  if (env.APP_ENV === 'test-db' || env.NODE_ENV === 'development') {
    const isLocalHost = host === '127.0.0.1' || host === 'localhost';
    if (!isLocalHost || database !== TEST_DATABASE_NAME) {
      throw new Error(
        `CONEXIÃ“N BLOQUEADA: ${env.APP_ENV === 'test-db' ? 'el entorno de prueba' : 'el desarrollo local'} `
        + `solo puede usar 127.0.0.1/${TEST_DATABASE_NAME}.`,
      );
    }
  }
}

/**
 * El MySQL compartido de Hostinger corta conexiones inactivas a los 20 s (wait_timeout=20) y
 * bloquea la IP del cliente al 5.º error de conexión (max_connect_errors=5). Si el pool retiene
 * conexiones inactivas más tiempo que el servidor (default del driver: 30 min), cada reuso de una
 * conexión ya matada cuenta como error y las IPs de salida de Vercel terminan bloqueadas
 * (incidente de producción 2026-07-11). Por eso el cliente cierra sus conexiones ANTES que el
 * servidor y no mantiene conexiones ociosas de reserva.
 */
const POOL_TUNING = {
  connectionLimit: 5,
  idleTimeout: 15,
  // 1 y no 0: con 0 el adapter de Prisma queda sin conexiones ("pool is closed");
  // con el default (= connectionLimit) el pool nunca libera ociosas y el fix seria inerte.
  minimumIdle: 1,
} as const;

function requireDatabaseUrl(databaseUrl: string | undefined): string {
  if (!databaseUrl || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL no configurada. Complete la URL MySQL/MariaDB en .env o en Vercel antes de usar la base.');
  }

  return databaseUrl.trim();
}

export function buildMariaDbConnectionConfig(
  databaseUrl = process.env.DATABASE_URL,
  env: DatabaseRuntimeEnvironment = process.env,
): MariaDbConnectionConfig {
  const rawUrl = requireDatabaseUrl(databaseUrl);
  const parsed = new URL(rawUrl);

  if (parsed.protocol !== 'mysql:' && parsed.protocol !== 'mariadb:') {
    throw new Error('DATABASE_URL debe usar protocolo mysql:// o mariadb://.');
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!parsed.hostname || !parsed.username || !database) {
    throw new Error('DATABASE_URL debe incluir host, usuario y nombre de base de datos.');
  }

  const port = parsed.port ? Number(parsed.port) : 3306;
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('DATABASE_URL tiene un puerto MySQL invalido.');
  }

  assertDatabaseEnvironmentSafety(rawUrl, env);

  return {
    host: parsed.hostname,
    port,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
    allowPublicKeyRetrieval: true,
    ...POOL_TUNING,
  };
}

export function maskDatabaseUrl(databaseUrl = process.env.DATABASE_URL): string {
  if (!databaseUrl || databaseUrl.trim() === '') {
    return '[DATABASE_URL no configurada]';
  }

  try {
    const parsed = new URL(databaseUrl);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '[DATABASE_URL invalida]';
  }
}
