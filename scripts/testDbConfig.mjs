const DEFAULT_TEST_PORT = '3317';
const TEST_DATABASE_NAME = 'ganancias_jaba_test';
const TEST_DATABASE_USER = 'jaba_test';
const TEST_DATABASE_PASSWORD = 'jaba_test_pass';

const defaultTestDatabaseUrl = (port) => (
  `mysql://${TEST_DATABASE_USER}:${TEST_DATABASE_PASSWORD}@127.0.0.1:${port}/${TEST_DATABASE_NAME}`
);

export function resolveTestDatabaseUrl(env = process.env) {
  const port = env.JABA_TEST_DB_PORT ?? DEFAULT_TEST_PORT;
  const candidate = env.TEST_DATABASE_URL ?? defaultTestDatabaseUrl(port);
  const parsed = new URL(candidate);

  if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== `/${TEST_DATABASE_NAME}`) {
    throw new Error('La base de pruebas debe ser local y llamarse ganancias_jaba_test.');
  }

  if (parsed.username !== TEST_DATABASE_USER || parsed.password !== TEST_DATABASE_PASSWORD) {
    throw new Error('La base de pruebas debe usar las credenciales Docker jaba_test.');
  }

  return candidate;
}
