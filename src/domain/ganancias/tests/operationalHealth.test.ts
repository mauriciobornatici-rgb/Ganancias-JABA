import { describe, expect, it } from 'vitest';
import {
  buildOperationalHealthReport,
  maskDatabaseTarget,
} from '../operations/operationalHealth';

describe('operationalHealth', () => {
  it('enmascara la URL de base sin exponer usuario ni password', () => {
    const target = maskDatabaseTarget('mysql://jaba_app:super-secret@srv1199.hstgr.io:3306/u669600172_ganancias_jaba');

    expect(target).toEqual({
      host: 'srv1199.hstgr.io',
      port: '3306',
      database: 'u669600172_ganancias_jaba',
      label: 'srv1199.hstgr.io:3306/u669600172_ganancias_jaba',
    });
    expect(JSON.stringify(target)).not.toContain('super-secret');
    expect(JSON.stringify(target)).not.toContain('jaba_app');
  });

  it('devuelve status ok cuando la base responde', async () => {
    const report = await buildOperationalHealthReport({
      databaseUrl: 'mysql://jaba_test:jaba_test_pass@127.0.0.1:3317/ganancias_jaba_test',
      now: () => new Date('2026-06-08T12:00:00.000Z'),
      databaseCheck: async () => undefined,
      env: {
        vercelEnv: 'development',
        gitBranch: 'feature/p21-backup-health',
      },
    });

    expect(report).toEqual({
      status: 'ok',
      timestamp: '2026-06-08T12:00:00.000Z',
      environment: {
        vercelEnv: 'development',
        gitBranch: 'feature/p21-backup-health',
      },
      checks: {
        database: {
          status: 'ok',
          target: {
            host: '127.0.0.1',
            port: '3317',
            database: 'ganancias_jaba_test',
            label: '127.0.0.1:3317/ganancias_jaba_test',
          },
        },
      },
    });
  });

  it('devuelve status degraded cuando la base falla sin filtrar secretos', async () => {
    const report = await buildOperationalHealthReport({
      databaseUrl: 'mysql://jaba_app:super-secret@srv1199.hstgr.io:3306/u669600172_ganancias_jaba',
      now: () => new Date('2026-06-08T12:00:00.000Z'),
      databaseCheck: async () => {
        throw new Error('connect ETIMEDOUT super-secret');
      },
      env: {
        vercelEnv: 'production',
        gitBranch: 'main',
      },
    });

    expect(report.status).toBe('degraded');
    expect(report.checks.database.status).toBe('error');
    expect(report.checks.database.error).toContain('connect ETIMEDOUT');
    expect(report.checks.database.error).not.toContain('super-secret');
    expect(JSON.stringify(report)).not.toContain('jaba_app');
  });
});
