import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import websocket from '@fastify/websocket';
import { loadEnv } from './env.js';
import { registerErrorHandler } from './plugins/errorHandler.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerUserRoutes } from './routes/users.js';
import { registerFolderRoutes } from './routes/folders.js';
import { registerTagRoutes } from './routes/tags.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerTimeEntryRoutes } from './routes/timeEntries.js';
import { registerTimerRoutes } from './routes/timer.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerWeekRoutes } from './routes/weeks.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerApiTokenRoutes } from './routes/apiTokens.js';
import { registerWebSocketRoutes } from './routes/ws.js';
import { registerFeedbackRoutes } from './routes/feedback.js';
import { registerUsageRoutes } from './routes/usage.js';
import { initObservability } from './lib/observability.js';

export async function buildApp(): Promise<FastifyInstance> {
  const env = loadEnv();

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      ...(env.NODE_ENV !== 'production'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } } }
        : {}),
    },
    trustProxy: true,
    disableRequestLogging: env.NODE_ENV === 'production',
  });

  await app.register(sensible);
  await app.register(cookie, { secret: env.JWT_SECRET });
  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
  });
  await app.register(rateLimit, {
    global: false, // opt-in per route
  });
  await app.register(websocket);

  await initObservability(app);
  registerErrorHandler(app);
  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerUserRoutes(app);
  await registerFolderRoutes(app);
  await registerTagRoutes(app);
  await registerProjectRoutes(app);
  await registerTaskRoutes(app);
  await registerTimeEntryRoutes(app);
  await registerTimerRoutes(app);
  await registerReportRoutes(app);
  await registerWeekRoutes(app);
  await registerNotificationRoutes(app);
  await registerApiTokenRoutes(app);
  await registerWebSocketRoutes(app);
  await registerFeedbackRoutes(app);
  await registerUsageRoutes(app);

  return app;
}
