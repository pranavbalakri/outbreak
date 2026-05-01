import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  CreateManualTimeEntryInputSchema,
  TimeEntryListFiltersSchema,
  UpdateTimeEntryInputSchema,
} from '@breaklog/shared';
import { prisma } from '../db.js';
import { authenticate } from '../lib/auth.js';
import { toTimeEntryDto } from '../lib/dto.js';
import { Conflict, Forbidden, NotFound } from '../errors.js';
import { isoWeekParts } from '../lib/isoWeek.js';

const IdParams = z.object({ id: z.string().min(1) });

async function assertWeekNotLocked(date: Date): Promise<void> {
  const { year, week } = isoWeekParts(date);
  const lock = await prisma.weekLock.findUnique({
    where: { isoYear_isoWeek: { isoYear: year, isoWeek: week } },
  });
  if (lock) {
    throw Conflict(
      'week_locked',
      `ISO week ${year}-W${String(week).padStart(2, '0')} is locked; edits are not permitted.`,
    );
  }
}

async function validateProjectAndTask(projectId?: string | null, taskId?: string | null) {
  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
    });
    if (!project) throw NotFound('Project not found');
  }
  if (taskId) {
    if (!projectId) {
      throw Conflict('task_without_project', 'taskId requires projectId');
    }
    const task = await prisma.task.findFirst({ where: { id: taskId, deletedAt: null } });
    if (!task) throw NotFound('Task not found');
    if (task.projectId !== projectId) {
      throw Conflict('task_project_mismatch', 'Task does not belong to the specified project');
    }
  }
}

export async function registerTimeEntryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/time-entries', async (request) => {
    const viewer = await authenticate(request);
    const filters = TimeEntryListFiltersSchema.parse(request.query);

    const where: Prisma.TimeEntryWhereInput = { deletedAt: null };

    if (viewer.role === 'ADMIN') {
      if (filters.userId) where.userId = filters.userId;
    } else {
      // Instructors see only their own.
      where.userId = viewer.id;
    }

    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.taskId) where.taskId = filters.taskId;
    if (filters.isBillable !== undefined) where.isBillable = filters.isBillable;
    if (filters.unassigned) where.projectId = null;

    if (filters.from || filters.to) {
      where.startedAt = {};
      if (filters.from) where.startedAt.gte = new Date(filters.from);
      if (filters.to) where.startedAt.lt = new Date(filters.to);
    }

    const entries = await prisma.timeEntry.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: 500,
      include: { user: { select: { id: true, name: true } } },
    });
    return { entries: entries.map(toTimeEntryDto) };
  });

  app.post('/time-entries', async (request) => {
    const viewer = await authenticate(request);
    const input = CreateManualTimeEntryInputSchema.parse(request.body);

    const startedAt = new Date(input.startedAt);
    const endedAt = new Date(input.endedAt);
    await assertWeekNotLocked(startedAt);
    await validateProjectAndTask(input.projectId, input.taskId);

    const entry = await prisma.timeEntry.create({
      data: {
        userId: viewer.id,
        projectId: input.projectId ?? null,
        taskId: input.taskId ?? null,
        startedAt,
        endedAt,
        description: input.description ?? null,
        isBillable: input.isBillable,
        rateCentsAtEntry: viewer.currentRateCents,
        source: 'MANUAL',
      },
    });
    return { entry: toTimeEntryDto(entry) };
  });

  app.patch<{ Params: { id: string } }>('/time-entries/:id', async (request) => {
    const viewer = await authenticate(request);
    const { id } = IdParams.parse(request.params);
    const input = UpdateTimeEntryInputSchema.parse(request.body);

    const existing = await prisma.timeEntry.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw NotFound('Time entry not found');
    if (viewer.role !== 'ADMIN' && existing.userId !== viewer.id) {
      throw Forbidden('You can only edit your own entries');
    }

    // Lock check applies to both the old date and any new date.
    await assertWeekNotLocked(existing.startedAt);
    if (input.startedAt) {
      await assertWeekNotLocked(new Date(input.startedAt));
    }

    const nextProjectId =
      input.projectId === undefined ? existing.projectId : input.projectId;
    const nextTaskId =
      input.taskId === undefined ? existing.taskId : input.taskId;
    // If changing project to null, also null task.
    const finalTaskId = nextProjectId === null ? null : nextTaskId;
    await validateProjectAndTask(nextProjectId, finalTaskId);

    // End > start invariant check (Zod only validates when both provided).
    const finalStart = input.startedAt ? new Date(input.startedAt) : existing.startedAt;
    const finalEnd = input.endedAt ? new Date(input.endedAt) : existing.endedAt;
    if (finalEnd && finalEnd.getTime() <= finalStart.getTime()) {
      throw Conflict('invalid_range', 'endedAt must be after startedAt');
    }

    const entry = await prisma.timeEntry.update({
      where: { id },
      data: {
        ...(input.projectId !== undefined && { projectId: input.projectId }),
        ...(nextProjectId === null && input.projectId !== undefined && { taskId: null }),
        ...(input.taskId !== undefined && nextProjectId !== null && { taskId: input.taskId }),
        ...(input.startedAt !== undefined && { startedAt: finalStart }),
        ...(input.endedAt !== undefined && { endedAt: finalEnd }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.isBillable !== undefined && { isBillable: input.isBillable }),
      },
    });
    return { entry: toTimeEntryDto(entry) };
  });

  app.delete<{ Params: { id: string } }>('/time-entries/:id', async (request) => {
    const viewer = await authenticate(request);
    const { id } = IdParams.parse(request.params);

    const existing = await prisma.timeEntry.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw NotFound('Time entry not found');
    if (viewer.role !== 'ADMIN' && existing.userId !== viewer.id) {
      throw Forbidden('You can only delete your own entries');
    }
    await assertWeekNotLocked(existing.startedAt);

    await prisma.timeEntry.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  });
}
