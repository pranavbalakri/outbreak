import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateFolderInputSchema, UpdateFolderInputSchema } from '@outbreak/shared';
import { prisma } from '../db.js';
import { requireAdmin, requireUser } from '../lib/auth.js';
import { toFolderDto } from '../lib/dto.js';
import { Conflict, NotFound } from '../errors.js';

const IdParams = z.object({ id: z.string().min(1) });

export async function registerFolderRoutes(app: FastifyInstance): Promise<void> {
  app.get('/folders', { preHandler: requireUser }, async () => {
    const folders = await prisma.folder.findMany({
      where: { deletedAt: null },
      orderBy: [{ archivedAt: 'asc' }, { name: 'asc' }],
    });
    return { folders: folders.map(toFolderDto) };
  });

  app.post('/folders', { preHandler: requireAdmin }, async (request) => {
    const input = CreateFolderInputSchema.parse(request.body);
    const folder = await prisma.folder.create({
      data: { name: input.name, color: input.color ?? null },
    });
    return { folder: toFolderDto(folder) };
  });

  app.patch<{ Params: { id: string } }>(
    '/folders/:id',
    { preHandler: requireAdmin },
    async (request) => {
      const { id } = IdParams.parse(request.params);
      const input = UpdateFolderInputSchema.parse(request.body);
      const existing = await prisma.folder.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw NotFound('Folder not found');

      const folder = await prisma.folder.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.color !== undefined && { color: input.color }),
          ...(input.archived !== undefined && {
            archivedAt: input.archived ? new Date() : null,
          }),
        },
      });
      return { folder: toFolderDto(folder) };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/folders/:id',
    { preHandler: requireAdmin },
    async (request) => {
      const { id } = IdParams.parse(request.params);
      const existing = await prisma.folder.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw NotFound('Folder not found');

      const activeProjects = await prisma.project.count({
        where: { folderId: id, deletedAt: null },
      });
      if (activeProjects > 0) {
        throw Conflict(
          'folder_not_empty',
          `Folder contains ${activeProjects} active project(s). Move or delete them first.`,
        );
      }

      const folder = await prisma.folder.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      return { folder: toFolderDto(folder) };
    },
  );
}
