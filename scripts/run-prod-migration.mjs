import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/**
 * Migración deliberada de la base PRODUCTIVA (`prisma migrate deploy`).
 *
 * La guarda de `scripts/prismaDatabaseSafety.ts` bloquea cualquier comando Prisma local contra
 * producción para evitar accidentes. Migrar producción es una operación legítima y necesaria, así que
 * este script es el ÚNICO camino habilitado: pide intención explícita y sólo entonces habilita la
 * excepción nombrada de la guarda.
 *
 * Requisitos (los pone el operador en SU terminal, nunca en el repo ni en un `.env`):
 *   $env:DATABASE_URL="mysql://usuario:password@host:3306/u669600172_ganancias_jaba"
 *   $env:CONFIRM_PROD_MIGRATION="1"
 *   npm run db:prod:migrate
 *
 * Orden obligatorio del deploy: backup de Hostinger -> esta migración -> merge a main.
 * Nunca `prisma migrate dev` contra producción: sólo `migrate deploy`.
 */

const DEFAULT_PRODUCTION_DATABASE_NAME = 'u669600172_ganancias_jaba';

/** Enmascara la password para poder mostrar el destino sin filtrar credenciales. */
export function maskDatabaseUrl(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    const user = parsed.username ? `${parsed.username}:***@` : '';
    const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    return `mysql://${user}${parsed.hostname}:${parsed.port || '3306'}/${database}`;
  } catch {
    return '(DATABASE_URL invalida)';
  }
}

/**
 * Validación PURA: decide si la migración puede correr y con qué entorno.
 * Devuelve `{ ok: false, error }` o `{ ok: true, databaseName, host, maskedUrl, env }`.
 */
export function buildProdMigrationPlan(env) {
  const databaseUrl = env.DATABASE_URL?.trim();
  const productionDatabaseName = env.PRODUCTION_DATABASE_NAME ?? DEFAULT_PRODUCTION_DATABASE_NAME;

  if (!databaseUrl) {
    return {
      ok: false,
      error: 'Falta DATABASE_URL. Setealo en esta terminal apuntando a la base productiva de Hostinger.',
    };
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return { ok: false, error: 'DATABASE_URL no es una URL valida.' };
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  const host = parsed.hostname.toLowerCase();

  if (databaseName !== productionDatabaseName) {
    return {
      ok: false,
      error: `Este script es solo para la base productiva (${productionDatabaseName}); DATABASE_URL apunta a `
        + `"${databaseName}". Para Docker use npm run db:test:migrate.`,
    };
  }

  if (host === '127.0.0.1' || host === 'localhost') {
    return {
      ok: false,
      error: 'DATABASE_URL usa el nombre de la base productiva contra localhost. Revise el destino antes de migrar.',
    };
  }

  if (env.CONFIRM_PROD_MIGRATION !== '1') {
    return {
      ok: false,
      error: 'Migracion productiva NO confirmada. Hace el backup de Hostinger y despues setea '
        + 'CONFIRM_PROD_MIGRATION=1 en esta terminal para confirmar que querés migrar produccion.',
    };
  }

  return {
    ok: true,
    databaseName,
    host,
    maskedUrl: maskDatabaseUrl(databaseUrl),
    env: {
      DATABASE_URL: databaseUrl,
      // Excepción nombrada de la guarda: hay que decir CUÁL base se habilita.
      PRISMA_ALLOW_PRODUCTION_MIGRATION: productionDatabaseName,
      // APP_ENV=test-db exigiría Docker: se limpia para no chocar con la guarda.
      APP_ENV: '',
    },
  };
}

const run = () => {
  const plan = buildProdMigrationPlan(process.env);

  if (!plan.ok) {
    console.error(`\nMIGRACION PRODUCTIVA ABORTADA: ${plan.error}\n`);
    process.exit(1);
  }

  console.log('\n=== MIGRACION DE LA BASE PRODUCTIVA ===');
  console.log(`Destino: ${plan.maskedUrl}`);
  console.log('Recordatorio: el backup de Hostinger tiene que estar hecho y con restauracion probada.');
  console.log('Comando: prisma migrate deploy (nunca migrate dev)\n');

  const child = spawn(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
    {
      stdio: 'inherit',
      env: { ...process.env, ...plan.env },
      shell: false,
    },
  );

  child.on('exit', (code, signal) => {
    if (signal) {
      console.error(`\nMigracion interrumpida por senal ${signal}. Verifique el estado de la base antes de reintentar.\n`);
      process.exit(1);
    }
    if (code === 0) {
      console.log('\nMigracion aplicada. Recien ahora corresponde el merge a main (Vercel despliega solo).\n');
    }
    process.exit(code ?? 0);
  });
};

const isExecutedDirectly = () => {
  const invokedScript = process.argv[1];
  return Boolean(invokedScript) && import.meta.url === pathToFileURL(resolve(invokedScript)).href;
};

if (isExecutedDirectly()) {
  run();
}
