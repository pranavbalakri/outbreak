import type { FastifyInstance } from 'fastify';
import { StartTimerInputSchema } from '@outbreak/shared';
import { prisma } from '../db.js';
import { authenticate } from '../lib/auth.js';
import { toTimeEntryDto } from '../lib/dto.js';
import { Conflict, Forbidden, NotFound } from '../errors.js';
import { isoWeekParts } from '../lib/isoWeek.js';
import { broadcastToUser } from '../lib/realtime.js';

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

async function assertProjectAccess(
  projectId: string | null | undefined,
  taskId: string | null | undefined,
  viewer: { id: string; role: 'ADMIN' | 'INSTRUCTOR' },
) {
  if (!projectId) {
    if (taskId) throw Conflict('task_without_project', 'taskId requires projectId');
    return;
  }
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { assignments: { select: { userId: true } } },
  });
  if (!project) throw NotFound('Project not found');
  if (viewer.role !== 'ADMIN' && !project.assignments.some((a) => a.userId === viewer.id)) {
    throw Forbidden('You are not assigned to this project');
  }
  if (taskId) {
    const task = await prisma.task.findFirst({ where: { id: taskId, deletedAt: null } });
    if (!task) throw NotFound('Task not found');
    if (task.projectId !== projectId) {
      throw Conflict('task_project_mismatch', 'Task does not belong to the specified project');
    }
  }
}

export async function registerTimerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/timer/current', async (request) => {
    const viewer = await authenticate(request);
    const entry = await prisma.timeEntry.findFirst({
      where: { userId: viewer.id, endedAt: null, deletedAt: null },
    });
    return { entry: entry ? toTimeEntryDto(entry) : null };
  });

  app.post('/timer/start', async (request) => {
    const viewer = await authenticate(request);
    const input = StartTimerInputSchema.parse(request.body ?? {});

    await assertProjectAccess(input.projectId, input.taskId, {
      id: viewer.id,
      role: viewer.role,
    });

    const now = new Date();
    await assertWeekNotLocked(now);

    const { started, stopped } = await prisma.$transaction(async (tx) => {
      // Stop any existing running timer for this user.
      const active = await tx.timeEntry.findFirst({
        where: { userId: viewer.id, endedAt: null, deletedAt: null },
      });
      let stoppedEntry = null as Awaited<ReturnType<typeof tx.timeEntry.update>> | null;
      if (active) {
        if (active.startedAt.getTime() >= now.getTime()) {
          // Degenerate: clock skew or rapid duplicate. Bump by 1ms so CHECK passes.
          stoppedEntry = await tx.timeEntry.update({
            where: { id: active.id },
            data: { endedAt: new Date(active.startedAt.getTime() + 1) },
          });
        } else {
          stoppedEntry = await tx.timeEntry.update({
            where: { id: active.id },
            data: { endedAt: now },
          });
        }
      }

      const createdEntry = await tx.timeEntry.create({
        data: {
          userId: viewer.id,
          projectId: input.projectId ?? null,
          taskId: input.projectId ? (input.taskId ?? null) : null,
          startedAt: now,
          endedAt: null,
          description: input.description ?? null,
          isBillable: true,
          rateCentsAtEntry: viewer.currentRateCents,
          source: input.source,
        },
      });

      return { started: createdEntry, stopped: stoppedEntry };
    });

    if (stopped) {
      broadcastToUser(viewer.id, {
        type: 'timer.stopped',
        entry: null,
        stoppedEntry: toTimeEntryDto(stopped),
      });
    }
    broadcastToUser(viewer.id, {
      type: 'timer.started',
      entry: toTimeEntryDto(started),
    });

    return {
      entry: toTimeEntryDto(started),
      stoppedEntry: stopped ? toTimeEntryDto(stopped) : null,
    };
  });

  app.post('/timer/stop', async (request) => {
    const viewer = await authenticate(request);

    const active = await prisma.timeEntry.findFirst({
      where: { userId: viewer.id, endedAt: null, deletedAt: null },
    });
    if (!active) throw NotFound('No timer is currently running');

    await assertWeekNotLocked(active.startedAt);

    const now = new Date();
    const endedAt =
      active.startedAt.getTime() >= now.getTime()
        ? new Date(active.startedAt.getTime() + 1)
        : now;

    const stopped = await prisma.timeEntry.update({
      where: { id: active.id },
      data: { endedAt },
    });

    broadcastToUser(viewer.id, {
      type: 'timer.stopped',
      entry: null,
      stoppedEntry: toTimeEntryDto(stopped),
    });

    return { entry: toTimeEntryDto(stopped) };
  });
}
