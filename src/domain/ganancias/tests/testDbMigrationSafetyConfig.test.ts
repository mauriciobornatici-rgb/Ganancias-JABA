import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('Docker migration shadow database configuration', () => {
  it('keeps Prisma migration generation inside the isolated Docker databases', () => {
    const runner = readFileSync(join(root, 'scripts/run-test-db-command.mjs'), 'utf8');
    const prismaConfig = readFileSync(join(root, 'prisma.config.ts'), 'utf8');
    const compose = readFileSync(join(root, 'docker-compose.yml'), 'utf8');
    const initSqlPath = join(root, 'docker/mysql-test-init/01-shadow-database.sql');

    expect(existsSync(initSqlPath)).toBe(true);

    if (!existsSync(initSqlPath)) return;

    const initSql = readFileSync(initSqlPath, 'utf8');

    expect(runner).toContain('resolveTestShadowDatabaseUrl');
    expect(runner).toContain('SHADOW_DATABASE_URL: TEST_SHADOW_DATABASE_URL');
    expect(prismaConfig).toContain('shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"]');
    expect(compose).toContain('./docker/mysql-test-init:/docker-entrypoint-initdb.d:ro');
    expect(initSql).toContain('CREATE DATABASE IF NOT EXISTS ganancias_jaba_test_shadow');
    expect(initSql).toContain("GRANT ALL PRIVILEGES ON ganancias_jaba_test_shadow.* TO 'jaba_test'@'%'");
  });

  it('loads the isolated seed after migrations and before integration tests in CI', () => {
    const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    const migrateStep = workflow.indexOf('run: npm run db:test:migrate');
    const seedStep = workflow.indexOf('run: npm run db:test:seed');
    const integrationStep = workflow.indexOf('run: npm run test:integration');

    expect(migrateStep).toBeGreaterThanOrEqual(0);
    expect(seedStep).toBeGreaterThan(migrateStep);
    expect(integrationStep).toBeGreaterThan(seedStep);
  });
});
