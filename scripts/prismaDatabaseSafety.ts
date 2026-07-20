const DEFAULT_PRODUCTION_DATABASE_NAME = 'u669600172_ganancias_jaba';
const TEST_DATABASE_NAME = 'ganancias_jaba_test';

export function assertPrismaDatabaseSafety(
  env: Record<string, string | undefined> = process.env,
): void {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) return;

  const parsed = new URL(databaseUrl);
  const host = parsed.hostname.toLowerCase();
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  const productionDatabaseName = env.PRODUCTION_DATABASE_NAME ?? DEFAULT_PRODUCTION_DATABASE_NAME;
  const isVercelProduction = env.VERCEL === '1'
    && env.VERCEL_ENV === 'production'
    && (!env.VERCEL_GIT_COMMIT_REF || env.VERCEL_GIT_COMMIT_REF === 'main');

  if (database === productionDatabaseName && !isVercelProduction) {
    throw new Error(
      'PRISMA BLOQUEADO: los comandos locales no pueden usar la base productiva. '
      + 'Use los scripts npm db:test:* contra Docker.',
    );
  }

  if (env.APP_ENV === 'test-db') {
    const isLocalHost = host === '127.0.0.1' || host === 'localhost';
    if (!isLocalHost || database !== TEST_DATABASE_NAME) {
      throw new Error(`PRISMA BLOQUEADO: test-db solo puede usar 127.0.0.1/${TEST_DATABASE_NAME}.`);
    }
  }
}
