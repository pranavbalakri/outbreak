import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  CreateProjectInputSchema,
  ProjectListFiltersSchema,
  UpcomingProjectFiltersSchema,
  UpdateProjectInputSchema,
} from '@breaklog/shared';
import { prisma } from '../db.js';
import { authenticate } from '../lib/auth.js';
import { toProjectDto } from '../lib/dto.js';
import { notify, notifyMany } from '../lib/notifications.js';
import { Conflict, Forbidden, NotFound } from '../errors.js';

const IdParams = z.object({ id: z.string().min(1) });
const ProjectAssigneeParams = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
});
const ProjectTagParams = z.object({
  id: z.string().min(1),
  tagId: z.string().min(1),
});
const AssigneeBody = z.object({ userId: z.string().min(1) });
const TagBody = z.object({ tagId: z.string().min(1) });

// One SQL round-trip per request: sums completed time-entry durations grouped
// by project. Used by both list and detail endpoints so the folder view can
// render estimate-vs-actual progress bars without N+1.
async function actualsForProjects(projectIds: string[]): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ project_id: string; minutes: number }[]>`
    SELECT project_id,
           COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60.0), 0)::float AS minutes
    FROM time_entries
    WHERE project_id IN (${Prisma.join(projectIds)})
      AND ended_at IS NOT NULL
      AND deleted_at IS NULL
    GROUP BY project_id
  `;
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.project_id, Math.round(r.minutes));
  return out;
}

async function ensureVisible(projectId: string, viewerId: string, isAdmin: boolean) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: {
      assignments: { select: { userId: true, user: { select: { id: true, name: true } } } },
      projectTags: { select: { tagId: true } },
    },
  });
  if (!project) throw NotFound('Project not found');
  if (!isAdmin && !project.assignments.some((a) => a.userId === viewerId)) {
    throw Forbidden('You do not have access to this project');
  }
  return project;
}

export async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/projects', async (request) => {
    const viewer = await authenticate(request);
    const filters = ProjectListFiltersSchema.parse(request.query);

    const where: Prisma.ProjectWhereInput = { deletedAt: null };
    if (filters.folderId) where.folderId = filters.folderId;
    if (filters.status) where.status = filters.status;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.tagId) where.projectTags = { some: { tagId: filters.tagId } };
    if (filters.dueBefore) where.dueAt = { lte: new Date(filters.dueBefore) };

    if (viewer.role !== 'ADMIN') {
      where.assignments = { some: { userId: viewer.id } };
    } else if (filters.assigneeId) {
      where.assignments = { some: { userId: filters.assigneeId } };
    }

    const projects = await prisma.project.findMany({
      where,
      include: {
        assignments: { select: { userId: true, user: { select: { id: true, name: true } } } },
        projectTags: { select: { tagId: true } },
      },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    });

    const actuals = await actualsForProjects(projects.map((p) => p.id));

    return {
      projects: projects.map((p) =>
        toProjectDto(p, { actualMinutes: actuals.get(p.id) ?? 0 }),
      ),
    };
  });

  // Registered BEFORE /projects/:id so Fastify's router matches the literal first.
  app.get('/projects/upcoming', async (request) => {
    const viewer = await authenticate(request);
    const filters = UpcomingProjectFiltersSchema.parse(request.query);

    const where: Prisma.ProjectWhereInput = {
      deletedAt: null,
      dueAt: { not: null },
      status: { notIn: ['COMPLETE', 'ARCHIVED'] },
    };
    if (filters.folderId) where.folderId = filters.folderId;

    if (viewer.role !== 'ADMIN') {
      where.assignments = { some: { userId: viewer.id } };
    } else if (filters.assigneeId) {
      where.assignments = { some: { userId: filters.assigneeId } };
    }

    const projects = await prisma.project.findMany({
      where,
      include: {
        assignments: { select: { userId: true, user: { select: { id: true, name: true } } } },
        projectTags: { select: { tagId: true } },
      },
      orderBy: { dueAt: 'asc' },
    });

    const actuals = await actualsForProjects(projects.map((p) => p.id));
    const now = Date.now();

    return {
      projects: projects.map((p) => {
        const dto = toProjectDto(p, { actualMinutes: actuals.get(p.id) ?? 0 });
        return {
          ...dto,
          dueAt: p.dueAt!.toISOString(),
          isOverdue: p.dueAt!.getTime() < now,
        };
      }),
    };
  });

  app.get<{ Params: { id: string } }>('/projects/:id', async (request) => {
    const viewer = await authenticate(request);
    const { id } = IdParams.parse(request.params);
    const project = await ensureVisible(id, viewer.id, viewer.role === 'ADMIN');

    const actuals = await actualsForProjects([id]);
    return {
      project: toProjectDto(project, { actualMinutes: actuals.get(id) ?? 0 }),
    };
  });

  app.post('/projects', async (request) => {
    const viewer = await authenticate(request);
    if (viewer.role !== 'ADMIN') throw Forbidden('Admin role required');
    const input = CreateProjectInputSchema.parse(request.body);

    const folder = await prisma.folder.findFirst({
      where: { id: input.folderId, deletedAt: null },
    });
    if (!folder) throw NotFound('Folder not found');

    if (input.assigneeIds.length > 0) {
      const validUsers = await prisma.user.count({
        where: { id: { in: input.assigneeIds }, deletedAt: null },
      });
      if (validUsers !== input.assigneeIds.length) {
        throw Conflict('invalid_assignee', 'One or more assignees are invalid');
      }
    }
    if (input.tagIds.length > 0) {
      const validTags = await prisma.tag.count({
        where: { id: { in: input.tagIds }, deletedAt: null },
      });
      if (validTags !== input.tagIds.length) {
        throw Conflict('invalid_tag', 'One or more tags are invalid');
      }
    }

    const project = await prisma.project.create({
      data: {
        folderId: input.folderId,
        name: input.name,
        description: input.description ?? null,
        estimatedMinutes: input.estimatedMinutes,
        originalEstimatedMinutes: input.estimatedMinutes,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        createdByUserId: viewer.id,
        assignments: { create: input.assigneeIds.map((userId) => ({ userId })) },
        projectTags: { create: input.tagIds.map((tagId) => ({ tagId })) },
      },
      include: {
        assignments: { select: { userId: true, user: { select: { id: true, name: true } } } },
        projectTags: { select: { tagId: true } },
      },
    });

    // Notify every initial assignee except the creator (they already know).
    const notifyIds = input.assigneeIds.filter((id) => id !== viewer.id);
    await notifyMany(notifyIds, 'project.assigned', {
      projectId: project.id,
      projectName: project.name,
      assignedBy: viewer.id,
    });

    return { project: toProjectDto(project) };
  });

  app.patch<{ Params: { id: string } }>('/projects/:id', async (request) => {
    const viewer = await authenticate(request);
    if (viewer.role !== 'ADMIN') throw Forbidden('Admin role required');
    const { id } = IdParams.parse(request.params);
    const input = UpdateProjectInputSchema.parse(request.body);

    const existing = await prisma.project.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw NotFound('Project not found');

    if (input.folderId) {
      const folder = await prisma.folder.findFirst({
        where: { id: input.folderId, deletedAt: null },
      });
      if (!folder) throw NotFound('Folder not found');
    }

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(input.folderId !== undefined && { folderId: input.folderId }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.estimatedMinutes !== undefined && { estimatedMinutes: input.estimatedMinutes }),
        ...(input.dueAt !== undefined && {
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
        }),
        ...(input.status !== undefined && { status: input.status }),
      },
      include: {
        assignments: { select: { userId: true, user: { select: { id: true, name: true } } } },
        projectTags: { select: { tagId: true } },
      },
    });
    return { project: toProjectDto(project) };
  });

  app.delete<{ Params: { id: string } }>('/projects/:id', async (request) => {
    const viewer = await authenticate(request);
    if (viewer.role !== 'ADMIN') throw Forbidden('Admin role required');
    const { id } = IdParams.parse(request.params);

    const existing = await prisma.project.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw NotFound('Project not found');

    await prisma.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  });

  // Assignees
  app.post<{ Params: { id: string } }>('/projects/:id/assignees', async (request) => {
    const viewer = await authenticate(request);
    if (viewer.role !== 'ADMIN') throw Forbidden('Admin role required');
    const { id } = IdParams.parse(request.params);
    const { userId } = AssigneeBody.parse(request.body);

    const project = await prisma.project.findFirst({ where: { id, deletedAt: null } });
    if (!project) throw NotFound('Project not found');
    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw NotFound('User not found');

    const existing = await prisma.projectAssignment.findUnique({
      where: { projectId_userId: { projectId: id, userId } },
    });
    await prisma.projectAssignment.upsert({
      where: { projectId_userId: { projectId: id, userId } },
      create: { projectId: id, userId },
      update: {},
    });
    // Only notify on the first attach so repeated upserts don't spam.
    if (!existing && userId !== viewer.id) {
      await notify(userId, 'project.assigned', {
        projectId: id,
        projectName: project.name,
        assignedBy: viewer.id,
      });
    }
    return { ok: true };
  });

  app.delete<{ Params: { id: string; userId: string } }>(
    '/projects/:id/assignees/:userId',
    async (request) => {
      const viewer = await authenticate(request);
      if (viewer.role !== 'ADMIN') throw Forbidden('Admin role required');
      const { id, userId } = ProjectAssigneeParams.parse(request.params);

      await prisma.projectAssignment.deleteMany({ where: { projectId: id, userId } });
      return { ok: true };
    },
  );

  // Tags
  app.post<{ Params: { id: string } }>('/projects/:id/tags', async (request) => {
    const viewer = await authenticate(request);
    if (viewer.role !== 'ADMIN') throw Forbidden('Admin role required');
    const { id } = IdParams.parse(request.params);
    const { tagId } = TagBody.parse(request.body);

    const project = await prisma.project.findFirst({ where: { id, deletedAt: null } });
    if (!project) throw NotFound('Project not found');
    const tag = await prisma.tag.findFirst({ where: { id: tagId, deletedAt: null } });
    if (!tag) throw NotFound('Tag not found');

    await prisma.projectTag.upsert({
      where: { projectId_tagId: { projectId: id, tagId } },
      create: { projectId: id, tagId },
      update: {},
    });
    return { ok: true };
  });

  app.delete<{ Params: { id: string; tagId: string } }>(
    '/projects/:id/tags/:tagId',
    async (request) => {
      const viewer = await authenticate(request);
      if (viewer.role !== 'ADMIN') throw Forbidden('Admin role required');
      const { id, tagId } = ProjectTagParams.parse(request.params);
      await prisma.projectTag.deleteMany({ where: { projectId: id, tagId } });
      return { ok: true };
    },
  );
}
