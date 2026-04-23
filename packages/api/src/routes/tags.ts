import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateTagInputSchema } from '@outbreak/shared';
import { prisma } from '../db.js';
import { requireAdmin, requireUser } from '../lib/auth.js';
import { toTagDto } from '../lib/dto.js';
import { Conflict, NotFound } from '../errors.js';

const IdParams = z.object({ id: z.string().min(1) });

export async function registerTagRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tags', { preHandler: requireUser }, async () => {
    const tags = await prisma.tag.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return { tags: tags.map(toTagDto) };
  });

  app.post('/tags', { preHandler: requireAdmin }, async (request) => {
    const input = CreateTagInputSchema.parse(request.body);
    const existing = await prisma.tag.findUnique({ where: { name: input.name } });
    if (existing && !existing.deletedAt) {
      throw Conflict('tag_exists', 'Tag with this name already exists');
    }
    const tag = existing
      ? await prisma.tag.update({ where: { id: existing.id }, data: { deletedAt: null } })
      : await prisma.tag.create({ data: { name: input.name } });
    return { tag: toTagDto(tag) };
  });

  app.delete<{ Params: { id: string } }>(
    '/tags/:id',
    { preHandler: requireAdmin },
    async (request) => {
      const { id } = IdParams.parse(request.params);
      const existing = await prisma.tag.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw NotFound('Tag not found');

      await prisma.tag.update({ where: { id }, data: { deletedAt: new Date() } });
      return { ok: true };
    },
  );
}
