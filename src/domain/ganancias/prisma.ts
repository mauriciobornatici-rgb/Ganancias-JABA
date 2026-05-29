import { PrismaClient } from '@/generated/client/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

let prismaInstance: PrismaClient | null = null;

export const getPrisma = (): PrismaClient => {
  if (!prismaInstance) {
    const parseConnectionString = (url: string) => {
      const regex = /^(?:mysql|mariadb):\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
      const match = url.match(regex);
      if (match) {
        return {
          user: match[1],
          password: match[2],
          host: match[3],
          port: parseInt(match[4], 10),
          database: match[5]
        };
      }
      return {
        host: 'localhost',
        port: 3306,
        user: 'jaba',
        password: 'jaba_secure_pass',
        database: 'ganancias_jaba'
      };
    };

    // 1. Parse connection string and set custom options
    const connConfig = parseConnectionString(process.env.DATABASE_URL!);
    if (connConfig) {
      (connConfig as any).allowPublicKeyRetrieval = true;
    }
    
    // 2. Wrap it with the PrismaMariaDb adapter by passing connConfig directly
    const adapter = new PrismaMariaDb(connConfig);

    // 3. Create the PrismaClient utilizing the driver adapter
    prismaInstance = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }
  return prismaInstance;
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
