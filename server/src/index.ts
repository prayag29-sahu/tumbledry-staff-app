import { app } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma, disconnectDb } from './db/prisma';

const PORT = env.PORT;

async function start(): Promise<void> {
  // Validate DB connection on startup
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('[DB] Database connection established.');
  } catch (err) {
    logger.error('[DB] Failed to connect to database on startup', { error: String(err) });
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info(`[SERVER] Tumbledry API running on port ${PORT}`, {
      env: env.NODE_ENV,
      port: PORT,
    });
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`[SERVER] Received ${signal}. Shutting down...`);
    server.close(async () => {
      await disconnectDb();
      logger.info('[SERVER] Server closed cleanly.');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('[SERVER] Shutdown timeout — forcing exit.');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error('[SERVER] Uncaught exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('[SERVER] Unhandled rejection', { reason: String(reason) });
    process.exit(1);
  });
}

start().catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});
