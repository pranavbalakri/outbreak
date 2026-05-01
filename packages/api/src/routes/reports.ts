import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  ReportDailyFiltersSchema,
  ReportProjectsFiltersSchema,
  ReportSummaryFiltersSchema,
  type ReportDailyResponse,
  type ReportProjectsResponse,
  type ReportSummaryResponse,
  type ReportSummaryRow,
} from '@breaklog/shared';
import { prisma } from '../db.js';
import { requireAdmin } from '../lib/auth.js';
import { renderReportPdf } from '../lib/reportPdf.js';
import { BadRequest } from '../errors.js';

const UNASSIGNED_KEY = 'unassigned';
const CURRENCY = 'USD';

interface RawAggRow {
  key: string | null;
  label: string | null;
  minutes: number;
  billable_minutes: number;
  cost_cents: number;
}

function parseRange(from: string, to: string): { fromDate: Date; toDate: Date } {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (!(fromDate < toDate)) throw BadRequest('invalid_range', '`from` must be before `to`');
  return { fromDate, toDate };
}

function buildBillableFilter(billable: boolean | undefined): Prisma.Sql {
  if (billable === undefined) return Prisma.sql``;
  return billable ? Prisma.sql`AND te.is_billable = TRUE` : Prisma.sql`AND te.is_billable = FALSE`;
}

function buildFolderFilter(folderId: string | undefined): Prisma.Sql {
  if (!folderId) return Prisma.sql``;
  // Unassigned entries pass through only if they have a project match — they won't, so filtering by folder drops unassigned.
  return Prisma.sql`AND p.folder_id = ${folderId}`;
}

function buildTagFilter(tagId: string | undefined): Prisma.Sql {
  if (!tagId) return Prisma.sql``;
  return Prisma.sql`AND EXISTS (
    SELECT 1 FROM project_tags pt WHERE pt.project_id = te.project_id AND pt.tag_id = ${tagId}
  )`;
}

function buildInstructorFilter(instructorId: string | undefined): Prisma.Sql {
  if (!instructorId) return Prisma.sql``;
  return Prisma.sql`AND te.user_id = ${instructorId}`;
}

async function summaryByInstructor(
  fromDate: Date,
  toDate: Date,
  billable: boolean | undefined,
  folderId: string | undefined,
  tagId: string | undefined,
  instructorId: string | undefined,
  includeUnassigned: boolean,
): Promise<ReportSummaryRow[]> {
  // When grouping by instructor, "unassigned" stays folded under each instructor — that's correct per spec.
  const rows = await prisma.$queryRaw<RawAggRow[]>`
    SELECT te.user_id AS key,
           u.name AS label,
           COALESCE(SUM(EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 60.0), 0)::float AS minutes,
           COALESCE(SUM(CASE WHEN te.is_billable THEN EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 60.0 ELSE 0 END), 0)::float AS billable_minutes,
           COALESCE(SUM(EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 3600.0 * te.rate_cents_at_entry), 0)::float AS cost_cents
    FROM time_entries te
    JOIN users u ON u.id = te.user_id
    LEFT JOIN projects p ON p.id = te.project_id
    WHERE te.deleted_at IS NULL
      AND te.ended_at IS NOT NULL
      AND te.started_at >= ${fromDate}
      AND te.started_at < ${toDate}
      ${buildBillableFilter(billable)}
      ${folderId ? Prisma.sql`AND p.folder_id = ${folderId}` : Prisma.sql``}
      ${buildTagFilter(tagId)}
      ${buildInstructorFilter(instructorId)}
      ${includeUnassigned ? Prisma.sql`` : Prisma.sql`AND te.project_id IS NOT NULL`}
    GROUP BY te.user_id, u.name
    ORDER BY minutes DESC
  `;
  return rows.map((r) => ({
    key: r.key ?? '',
    label: r.label ?? '(unknown)',
    minutes: Math.round(Number(r.minutes)),
    billableMinutes: Math.round(Number(r.billable_minutes)),
    costCents: Math.round(Number(r.cost_cents)),
  }));
}

async function summaryByProject(
  fromDate: Date,
  toDate: Date,
  billable: boolean | undefined,
  folderId: string | undefined,
  tagId: string | undefined,
  instructorId: string | undefined,
  includeUnassigned: boolean,
): Promise<ReportSummaryRow[]> {
  const rows = await prisma.$queryRaw<RawAggRow[]>`
    SELECT COALESCE(te.project_id, ${UNASSIGNED_KEY}) AS key,
           COALESCE(p.name, 'Unassigned') AS label,
           COALESCE(SUM(EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 60.0), 0)::float AS minutes,
           COALESCE(SUM(CASE WHEN te.is_billable THEN EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 60.0 ELSE 0 END), 0)::float AS billable_minutes,
           COALESCE(SUM(EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 3600.0 * te.rate_cents_at_entry), 0)::float AS cost_cents
    FROM time_entries te
    LEFT JOIN projects p ON p.id = te.project_id
    WHERE te.deleted_at IS NULL
      AND te.ended_at IS NOT NULL
      AND te.started_at >= ${fromDate}
      AND te.started_at < ${toDate}
      ${buildBillableFilter(billable)}
      ${folderId ? Prisma.sql`AND p.folder_id = ${folderId}` : Prisma.sql``}
      ${buildTagFilter(tagId)}
      ${buildInstructorFilter(instructorId)}
      ${includeUnassigned ? Prisma.sql`` : Prisma.sql`AND te.project_id IS NOT NULL`}
    GROUP BY te.project_id, p.name
    ORDER BY minutes DESC
  `;
  return rows.map((r) => {
    const isUnassigned = r.key === UNASSIGNED_KEY || r.key === null;
    return {
      key: isUnassigned ? UNASSIGNED_KEY : (r.key as string),
      label: isUnassigned ? 'Unassigned' : (r.label ?? '(unknown project)'),
      minutes: Math.round(Number(r.minutes)),
      billableMinutes: Math.round(Number(r.billable_minutes)),
      costCents: Math.round(Number(r.cost_cents)),
      ...(isUnassigned && { isUnassigned: true }),
    };
  });
}

async function summaryByFolder(
  fromDate: Date,
  toDate: Date,
  billable: boolean | undefined,
  folderId: string | undefined,
  tagId: string | undefined,
  instructorId: string | undefined,
  includeUnassigned: boolean,
): Promise<ReportSummaryRow[]> {
  const rows = await prisma.$queryRaw<RawAggRow[]>`
    SELECT COALESCE(p.folder_id, ${UNASSIGNED_KEY}) AS key,
           COALESCE(f.name, 'Unassigned') AS label,
           COALESCE(SUM(EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 60.0), 0)::float AS minutes,
           COALESCE(SUM(CASE WHEN te.is_billable THEN EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 60.0 ELSE 0 END), 0)::float AS billable_minutes,
           COALESCE(SUM(EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 3600.0 * te.rate_cents_at_entry), 0)::float AS cost_cents
    FROM time_entries te
    LEFT JOIN projects p ON p.id = te.project_id
    LEFT JOIN folders f ON f.id = p.folder_id
    WHERE te.deleted_at IS NULL
      AND te.ended_at IS NOT NULL
      AND te.started_at >= ${fromDate}
      AND te.started_at < ${toDate}
      ${buildBillableFilter(billable)}
      ${folderId ? Prisma.sql`AND p.folder_id = ${folderId}` : Prisma.sql``}
      ${buildTagFilter(tagId)}
      ${buildInstructorFilter(instructorId)}
      ${includeUnassigned ? Prisma.sql`` : Prisma.sql`AND te.project_id IS NOT NULL`}
    GROUP BY p.folder_id, f.name
    ORDER BY minutes DESC
  `;
  return rows.map((r) => {
    const isUnassigned = r.key === UNASSIGNED_KEY || r.key === null;
    return {
      key: isUnassigned ? UNASSIGNED_KEY : (r.key as string),
      label: isUnassigned ? 'Unassigned' : (r.label ?? '(unknown folder)'),
      minutes: Math.round(Number(r.minutes)),
      billableMinutes: Math.round(Number(r.billable_minutes)),
      costCents: Math.round(Number(r.cost_cents)),
      ...(isUnassigned && { isUnassigned: true }),
    };
  });
}

async function summaryByTag(
  fromDate: Date,
  toDate: Date,
  billable: boolean | undefined,
  folderId: string | undefined,
  tagId: string | undefined,
  instructorId: string | undefined,
  includeUnassigned: boolean,
): Promise<ReportSummaryRow[]> {
  // Entries can belong to many tags via the project, so we unnest.
  // Each entry's minutes are counted once per tag — documented so readers don't expect sums to equal totals.
  const rows = await prisma.$queryRaw<RawAggRow[]>`
    SELECT COALESCE(pt.tag_id, ${UNASSIGNED_KEY}) AS key,
           COALESCE(t.name, 'Unassigned') AS label,
           COALESCE(SUM(EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 60.0), 0)::float AS minutes,
           COALESCE(SUM(CASE WHEN te.is_billable THEN EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 60.0 ELSE 0 END), 0)::float AS billable_minutes,
           COALESCE(SUM(EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 3600.0 * te.rate_cents_at_entry), 0)::float AS cost_cents
    FROM time_entries te
    LEFT JOIN project_tags pt ON pt.project_id = te.project_id
    LEFT JOIN tags t ON t.id = pt.tag_id
    LEFT JOIN projects p ON p.id = te.project_id
    WHERE te.deleted_at IS NULL
      AND te.ended_at IS NOT NULL
      AND te.started_at >= ${fromDate}
      AND te.started_at < ${toDate}
      ${buildBillableFilter(billable)}
      ${folderId ? Prisma.sql`AND p.folder_id = ${folderId}` : Prisma.sql``}
      ${tagId ? Prisma.sql`AND pt.tag_id = ${tagId}` : Prisma.sql``}
      ${buildInstructorFilter(instructorId)}
      ${includeUnassigned ? Prisma.sql`` : Prisma.sql`AND te.project_id IS NOT NULL AND pt.tag_id IS NOT NULL`}
    GROUP BY pt.tag_id, t.name
    ORDER BY minutes DESC
  `;
  return rows.map((r) => {
    const isUnassigned = r.key === UNASSIGNED_KEY || r.key === null;
    return {
      key: isUnassigned ? UNASSIGNED_KEY : (r.key as string),
      label: isUnassigned ? 'Unassigned' : (r.label ?? '(untagged)'),
      minutes: Math.round(Number(r.minutes)),
      billableMinutes: Math.round(Number(r.billable_minutes)),
      costCents: Math.round(Number(r.cost_cents)),
      ...(isUnassigned && { isUnassigned: true }),
    };
  });
}

export async function registerReportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/reports/summary', { preHandler: requireAdmin }, async (request) => {
    const filters = ReportSummaryFiltersSchema.parse(request.query);
    const { fromDate, toDate } = parseRange(filters.from, filters.to);

    let rows: ReportSummaryRow[];
    switch (filters.groupBy) {
      case 'instructor':
        rows = await summaryByInstructor(
          fromDate,
          toDate,
          filters.billable,
          filters.folderId,
          filters.tagId,
          filters.instructorId,
          filters.includeUnassigned,
        );
        break;
      case 'project':
        rows = await summaryByProject(
          fromDate,
          toDate,
          filters.billable,
          filters.folderId,
          filters.tagId,
          filters.instructorId,
          filters.includeUnassigned,
        );
        break;
      case 'folder':
        rows = await summaryByFolder(
          fromDate,
          toDate,
          filters.billable,
          filters.folderId,
          filters.tagId,
          filters.instructorId,
          filters.includeUnassigned,
        );
        break;
      case 'tag':
        rows = await summaryByTag(
          fromDate,
          toDate,
          filters.billable,
          filters.folderId,
          filters.tagId,
          filters.instructorId,
          filters.includeUnassigned,
        );
        break;
    }

    const totals = rows.reduce(
      (acc, r) => {
        acc.minutes += r.minutes;
        acc.billableMinutes += r.billableMinutes;
        acc.costCents += r.costCents;
        return acc;
      },
      { minutes: 0, billableMinutes: 0, costCents: 0 },
    );

    const response: ReportSummaryResponse = {
      from: filters.from,
      to: filters.to,
      groupBy: filters.groupBy,
      rows,
      // Tag grouping double-counts entries that live under multiple tags; surface the raw row total and warn via currency metadata — consumers should display row-level figures, not sum them.
      totals: filters.groupBy === 'tag' ? { minutes: 0, billableMinutes: 0, costCents: 0 } : totals,
      currency: CURRENCY,
      rateSource: 'entry_snapshot',
    };
    return response;
  });

  app.get('/reports/daily', { preHandler: requireAdmin }, async (request) => {
    const filters = ReportDailyFiltersSchema.parse(request.query);
    const { fromDate, toDate } = parseRange(filters.from, filters.to);

    const rows = await prisma.$queryRaw<
      { date: Date; user_id: string; name: string; minutes: number }[]
    >`
      SELECT date_trunc('day', te.started_at AT TIME ZONE 'UTC')::date AS date,
             te.user_id AS user_id,
             u.name AS name,
             COALESCE(SUM(EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 60.0), 0)::float AS minutes
      FROM time_entries te
      JOIN users u ON u.id = te.user_id
      LEFT JOIN projects p ON p.id = te.project_id
      WHERE te.deleted_at IS NULL
        AND te.ended_at IS NOT NULL
        AND te.started_at >= ${fromDate}
        AND te.started_at < ${toDate}
        ${buildBillableFilter(filters.billable)}
        ${filters.folderId ? Prisma.sql`AND p.folder_id = ${filters.folderId}` : Prisma.sql``}
        ${buildTagFilter(filters.tagId)}
        ${buildInstructorFilter(filters.instructorId)}
        ${filters.includeUnassigned ? Prisma.sql`` : Prisma.sql`AND te.project_id IS NOT NULL`}
      GROUP BY date, te.user_id, u.name
      ORDER BY date ASC, u.name ASC
    `;

    const instructorMap = new Map<string, string>();
    const days = new Set<string>();
    const cells = rows.map((r) => {
      const dateStr = r.date.toISOString().slice(0, 10);
      days.add(dateStr);
      instructorMap.set(r.user_id, r.name);
      return {
        date: dateStr,
        instructorId: r.user_id,
        instructorName: r.name,
        minutes: Math.round(Number(r.minutes)),
      };
    });

    // Fill in all day buckets between from and to so the stacked bar has empty days.
    const allDays: string[] = [];
    const cursor = new Date(fromDate.getTime());
    cursor.setUTCHours(0, 0, 0, 0);
    while (cursor < toDate) {
      allDays.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const response: ReportDailyResponse = {
      from: filters.from,
      to: filters.to,
      cells,
      instructors: Array.from(instructorMap, ([id, name]) => ({ id, name })).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      days: allDays,
    };
    return response;
  });

  app.get('/reports/projects', { preHandler: requireAdmin }, async (request) => {
    const filters = ReportProjectsFiltersSchema.parse(request.query);
    const { fromDate, toDate } = parseRange(filters.from, filters.to);

    const rows = await prisma.$queryRaw<
      {
        project_id: string;
        name: string;
        folder_id: string;
        folder_name: string;
        status: string;
        estimated_minutes: number;
        original_estimated_minutes: number;
        actual_minutes: number;
        cost_cents: number;
      }[]
    >`
      SELECT p.id AS project_id,
             p.name AS name,
             p.folder_id AS folder_id,
             f.name AS folder_name,
             p.status::text AS status,
             p.estimated_minutes AS estimated_minutes,
             p.original_estimated_minutes AS original_estimated_minutes,
             COALESCE(SUM(EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 60.0), 0)::float AS actual_minutes,
             COALESCE(SUM(EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 3600.0 * te.rate_cents_at_entry), 0)::float AS cost_cents
      FROM projects p
      JOIN folders f ON f.id = p.folder_id
      LEFT JOIN time_entries te ON te.project_id = p.id
        AND te.deleted_at IS NULL
        AND te.ended_at IS NOT NULL
        AND te.started_at >= ${fromDate}
        AND te.started_at < ${toDate}
      WHERE p.deleted_at IS NULL
        ${filters.folderId ? Prisma.sql`AND p.folder_id = ${filters.folderId}` : Prisma.sql``}
      GROUP BY p.id, p.name, p.folder_id, f.name, p.status, p.estimated_minutes, p.original_estimated_minutes
      ORDER BY (COALESCE(SUM(EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 60.0), 0)::float - p.estimated_minutes) DESC
    `;

    const unassignedAgg = await prisma.$queryRaw<
      { minutes: number; cost_cents: number }[]
    >`
      SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 60.0), 0)::float AS minutes,
             COALESCE(SUM(EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 3600.0 * te.rate_cents_at_entry), 0)::float AS cost_cents
      FROM time_entries te
      WHERE te.deleted_at IS NULL
        AND te.ended_at IS NOT NULL
        AND te.project_id IS NULL
        AND te.started_at >= ${fromDate}
        AND te.started_at < ${toDate}
    `;

    const response: ReportProjectsResponse = {
      from: filters.from,
      to: filters.to,
      rows: rows.map((r) => {
        const actual = Math.round(Number(r.actual_minutes));
        return {
          projectId: r.project_id,
          name: r.name,
          folderId: r.folder_id,
          folderName: r.folder_name,
          // Prisma driver returns enum as string; narrow via cast at the DTO edge.
          status: r.status as ReportProjectsResponse['rows'][number]['status'],
          estimatedMinutes: r.estimated_minutes,
          originalEstimatedMinutes: r.original_estimated_minutes,
          actualMinutes: actual,
          varianceMinutes: actual - r.estimated_minutes,
          originalVarianceMinutes: actual - r.original_estimated_minutes,
          isOverEstimate: actual > r.estimated_minutes,
          costCents: Math.round(Number(r.cost_cents)),
        };
      }),
      unassigned: {
        minutes: Math.round(Number(unassignedAgg[0]?.minutes ?? 0)),
        costCents: Math.round(Number(unassignedAgg[0]?.cost_cents ?? 0)),
      },
      currency: CURRENCY,
      rateSource: 'entry_snapshot',
    };
    return response;
  });

  // ---- CSV export (Step 23) ----
  const CsvFiltersSchema = z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
    folderId: z.string().optional(),
    tagId: z.string().optional(),
    instructorId: z.string().optional(),
    billable: z.coerce.boolean().optional(),
  });

  app.get(
    '/reports/export.csv',
    { preHandler: requireAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const filters = CsvFiltersSchema.parse(request.query);
      const { fromDate, toDate } = parseRange(filters.from, filters.to);

      const rows = await prisma.$queryRaw<
        {
          started_at: Date;
          ended_at: Date;
          instructor_name: string;
          folder_name: string | null;
          project_name: string | null;
          task_name: string | null;
          description: string | null;
          duration_minutes: number;
          is_billable: boolean;
          rate_cents: number;
          cost_cents: number;
          source: string;
        }[]
      >`
        SELECT te.started_at,
               te.ended_at,
               u.name AS instructor_name,
               f.name AS folder_name,
               p.name AS project_name,
               tk.name AS task_name,
               te.description,
               EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 60.0 AS duration_minutes,
               te.is_billable,
               te.rate_cents_at_entry AS rate_cents,
               (EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 3600.0 * te.rate_cents_at_entry) AS cost_cents,
               te.source::text AS source
        FROM time_entries te
        JOIN users u ON u.id = te.user_id
        LEFT JOIN projects p ON p.id = te.project_id
        LEFT JOIN folders f ON f.id = p.folder_id
        LEFT JOIN tasks tk ON tk.id = te.task_id
        WHERE te.deleted_at IS NULL
          AND te.ended_at IS NOT NULL
          AND te.started_at >= ${fromDate}
          AND te.started_at < ${toDate}
          ${buildBillableFilter(filters.billable)}
          ${filters.folderId ? Prisma.sql`AND p.folder_id = ${filters.folderId}` : Prisma.sql``}
          ${buildTagFilter(filters.tagId)}
          ${buildInstructorFilter(filters.instructorId)}
        ORDER BY te.started_at ASC
      `;

      const header = [
        'date',
        'instructor',
        'folder',
        'project',
        'task',
        'description',
        'duration_minutes',
        'billable',
        'rate_cents',
        'cost_cents',
        'source',
      ];
      const lines = [header.join(',')];
      for (const r of rows) {
        lines.push(
          [
            r.started_at.toISOString(),
            csvCell(r.instructor_name),
            csvCell(r.folder_name ?? 'Unassigned'),
            csvCell(r.project_name ?? 'Unassigned'),
            csvCell(r.task_name ?? ''),
            csvCell(r.description ?? ''),
            Math.round(Number(r.duration_minutes)).toString(),
            r.is_billable ? 'true' : 'false',
            r.rate_cents.toString(),
            Math.round(Number(r.cost_cents)).toString(),
            r.source,
          ].join(','),
        );
      }
      const csv = lines.join('\n') + '\n';
      const filename = `breaklog_${filters.from.slice(0, 10)}_${filters.to.slice(0, 10)}.csv`;
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(csv);
    },
  );

  // ---- PDF export (Step 26) ----
  app.get(
    '/reports/export.pdf',
    { preHandler: requireAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const filters = ReportSummaryFiltersSchema.parse({
        ...(request.query as Record<string, unknown>),
        groupBy: 'instructor',
      });
      const { fromDate, toDate } = parseRange(filters.from, filters.to);

      const [byInstructor, byProject, projectsRes] = await Promise.all([
        summaryByInstructor(
          fromDate,
          toDate,
          filters.billable,
          filters.folderId,
          filters.tagId,
          filters.instructorId,
          filters.includeUnassigned,
        ),
        summaryByProject(
          fromDate,
          toDate,
          filters.billable,
          filters.folderId,
          filters.tagId,
          filters.instructorId,
          filters.includeUnassigned,
        ),
        prisma.$queryRaw<
          {
            name: string;
            folder_name: string;
            estimated_minutes: number;
            actual_minutes: number;
            cost_cents: number;
          }[]
        >`
          SELECT p.name AS name,
                 f.name AS folder_name,
                 p.estimated_minutes,
                 COALESCE(SUM(EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 60.0), 0)::float AS actual_minutes,
                 COALESCE(SUM(EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 3600.0 * te.rate_cents_at_entry), 0)::float AS cost_cents
          FROM projects p
          JOIN folders f ON f.id = p.folder_id
          LEFT JOIN time_entries te ON te.project_id = p.id
            AND te.deleted_at IS NULL
            AND te.ended_at IS NOT NULL
            AND te.started_at >= ${fromDate}
            AND te.started_at < ${toDate}
          WHERE p.deleted_at IS NULL
            ${filters.folderId ? Prisma.sql`AND p.folder_id = ${filters.folderId}` : Prisma.sql``}
          GROUP BY p.id, p.name, f.name, p.estimated_minutes
          ORDER BY actual_minutes DESC
        `,
      ]);

      const totals = byInstructor.reduce(
        (acc, r) => {
          acc.minutes += r.minutes;
          acc.billableMinutes += r.billableMinutes;
          acc.costCents += r.costCents;
          return acc;
        },
        { minutes: 0, billableMinutes: 0, costCents: 0 },
      );

      const unassignedRow = byProject.find((r) => r.isUnassigned);

      const pdf = await renderReportPdf({
        from: filters.from,
        to: filters.to,
        byInstructor,
        byProject,
        projects: projectsRes.map((p) => {
          const actual = Math.round(Number(p.actual_minutes));
          return {
            name: p.name,
            folderName: p.folder_name,
            estimatedMinutes: p.estimated_minutes,
            actualMinutes: actual,
            varianceMinutes: actual - p.estimated_minutes,
            costCents: Math.round(Number(p.cost_cents)),
          };
        }),
        totals,
        ...(unassignedRow
          ? {
              unassigned: {
                minutes: unassignedRow.minutes,
                costCents: unassignedRow.costCents,
              },
            }
          : {}),
      });

      const filename = `breaklog_${filters.from.slice(0, 10)}_${filters.to.slice(0, 10)}.pdf`;
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(pdf);
    },
  );
}

function csvCell(v: string): string {
  const s = v ?? '';
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
