import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate, requireAdmin } from '../lib/auth.js';
import { recordAudit } from '../lib/audit.js';
import { notifyMany } from '../lib/notifications.js';
import { Conflict, NotFound } from '../errors.js';

const WeekParams = z.object({
  iso_year: z.coerce.number().int().min(1970).max(3000),
  iso_week: z.coerce.number().int().min(1).max(53),
});

// Compute the UTC Monday of a given ISO year/week. Matches isoWeekParts direction.
function isoWeekStartUtc(isoYear: number, isoWeek: number): Date {
  // ISO week 1 is the week containing the first Thursday of the year.
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (isoWeek - 1) * 7);
  return target;
}

export async function registerWeekRoutes(app: FastifyInstance): Promise<void> {
  // List the last N ISO weeks with their lock state and total tracked time, for the Settings UI.
  app.get('/weeks', async (request) => {
    const viewer = await authenticate(request);
    const weeksBack = 12;

    const locks = await prisma.weekLock.findMany({
      orderBy: [{ isoYear: 'desc' }, { isoWeek: 'desc' }],
      take: 50,
    });
    const lockMap = new Map(
      locks.map((l) => [`${l.isoYear}-${l.isoWeek}`, l] as const),
    );

    // Build the last `weeksBack` weeks ending at the current week, UTC-anchored.
    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const dow = todayUtc.getUTCDay() || 7;
    const currentMonday = new Date(todayUtc);
    currentMonday.setUTCDate(todayUtc.getUTCDate() - dow + 1);

    const weeks: {
      isoYear: number;
      isoWeek: number;
      startDate: string;
      endDate: string;
      totalMinutes: number;
      locked: boolean;
      lockedByUserId: string | null;
      lockedAt: string | null;
    }[] = [];

    for (let i = 0; i < weeksBack; i++) {
      const monday = new Date(currentMonday);
      monday.setUTCDate(currentMonday.getUTCDate() - i * 7);
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      const nextMonday = new Date(monday);
      nextMonday.setUTCDate(monday.getUTCDate() + 7);

      // Use Postgres ISO-week semantics to stay consistent with the lock trigger.
      const [agg] = await prisma.$queryRaw<
        { iso_year: number; iso_week: number; total_minutes: number }[]
      >`
        SELECT EXTRACT(ISOYEAR FROM ${monday}::timestamptz AT TIME ZONE 'UTC')::int AS iso_year,
               EXTRACT(WEEK FROM ${monday}::timestamptz AT TIME ZONE 'UTC')::int AS iso_week,
               COALESCE(SUM(EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 60.0), 0)::float
                 AS total_minutes
        FROM time_entries te
        WHERE te.deleted_at IS NULL
          AND te.ended_at IS NOT NULL
          AND te.started_at >= ${monday}
          AND te.started_at < ${nextMonday}
          ${viewer.role === 'ADMIN' ? Prisma.sql`` : Prisma.sql`AND te.user_id = ${viewer.id}`}
      `;

      const isoYear = agg?.iso_year ?? monday.getUTCFullYear();
      const isoWeek = agg?.iso_week ?? 1;
      const lock = lockMap.get(`${isoYear}-${isoWeek}`);
      weeks.push({
        isoYear,
        isoWeek,
        startDate: monday.toISOString().slice(0, 10),
        endDate: sunday.toISOString().slice(0, 10),
        totalMinutes: Math.round(Number(agg?.total_minutes ?? 0)),
        locked: !!lock,
        lockedByUserId: lock?.lockedByUserId ?? null,
        lockedAt: lock?.lockedAt.toISOString() ?? null,
      });
    }

    return { weeks };
  });

  app.post<{ Params: { iso_year: string; iso_week: string } }>(
    '/weeks/:iso_year/:iso_week/lock',
    { preHandler: requireAdmin },
    async (request) => {
      const admin = await authenticate(request);
      const { iso_year, iso_week } = WeekParams.parse(request.params);

      const existing = await prisma.weekLock.findUnique({
        where: { isoYear_isoWeek: { isoYear: iso_year, isoWeek: iso_week } },
      });
      if (existing) {
        throw Conflict('already_locked', 'Week is already locked');
      }

      const lock = await prisma.$transaction(async (tx) => {
        const created = await tx.weekLock.create({
          data: { isoYear: iso_year, isoWeek: iso_week, lockedByUserId: admin.id },
        });
        await recordAudit('week.lock', {
          actorId: admin.id,
          targetType: 'week',
          targetId: `${iso_year}-W${String(iso_week).padStart(2, '0')}`,
          payload: { isoYear: iso_year, isoWeek: iso_week },
          tx,
        });

        // Notify every user who logged time in that week — their entries are now read-only.
        const monday = isoWeekStartUtc(iso_year, iso_week);
        const nextMonday = new Date(monday);
        nextMonday.setUTCDate(monday.getUTCDate() + 7);
        const users = await tx.timeEntry.findMany({
          where: {
            deletedAt: null,
            startedAt: { gte: monday, lt: nextMonday },
          },
          select: { userId: true },
          distinct: ['userId'],
        });
        await notifyMany(
          users.map((u) => u.userId),
          'week.locked',
          { isoYear: iso_year, isoWeek: iso_week },
          tx,
        );
        return created;
      });

      return {
        lock: {
          id: lock.id,
          isoYear: lock.isoYear,
          isoWeek: lock.isoWeek,
          lockedByUserId: lock.lockedByUserId,
          lockedAt: lock.lockedAt.toISOString(),
        },
      };
    },
  );

  app.delete<{ Params: { iso_year: string; iso_week: string } }>(
    '/weeks/:iso_year/:iso_week/lock',
    { preHandler: requireAdmin },
    async (request) => {
      const admin = await authenticate(request);
      const { iso_year, iso_week } = WeekParams.parse(request.params);

      const existing = await prisma.weekLock.findUnique({
        where: { isoYear_isoWeek: { isoYear: iso_year, isoWeek: iso_week } },
      });
      if (!existing) throw NotFound('Week is not locked');

      await prisma.$transaction(async (tx) => {
        await tx.weekLock.delete({ where: { id: existing.id } });
        await recordAudit('week.unlock', {
          actorId: admin.id,
          targetType: 'week',
          targetId: `${iso_year}-W${String(iso_week).padStart(2, '0')}`,
          payload: { isoYear: iso_year, isoWeek: iso_week },
          tx,
        });
      });

      return { ok: true };
    },
  );
}
