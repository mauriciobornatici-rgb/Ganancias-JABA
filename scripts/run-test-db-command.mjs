import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { resolveTestDatabaseUrl } from './testDbConfig.mjs';

export const TEST_DATABASE_URL = resolveTestDatabaseUrl();

const commandMap = {
  migrate: ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
  seed: ['node_modules/prisma/build/index.js', 'db', 'seed', '--schema', 'prisma/schema.prisma'],
  dev: ['node_modules/next/dist/bin/next', 'dev', '--webpack'],
  studio: ['node_modules/prisma/build/index.js', 'studio', '--schema', 'prisma/schema.prisma'],
  validate: ['node_modules/prisma/build/index.js', 'validate', '--schema', 'prisma/schema.prisma'],
  'validate-excel': ['node_modules/vitest/vitest.mjs', 'run', 'src/domain/ganancias/tests/excelCaptureCaseDockerPersistence.test.ts'],
  'create-migration': ['node_modules/prisma/build/index.js', 'migrate', 'dev', '--create-only', '--schema', 'prisma/schema.prisma'],
};

const run = () => {
  const commandName = process.argv[2];
  const command = commandMap[commandName];

  if (!command) {
    console.error(`Comando no soportado: ${commandName ?? '(vacio)'}`);
    console.error(`Comandos disponibles: ${Object.keys(commandMap).join(', ')}`);
    process.exit(1);
  }

  const [scriptPath, ...args] = command;
  const extraArgs = commandName === 'create-migration' ? process.argv.slice(3) : [];
  const child = spawn(process.execPath, [scriptPath, ...args, ...extraArgs], {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      APP_ENV: 'test-db',
      RUN_DOCKER_DB_VALIDATION: commandName === 'validate-excel' ? '1' : process.env.RUN_DOCKER_DB_VALIDATION,
    },
    shell: false,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.error(`Comando interrumpido por senal ${signal}`);
      process.exit(1);
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
