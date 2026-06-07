import { PrismaClient } from '@/generated/client/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { buildMariaDbConnectionConfig } from './persistence/databaseConnection';

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

export const getPrisma = (): PrismaClient => {
  if (!globalThis.prismaGlobal) {
    const connConfig = buildMariaDbConnectionConfig();
    const adapter = new PrismaMariaDb(connConfig);

    globalThis.prismaGlobal = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }
  return globalThis.prismaGlobal;
};

export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop, receiver) {
    const instance = getPrisma();
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  }
});
