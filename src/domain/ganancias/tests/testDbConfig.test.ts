import { describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from '../../../../scripts/testDbConfig.mjs';

describe('resolveTestDatabaseUrl', () => {
  it('uses the selected isolated worktree port', () => {
    expect(resolveTestDatabaseUrl({ JABA_TEST_DB_PORT: '3318' }))
      .toBe('mysql://jaba_test:jaba_test_pass@127.0.0.1:3318/ganancias_jaba_test');
  });

  it('rejects a database URL that is not the local Docker test database', () => {
    expect(() => resolveTestDatabaseUrl({
      TEST_DATABASE_URL: 'mysql://user:pass@srv1199.hstgr.io:3306/ganancias_jaba',
    })).toThrow('La base de pruebas debe ser local');
  });
});
