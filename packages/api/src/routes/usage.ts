import type { FastifyInstance } from 'fastify';
import type { TimeEntrySource } from '@prisma/client';
import { z } from 'zod';
import type { UsageSummary } from '@breaklog/shared';
import { prisma } from '../db.js';
import { requireAdmin } from '../lib/auth.js';

const QuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const SOURCES: TimeEntrySource[] = ['WEB', 'EXTENSION', 'MANUAL'];

export async function registerUsageRoutes(app: FastifyInstance): Promise<void> {
  // Weekly count of time entries by source — surfaces "are instructors actually
  // using the extension?" (spec §3.3). Admin-only.
  app.get('/reports/usage', { preHandler: requireAdmin }, async (request) => {
    const q = QuerySchema.parse(request.query);
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from
      ? new Date(q.from)
      : new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);

    const rows = await prisma.$queryRaw<
      { iso_year: number; iso_week: number; source: TimeEntrySource; count: bigint }[]
    >`
      SELECT EXTRACT(ISOYEAR FROM te.started_at)::int AS iso_year,
             EXTRACT(WEEK FROM te.started_at)::int    AS iso_week,
             te.source                                AS source,
             COUNT(*)                                 AS count
      FROM time_entries te
      WHERE te.deleted_at IS NULL
        AND te.started_at >= ${from}
        AND te.started_at < ${to}
      GROUP BY iso_year, iso_week, te.source
      ORDER BY iso_year ASC, iso_week ASC, te.source ASC
    `;

    const totals: Record<string, number> = {};
    for (const s of SOURCES) totals[s] = 0;

    const weeks = rows.map((r) => {
      const count = Number(r.count);
      totals[r.source] = (totals[r.source] ?? 0) + count;
      return {
        isoYear: r.iso_year,
        isoWeek: r.iso_week,
        source: r.source,
        count,
      };
    });

    const response: UsageSummary = {
      weeks,
      totalsBySource: totals as UsageSummary['totalsBySource'],
    };
    return response;
  });
}
