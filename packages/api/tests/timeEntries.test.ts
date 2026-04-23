import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { buildTestApp, createUser, resetDb, sessionCookieFor } from './helpers.js';
import { isoWeekParts } from '../src/lib/isoWeek.js';

describe('time entries', () => {
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

  it('instructor can create an unassigned entry; admin attaches to a project', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const alice = await createUser({ role: 'INSTRUCTOR' });
    const folder = await prisma.folder.create({ data: { name: 'f' } });
    const project = await prisma.project.create({
      data: {
        folderId: folder.id,
        name: 'p',
        estimatedMinutes: 60,
        originalEstimatedMinutes: 60,
        createdByUserId: admin.id,
        assignments: { create: [{ userId: alice.id }] },
      },
    });

    const create = await app.inject({
      method: 'POST',
      url: '/time-entries',
      headers: {
        cookie: await sessionCookieFor(alice),
        'content-type': 'application/json',
      },
      payload: {
        startedAt: '2026-04-10T10:00:00Z',
        endedAt: '2026-04-10T11:00:00Z',
        description: 'prep',
      },
    });
    expect(create.statusCode).toBe(200);
    const entryId = (create.json() as { entry: { id: string } }).entry.id;

    const attach = await app.inject({
      method: 'PATCH',
      url: `/time-entries/${entryId}`,
      headers: {
        cookie: await sessionCookieFor(admin),
        'content-type': 'application/json',
      },
      payload: { projectId: project.id },
    });
    expect(attach.statusCode).toBe(200);
    expect((attach.json() as { entry: { projectId: string } }).entry.projectId).toBe(
      project.id,
    );
  });

  it('instructors cannot see each other’s entries', async () => {
    const alice = await createUser({ role: 'INSTRUCTOR' });
    const bob = await createUser({ role: 'INSTRUCTOR' });
    await prisma.timeEntry.create({
      data: {
        userId: bob.id,
        startedAt: new Date('2026-04-10T10:00:00Z'),
        endedAt: new Date('2026-04-10T11:00:00Z'),
        rateCentsAtEntry: bob.currentRateCents,
        source: 'MANUAL',
        isBillable: true,
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/time-entries',
      headers: { cookie: await sessionCookieFor(alice) },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { entries: unknown[] }).entries.length).toBe(0);
  });

  it('week lock blocks edits with 409', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const alice = await createUser({ role: 'INSTRUCTOR' });

    const started = new Date('2026-04-10T10:00:00Z');
    const entry = await prisma.timeEntry.create({
      data: {
        userId: alice.id,
        startedAt: started,
        endedAt: new Date('2026-04-10T11:00:00Z'),
        rateCentsAtEntry: alice.currentRateCents,
        source: 'MANUAL',
        isBillable: true,
      },
    });

    const { year, week } = isoWeekParts(started);
    await prisma.weekLock.create({
      data: { isoYear: year, isoWeek: week, lockedByUserId: admin.id },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/time-entries/${entry.id}`,
      headers: {
        cookie: await sessionCookieFor(alice),
        'content-type': 'application/json',
      },
      payload: { description: 'updated' },
    });
    expect(res.statusCode).toBe(409);
  });
});
