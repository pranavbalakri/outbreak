import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateFeedbackInputSchema } from '@outbreak/shared';
import { prisma } from '../db.js';
import { authenticate, requireAdmin } from '../lib/auth.js';
import { NotFound } from '../errors.js';

const IdParams = z.object({ id: z.string().min(1) });
const ListQuery = z.object({
  includeResolved: z.enum(['true', 'false']).optional(),
});
const UpdateBody = z.object({ resolved: z.boolean() });

export async function registerFeedbackRoutes(app: FastifyInstance): Promise<void> {
  app.post('/feedback', async (request) => {
    const viewer = await authenticate(request);
    const input = CreateFeedbackInputSchema.parse(request.body);
    const row = await prisma.feedback.create({
      data: {
        userId: viewer.id,
        message: input.message,
        pageUrl: input.pageUrl ?? null,
      },
    });
    return { feedback: { id: row.id, createdAt: row.createdAt.toISOString() } };
  });

  app.get('/feedback', { preHandler: requireAdmin }, async (request) => {
    const { includeResolved } = ListQuery.parse(request.query);
    const rows = await prisma.feedback.findMany({
      where: includeResolved === 'true' ? {} : { resolvedAt: null },
      orderBy: [{ resolvedAt: 'asc' }, { createdAt: 'desc' }],
      include: { user: { select: { name: true, email: true } } },
      take: 500,
    });
    return {
      feedback: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.user.name,
        userEmail: r.user.email,
        message: r.message,
        pageUrl: r.pageUrl,
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  });

  app.patch<{ Params: { id: string } }>(
    '/feedback/:id',
    { preHandler: requireAdmin },
    async (request) => {
      const { id } = IdParams.parse(request.params);
      const { resolved } = UpdateBody.parse(request.body);
      const existing = await prisma.feedback.findUnique({ where: { id } });
      if (!existing) throw NotFound('Feedback not found');
      const row = await prisma.feedback.update({
        where: { id },
        data: { resolvedAt: resolved ? new Date() : null },
      });
      return { id: row.id, resolvedAt: row.resolvedAt?.toISOString() ?? null };
    },
  );
}
