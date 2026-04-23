import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate } from '../lib/auth.js';
import { recordAudit } from '../lib/audit.js';
import { NotFound } from '../errors.js';

const IdParams = z.object({ id: z.string().min(1) });

export async function registerApiTokenRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api-tokens', async (request) => {
    const viewer = await authenticate(request);
    const tokens = await prisma.apiToken.findMany({
      where: { userId: viewer.id },
      orderBy: { createdAt: 'desc' },
    });
    return {
      tokens: tokens.map((t) => ({
        id: t.id,
        label: t.label,
        source: t.source,
        createdAt: t.createdAt.toISOString(),
        lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
        revokedAt: t.revokedAt?.toISOString() ?? null,
      })),
    };
  });

  app.delete<{ Params: { id: string } }>('/api-tokens/:id', async (request) => {
    const viewer = await authenticate(request);
    const { id } = IdParams.parse(request.params);
    const token = await prisma.apiToken.findFirst({
      where: { id, userId: viewer.id },
    });
    if (!token) throw NotFound('Token not found');
    if (token.revokedAt) return { ok: true };

    await prisma.$transaction(async (tx) => {
      await tx.apiToken.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      await recordAudit('token.revoke', {
        actorId: viewer.id,
        targetType: 'api_token',
        targetId: id,
        payload: { source: token.source, label: token.label },
        tx,
      });
    });

    return { ok: true };
  });
}
