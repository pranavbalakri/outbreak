import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { buildTestApp, createUser, resetDb, sessionCookieFor } from './helpers.js';

describe('reports', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb();
  });

  it('instructor cannot access reports', async () => {
    const alice = await createUser({ role: 'INSTRUCTOR' });
    const res = await app.inject({
      method: 'GET',
      url: '/reports/summary?from=2026-04-01T00:00:00Z&to=2026-05-01T00:00:00Z&groupBy=project',
      headers: { cookie: await sessionCookieFor(alice) },
    });
    expect(res.statusCode).toBe(403);
  });

  it('groupBy=project surfaces unassigned time as its own bucket', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const alice = await createUser({ role: 'INSTRUCTOR' });
    const folder = await prisma.folder.create({ data: { name: 'f' } });
    const project = await prisma.project.create({
      data: {
        folderId: folder.id,
        name: 'Research',
        estimatedMinutes: 60,
        originalEstimatedMinutes: 60,
        createdByUserId: admin.id,
      },
    });

    // 60min against project + 30min unassigned.
    await prisma.timeEntry.createMany({
      data: [
        {
          userId: alice.id,
          projectId: project.id,
          startedAt: new Date('2026-04-10T10:00:00Z'),
          endedAt: new Date('2026-04-10T11:00:00Z'),
          rateCentsAtEntry: alice.currentRateCents,
          source: 'MANUAL',
          isBillable: true,
        },
        {
          userId: alice.id,
          projectId: null,
          startedAt: new Date('2026-04-10T12:00:00Z'),
          endedAt: new Date('2026-04-10T12:30:00Z'),
          rateCentsAtEntry: alice.currentRateCents,
          source: 'MANUAL',
          isBillable: true,
        },
      ],
    });

    const res = await app.inject({
      method: 'GET',
      url: '/reports/summary?from=2026-04-01T00:00:00Z&to=2026-05-01T00:00:00Z&groupBy=project',
      headers: { cookie: await sessionCookieFor(admin) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { rows: Array<{ key: string; minutes: number }> };
    const unassigned = body.rows.find((r) => r.key === 'unassigned');
    expect(unassigned).toBeDefined();
    expect(unassigned!.minutes).toBe(30);
    const projectRow = body.rows.find((r) => r.key === project.id);
    expect(projectRow?.minutes).toBe(60);
  });
});
