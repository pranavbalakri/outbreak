import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { buildTestApp, createUser, resetDb, sessionCookieFor } from './helpers.js';

describe('users', () => {
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

  it('GET /users requires admin', async () => {
    const instructor = await createUser({ role: 'INSTRUCTOR' });
    const res = await app.inject({
      method: 'GET',
      url: '/users',
      headers: { cookie: await sessionCookieFor(instructor) },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /users returns all users for admin', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    await createUser({ role: 'INSTRUCTOR', name: 'Other' });
    const res = await app.inject({
      method: 'GET',
      url: '/users',
      headers: { cookie: await sessionCookieFor(admin) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { users: Array<{ id: string }> };
    expect(body.users.length).toBe(2);
  });

  it('PATCH /users/:id/rate writes history and does not retroactively touch entries', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const instructor = await createUser({ role: 'INSTRUCTOR', currentRateCents: 6000 });

    // Historical entry snapshotted at old rate.
    await prisma.timeEntry.create({
      data: {
        userId: instructor.id,
        startedAt: new Date('2026-04-01T10:00:00Z'),
        endedAt: new Date('2026-04-01T11:00:00Z'),
        rateCentsAtEntry: 6000,
        source: 'MANUAL',
        isBillable: true,
      },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${instructor.id}/rate`,
      headers: { cookie: await sessionCookieFor(admin), 'content-type': 'application/json' },
      payload: { rateCents: 7500 },
    });
    expect(res.statusCode).toBe(200);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: instructor.id } });
    expect(refreshed.currentRateCents).toBe(7500);

    const history = await prisma.rateHistory.findMany({ where: { userId: instructor.id } });
    expect(history.length).toBe(1); // one new row

    const entry = await prisma.timeEntry.findFirstOrThrow({ where: { userId: instructor.id } });
    expect(entry.rateCentsAtEntry).toBe(6000); // unchanged
  });

  it('GET /users/:id allows self but not peers', async () => {
    const alice = await createUser({ role: 'INSTRUCTOR', name: 'Alice' });
    const bob = await createUser({ role: 'INSTRUCTOR', name: 'Bob' });
    const selfRes = await app.inject({
      method: 'GET',
      url: `/users/${alice.id}`,
      headers: { cookie: await sessionCookieFor(alice) },
    });
    expect(selfRes.statusCode).toBe(200);

    const peerRes = await app.inject({
      method: 'GET',
      url: `/users/${bob.id}`,
      headers: { cookie: await sessionCookieFor(alice) },
    });
    expect(peerRes.statusCode).toBe(403);
  });
});
