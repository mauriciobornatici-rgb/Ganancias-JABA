export type OperationalHealthStatus = 'ok' | 'degraded';
export type OperationalCheckStatus = 'ok' | 'error';

export type DatabaseTarget = {
  host: string;
  port: string;
  database: string;
  label: string;
};

export type OperationalHealthReport = {
  status: OperationalHealthStatus;
  timestamp: string;
  environment: {
    vercelEnv: string;
    gitBranch: string;
  };
  checks: {
    database: {
      status: OperationalCheckStatus;
      target: DatabaseTarget;
      error?: string;
    };
  };
};

type SecretParts = {
  username?: string;
  password?: string;
};

export function maskDatabaseTarget(databaseUrl?: string | null): DatabaseTarget {
  if (!databaseUrl) {
    return {
      host: 'sin-configurar',
      port: '',
      database: '',
      label: 'sin-configurar',
    };
  }

  try {
    const parsed = new URL(databaseUrl);
    const database = parsed.pathname.replace(/^\//, '') || '';
    const port = parsed.port || defaultPortForProtocol(parsed.protocol);
    const label = port ? `${parsed.hostname}:${port}/${database}` : `${parsed.hostname}/${database}`;

    return {
      host: parsed.hostname,
      port,
      database,
      label,
    };
  } catch {
    return {
      host: 'url-invalida',
      port: '',
      database: '',
      label: 'url-invalida',
    };
  }
}

export async function buildOperationalHealthReport({
  databaseUrl,
  databaseCheck,
  now = () => new Date(),
  env = {},
}: {
  databaseUrl?: string | null;
  databaseCheck: () => Promise<unknown>;
  now?: () => Date;
  env?: {
    vercelEnv?: string | null;
    gitBranch?: string | null;
  };
}): Promise<OperationalHealthReport> {
  const target = maskDatabaseTarget(databaseUrl);
  const environment = {
    vercelEnv: env.vercelEnv || 'local',
    gitBranch: env.gitBranch || 'unknown',
  };

  try {
    await databaseCheck();

    return {
      status: 'ok',
      timestamp: now().toISOString(),
      environment,
      checks: {
        database: {
          status: 'ok',
          target,
        },
      },
    };
  } catch (err) {
    return {
      status: 'degraded',
      timestamp: now().toISOString(),
      environment,
      checks: {
        database: {
          status: 'error',
          target,
          error: sanitizeDatabaseError(errorMessage(err), databaseUrl),
        },
      },
    };
  }
}

function defaultPortForProtocol(protocol: string): string {
  if (protocol === 'mysql:') return '3306';
  return '';
}

function parseSecretParts(databaseUrl?: string | null): SecretParts {
  if (!databaseUrl) return {};

  try {
    const parsed = new URL(databaseUrl);
    return {
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    };
  } catch {
    return {};
  }
}

function sanitizeDatabaseError(message: string, databaseUrl?: string | null): string {
  const parts = parseSecretParts(databaseUrl);
  let sanitized = message;

  for (const secret of [parts.username, parts.password]) {
    if (secret) {
      sanitized = sanitized.split(secret).join('[redacted]');
    }
  }

  return sanitized;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
