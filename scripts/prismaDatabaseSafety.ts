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

  // Única excepción local: la migración productiva deliberada de `npm run db:prod:migrate`, que
  // exige CONFIRM_PROD_MIGRATION=1 y sólo entonces setea esta variable. No alcanza con un valor
  // genérico ("1", "true"): hay que NOMBRAR la base productiva, para que nadie la habilite de paso
  // ni quede prendida en un `.env`. Todo lo demás (dev, studio, migrate dev) sigue bloqueado.
  const isExplicitProductionMigration = env.PRISMA_ALLOW_PRODUCTION_MIGRATION === productionDatabaseName;

  if (database === productionDatabaseName && !isVercelProduction && !isExplicitProductionMigration) {
    throw new Error(
      'PRISMA BLOQUEADO: los comandos locales no pueden usar la base productiva. '
      + 'Use los scripts npm db:test:* contra Docker, o npm run db:prod:migrate para migrar produccion.',
    );
  }

  if (env.APP_ENV === 'test-db') {
    const isLocalHost = host === '127.0.0.1' || host === 'localhost';
    if (!isLocalHost || database !== TEST_DATABASE_NAME) {
      throw new Error(`PRISMA BLOQUEADO: test-db solo puede usar 127.0.0.1/${TEST_DATABASE_NAME}.`);
    }
  }
}
