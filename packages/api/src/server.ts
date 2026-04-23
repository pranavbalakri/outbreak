import { buildApp } from './app.js';
import { loadEnv } from './env.js';
import { prisma } from './db.js';

async function main() {
  const env = loadEnv();
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down');
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err, 'Failed to start server');
    process.exit(1);
  }
}

void main();
