import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { buildTestApp, createUser, resetDb, sessionCookieFor } from './helpers.js';

describe('timer', () => {
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

  it('requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/timer/current' });
    expect(res.statusCode).toBe(401);
  });

  it('start with no project creates an unassigned running entry', async () => {
    const user = await createUser({ role: 'INSTRUCTOR' });
    const cookie = await sessionCookieFor(user);

    const startRes = await app.inject({
      method: 'POST',
      url: '/timer/start',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { source: 'WEB' },
    });
    expect(startRes.statusCode).toBe(200);
    const started = startRes.json() as { entry: { projectId: string | null; endedAt: null } };
    expect(started.entry.projectId).toBeNull();
    expect(started.entry.endedAt).toBeNull();

    const cur = await app.inject({
      method: 'GET',
      url: '/timer/current',
      headers: { cookie },
    });
    expect((cur.json() as { entry: unknown }).entry).not.toBeNull();
  });

  it('starting a second timer stops the first atomically', async () => {
    const user = await createUser({ role: 'INSTRUCTOR' });
    const cookie = await sessionCookieFor(user);

    await app.inject({
      method: 'POST',
      url: '/timer/start',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { source: 'WEB' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/timer/start',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { source: 'WEB', description: 'round two' },
    });
    expect(second.statusCode).toBe(200);
    const body = second.json() as {
      entry: { id: string };
      stoppedEntry: { endedAt: string | null } | null;
    };
    expect(body.stoppedEntry).not.toBeNull();
    expect(body.stoppedEntry!.endedAt).not.toBeNull();

    // Only one active entry remains.
    const active = await prisma.timeEntry.findMany({
      where: { userId: user.id, endedAt: null, deletedAt: null },
    });
    expect(active.length).toBe(1);
    expect(active[0]!.id).toBe(body.entry.id);
  });

  it('stop returns 404 when no timer running', async () => {
    const user = await createUser({ role: 'INSTRUCTOR' });
    const res = await app.inject({
      method: 'POST',
      url: '/timer/stop',
      headers: { cookie: await sessionCookieFor(user) },
    });
    expect(res.statusCode).toBe(404);
  });
});
