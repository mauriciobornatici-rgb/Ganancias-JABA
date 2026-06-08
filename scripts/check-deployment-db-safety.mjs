import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const DEFAULT_PRODUCTION_DATABASE_HOSTS = ['srv1199.hstgr.io', '193.203.175.56'];
const DEFAULT_PRODUCTION_DATABASE_NAME = 'u669600172_ganancias_jaba';

const trimQuotes = (value) => value.replace(/^["']|["']$/g, '');

const normalizeDatabaseUrl = (rawValue) => {
  if (!rawValue) {
    return '';
  }

  const trimmed = trimQuotes(rawValue.trim());
  if (trimmed.startsWith('DATABASE_URL=')) {
    return trimQuotes(trimmed.slice('DATABASE_URL='.length).trim());
  }

  return trimmed;
};

const parseDatabaseUrl = (databaseUrl) => {
  if (!databaseUrl) {
    return null;
  }

  try {
    const parsed = new URL(databaseUrl);
    return {
      host: parsed.hostname.toLowerCase(),
      databaseName: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
    };
  } catch {
    return null;
  }
};

const splitHosts = (value) => (
  value
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
);

const buildResult = (ok, message) => ({
  ok,
  severity: ok ? 'safe' : 'blocked',
  message,
});

const hasConfiguredSecret = (value) => {
  if (!value) return false;
  const normalized = trimQuotes(value.trim());
  return normalized.length > 0 && !normalized.toUpperCase().includes('REEMPLAZAR');
};

export const evaluateDeploymentDatabaseSafety = (env = process.env) => {
  const vercelEnv = env.VERCEL_ENV ?? '';
  const isVercel = env.VERCEL === '1' || vercelEnv.length > 0;
  const gitRef = env.VERCEL_GIT_COMMIT_REF ?? '';
  const databaseUrl = normalizeDatabaseUrl(env.DATABASE_URL);
  const productionDatabaseName = env.PRODUCTION_DATABASE_NAME ?? DEFAULT_PRODUCTION_DATABASE_NAME;
  const productionHosts = splitHosts(
    env.PRODUCTION_DATABASE_HOSTS ?? DEFAULT_PRODUCTION_DATABASE_HOSTS.join(','),
  );

  if (!isVercel) {
    return buildResult(true, 'Entorno local: la proteccion de Vercel no bloquea tareas controladas.');
  }

  if (vercelEnv === 'production') {
    if (gitRef && gitRef !== 'main') {
      return buildResult(false, `Vercel Production debe salir desde main; rama detectada: ${gitRef}.`);
    }

    if (!databaseUrl) {
      return buildResult(false, 'Vercel Production requiere DATABASE_URL configurada.');
    }

    if (!hasConfiguredSecret(env.AUTH_PASSWORD) || !hasConfiguredSecret(env.AUTH_SECRET)) {
      return buildResult(false, 'Vercel Production requiere AUTH_PASSWORD y AUTH_SECRET configurados antes de publicar autenticacion.');
    }

    return buildResult(true, 'Vercel Production validado.');
  }

  if (!databaseUrl) {
    return buildResult(true, 'Preview sin DATABASE_URL: seguro porque no puede escribir en la base productiva.');
  }

  const parsedDatabaseUrl = parseDatabaseUrl(databaseUrl);
  if (!parsedDatabaseUrl) {
    return buildResult(false, 'DATABASE_URL no tiene formato valido; se bloquea el deploy para evitar un entorno ambiguo.');
  }

  const pointsToProductionDatabase = (
    productionHosts.includes(parsedDatabaseUrl.host)
    && parsedDatabaseUrl.databaseName === productionDatabaseName
  );

  if (
    pointsToProductionDatabase
    && env.ALLOW_PRODUCTION_DATABASE_OUTSIDE_PRODUCTION !== 'true'
  ) {
    return buildResult(
      false,
      'Preview/Staging no puede usar la base productiva. Use una base staging o quite DATABASE_URL en Preview.',
    );
  }

  return buildResult(true, 'Entorno no productivo validado: no apunta a la base productiva.');
};

const isExecutedDirectly = () => {
  const invokedScript = process.argv[1];
  return Boolean(invokedScript) && import.meta.url === pathToFileURL(resolve(invokedScript)).href;
};

if (isExecutedDirectly()) {
  const result = evaluateDeploymentDatabaseSafety(process.env);
  const prefix = result.ok ? '[deploy-db-safety] OK' : '[deploy-db-safety] BLOQUEADO';
  console.log(`${prefix}: ${result.message}`);

  if (!result.ok) {
    process.exitCode = 1;
  }
}
