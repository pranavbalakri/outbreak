import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { loadEnv } from '../env.js';
import { Forbidden, BadRequest } from '../errors.js';

const QuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

const COLUMNS = [
  'id',
  'started_at',
  'ended_at',
  'duration_minutes',
  'user_id',
  'user_name',
  'user_email',
  'project_id',
  'project_name',
  'folder_id',
  'folder_name',
  'task_id',
  'task_name',
  'description',
  'is_billable',
  'rate_cents_at_entry',
  'source',
  'created_at',
] as const;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function registerExportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/exports/time-entries.csv', async (request, reply) => {
    const env = loadEnv();
    if (!env.EXPORT_SECRET) {
      throw Forbidden('Export endpoint is not configured', 'export_disabled');
    }
    const provided = request.headers['x-export-secret'];
    if (typeof provided !== 'string' || provided !== env.EXPORT_SECRET) {
      throw Forbidden('Invalid or missing export secret', 'invalid_export_secret');
    }

    const parsed = QuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw BadRequest('invalid_range', 'from and to must be ISO datetimes');
    }
    const { from, to } = parsed.data;
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (toDate <= fromDate) {
      throw BadRequest('invalid_range', 'to must be after from');
    }

    const entries = await prisma.timeEntry.findMany({
      where: {
        deletedAt: null,
        startedAt: { gte: fromDate, lt: toDate },
      },
      orderBy: { startedAt: 'asc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: {
          select: {
            id: true,
            name: true,
            folder: { select: { id: true, name: true } },
          },
        },
        task: { select: { id: true, name: true } },
      },
    });

    const rows: string[] = [COLUMNS.join(',')];
    for (const e of entries) {
      const durationMinutes = e.endedAt
        ? Math.round((e.endedAt.getTime() - e.startedAt.getTime()) / 60_000)
        : '';
      rows.push(
        [
          e.id,
          e.startedAt.toISOString(),
          e.endedAt?.toISOString() ?? '',
          durationMinutes,
          e.userId,
          e.user.name,
          e.user.email,
          e.projectId ?? '',
          e.project?.name ?? '',
          e.project?.folder?.id ?? '',
          e.project?.folder?.name ?? '',
          e.taskId ?? '',
          e.task?.name ?? '',
          e.description ?? '',
          e.isBillable ? 'true' : 'false',
          e.rateCentsAtEntry,
          e.source,
          e.createdAt.toISOString(),
        ]
          .map(csvCell)
          .join(','),
      );
    }

    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header(
        'Content-Disposition',
        `attachment; filename="time-entries-${from.slice(0, 10)}_${to.slice(0, 10)}.csv"`,
      );
    return rows.join('\n') + '\n';
  });
}
