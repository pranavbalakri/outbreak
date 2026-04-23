import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { buildTestApp, createUser, resetDb, sessionCookieFor } from './helpers.js';

async function makeFolder(name = 'Fall 2026') {
  return prisma.folder.create({ data: { name } });
}

describe('projects', () => {
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

  it('admin creates a project, instructor A sees it, instructor B does not', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const alice = await createUser({ role: 'INSTRUCTOR' });
    const bob = await createUser({ role: 'INSTRUCTOR' });
    const folder = await makeFolder();

    const createRes = await app.inject({
      method: 'POST',
      url: '/projects',
      headers: { cookie: await sessionCookieFor(admin), 'content-type': 'application/json' },
      payload: {
        folderId: folder.id,
        name: 'Topic research',
        estimatedMinutes: 120,
        assigneeIds: [alice.id],
      },
    });
    expect(createRes.statusCode).toBe(200);

    const aliceList = await app.inject({
      method: 'GET',
      url: '/projects',
      headers: { cookie: await sessionCookieFor(alice) },
    });
    expect(aliceList.statusCode).toBe(200);
    expect((aliceList.json() as { projects: unknown[] }).projects.length).toBe(1);

    const bobList = await app.inject({
      method: 'GET',
      url: '/projects',
      headers: { cookie: await sessionCookieFor(bob) },
    });
    expect(bobList.statusCode).toBe(200);
    expect((bobList.json() as { projects: unknown[] }).projects.length).toBe(0);
  });

  it('non-admin cannot create a project', async () => {
    const alice = await createUser({ role: 'INSTRUCTOR' });
    const folder = await makeFolder();
    const res = await app.inject({
      method: 'POST',
      url: '/projects',
      headers: { cookie: await sessionCookieFor(alice), 'content-type': 'application/json' },
      payload: {
        folderId: folder.id,
        name: 'Should fail',
        estimatedMinutes: 60,
        assigneeIds: [],
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /projects/:id aggregates actual vs estimated', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const alice = await createUser({ role: 'INSTRUCTOR' });
    const folder = await makeFolder();

    const project = await prisma.project.create({
      data: {
        folderId: folder.id,
        name: 'Agg test',
        estimatedMinutes: 60,
        originalEstimatedMinutes: 60,
        createdByUserId: admin.id,
        assignments: { create: [{ userId: alice.id }] },
      },
    });

    await prisma.timeEntry.create({
      data: {
        userId: alice.id,
        projectId: project.id,
        startedAt: new Date('2026-04-10T14:00:00Z'),
        endedAt: new Date('2026-04-10T16:00:00Z'), // 120 min
        rateCentsAtEntry: alice.currentRateCents,
        source: 'MANUAL',
        isBillable: true,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}`,
      headers: { cookie: await sessionCookieFor(admin) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { project: { actualMinutes: number; isOverEstimate: boolean } };
    expect(body.project.actualMinutes).toBe(120);
    expect(body.project.isOverEstimate).toBe(true);
  });
});
