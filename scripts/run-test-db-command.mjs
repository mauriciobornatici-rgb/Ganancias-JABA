import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const TEST_DATABASE_URL = 'mysql://jaba_test:jaba_test_pass@127.0.0.1:3317/ganancias_jaba_test';

const commandMap = {
  migrate: ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
  seed: ['node_modules/prisma/build/index.js', 'db', 'seed', '--schema', 'prisma/schema.prisma'],
  dev: ['node_modules/next/dist/bin/next', 'dev', '--webpack'],
  studio: ['node_modules/prisma/build/index.js', 'studio', '--schema', 'prisma/schema.prisma'],
  validate: ['node_modules/prisma/build/index.js', 'validate', '--schema', 'prisma/schema.prisma'],
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
  const child = spawn(process.execPath, [scriptPath, ...args], {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      APP_ENV: 'test-db',
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
