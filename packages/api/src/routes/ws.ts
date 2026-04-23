import type { FastifyInstance } from 'fastify';
import { SESSION_CONFIG, verifySession } from '../lib/session.js';
import { prisma } from '../db.js';
import { registerSocket } from '../lib/realtime.js';

export async function registerWebSocketRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ws', { websocket: true }, async (socket, request) => {
    const token = request.cookies[SESSION_CONFIG.cookieName];
    if (!token) {
      socket.send(JSON.stringify({ type: 'error', code: 'unauthorized' }));
      socket.close(1008, 'unauthorized');
      return;
    }

    const payload = await verifySession(token);
    if (!payload) {
      socket.send(JSON.stringify({ type: 'error', code: 'invalid_session' }));
      socket.close(1008, 'invalid_session');
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.deletedAt || !user.isActive) {
      socket.send(JSON.stringify({ type: 'error', code: 'account_inactive' }));
      socket.close(1008, 'account_inactive');
      return;
    }

    registerSocket(user.id, socket);
    socket.send(JSON.stringify({ type: 'ready', userId: user.id }));

    // Keepalive — pong back if the client pings, plus a server-side heartbeat.
    const ping = setInterval(() => {
      if (socket.readyState === 1) socket.ping();
    }, 25_000);
    socket.on('close', () => clearInterval(ping));
  });
}
