import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateTaskInputSchema, UpdateTaskInputSchema } from '@breaklog/shared';
import { prisma } from '../db.js';
import { authenticate } from '../lib/auth.js';
import { toTaskDto } from '../lib/dto.js';
import { Forbidden, NotFound } from '../errors.js';

const ProjectIdParams = z.object({ id: z.string().min(1) });
const TaskIdParams = z.object({ taskId: z.string().min(1) });

export async function registerTaskRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/projects/:id/tasks', async (request) => {
    const viewer = await authenticate(request);
    const { id } = ProjectIdParams.parse(request.params);

    const project = await prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: { assignments: { select: { userId: true } } },
    });
    if (!project) throw NotFound('Project not found');
    if (viewer.role !== 'ADMIN' && !project.assignments.some((a) => a.userId === viewer.id)) {
      throw Forbidden('You do not have access to this project');
    }

    const tasks = await prisma.task.findMany({
      where: { projectId: id, deletedAt: null },
      include: { assignments: { select: { userId: true } } },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    return { tasks: tasks.map(toTaskDto) };
  });

  app.post<{ Params: { id: string } }>('/projects/:id/tasks', async (request) => {
    const viewer = await authenticate(request);
    if (viewer.role !== 'ADMIN') throw Forbidden('Admin role required');
    const { id } = ProjectIdParams.parse(request.params);
    const input = CreateTaskInputSchema.parse(request.body);

    const project = await prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: { assignments: { select: { userId: true } } },
    });
    if (!project) throw NotFound('Project not found');

    // Copy parent project's assignees at creation time (not derived).
    const inheritedAssignees = project.assignments.map((a) => ({ userId: a.userId }));

    const task = await prisma.task.create({
      data: {
        projectId: id,
        name: input.name,
        estimatedMinutes: input.estimatedMinutes,
        originalEstimatedMinutes: input.estimatedMinutes,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        assignments: { create: inheritedAssignees },
      },
      include: { assignments: { select: { userId: true } } },
    });
    return { task: toTaskDto(task) };
  });

  app.patch<{ Params: { taskId: string } }>('/tasks/:taskId', async (request) => {
    const viewer = await authenticate(request);
    if (viewer.role !== 'ADMIN') throw Forbidden('Admin role required');
    const { taskId } = TaskIdParams.parse(request.params);
    const input = UpdateTaskInputSchema.parse(request.body);

    const existing = await prisma.task.findFirst({ where: { id: taskId, deletedAt: null } });
    if (!existing) throw NotFound('Task not found');

    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.estimatedMinutes !== undefined && { estimatedMinutes: input.estimatedMinutes }),
        ...(input.dueAt !== undefined && {
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
        }),
        ...(input.status !== undefined && { status: input.status }),
      },
      include: { assignments: { select: { userId: true } } },
    });
    return { task: toTaskDto(task) };
  });

  app.delete<{ Params: { taskId: string } }>('/tasks/:taskId', async (request) => {
    const viewer = await authenticate(request);
    if (viewer.role !== 'ADMIN') throw Forbidden('Admin role required');
    const { taskId } = TaskIdParams.parse(request.params);

    const existing = await prisma.task.findFirst({ where: { id: taskId, deletedAt: null } });
    if (!existing) throw NotFound('Task not found');

    await prisma.task.update({ where: { id: taskId }, data: { deletedAt: new Date() } });
    return { ok: true };
  });
}
