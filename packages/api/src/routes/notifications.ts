import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate } from '../lib/auth.js';
import { NotFound } from '../errors.js';

const IdParams = z.object({ id: z.string().min(1) });
const ListQuery = z.object({
  unread: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/notifications', async (request) => {
    const viewer = await authenticate(request);
    const { unread, limit } = ListQuery.parse(request.query);

    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: {
          userId: viewer.id,
          ...(unread ? { readAt: null } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.notification.count({
        where: { userId: viewer.id, readAt: null },
      }),
    ]);

    return {
      unreadCount,
      notifications: rows.map((n) => ({
        id: n.id,
        kind: n.kind,
        payload: n.payload ?? {},
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  });

  app.post<{ Params: { id: string } }>('/notifications/:id/read', async (request) => {
    const viewer = await authenticate(request);
    const { id } = IdParams.parse(request.params);
    const n = await prisma.notification.findFirst({
      where: { id, userId: viewer.id },
    });
    if (!n) throw NotFound('Notification not found');
    if (!n.readAt) {
      await prisma.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });
    }
    return { ok: true };
  });

  app.post('/notifications/read-all', async (request) => {
    const viewer = await authenticate(request);
    const { count } = await prisma.notification.updateMany({
      where: { userId: viewer.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  });
}
