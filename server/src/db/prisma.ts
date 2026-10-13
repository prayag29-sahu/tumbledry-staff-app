import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });
}

// In development, reuse the client across hot reloads to avoid exhausting connections
export const prisma =
  process.env['NODE_ENV'] === 'production'
    ? createPrismaClient()
    : (global.__prisma ?? (global.__prisma = createPrismaClient()));

// Log slow queries in development
if (process.env['NODE_ENV'] !== 'production') {
  prisma.$on('query' as never, (e: { duration: number; query: string }) => {
    if (e.duration > 100) {
      logger.debug('[DB] Slow query', { duration: e.duration, query: e.query });
    }
  });
}

prisma.$on('error' as never, (e: { message: string }) => {
  logger.error('[DB] Prisma error', { message: e.message });
});

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
