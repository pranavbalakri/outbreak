import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, createUser, resetDb, sessionCookieFor } from './helpers.js';

describe('feedback', () => {
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

  it('instructor can submit feedback; admin lists it', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const alice = await createUser({ role: 'INSTRUCTOR' });

    const submit = await app.inject({
      method: 'POST',
      url: '/feedback',
      headers: { cookie: await sessionCookieFor(alice), 'content-type': 'application/json' },
      payload: { message: 'Timer button is tiny on mobile' },
    });
    expect(submit.statusCode).toBe(200);

    const forbidden = await app.inject({
      method: 'GET',
      url: '/feedback',
      headers: { cookie: await sessionCookieFor(alice) },
    });
    expect(forbidden.statusCode).toBe(403);

    const list = await app.inject({
      method: 'GET',
      url: '/feedback',
      headers: { cookie: await sessionCookieFor(admin) },
    });
    expect(list.statusCode).toBe(200);
    const body = list.json() as {
      feedback: Array<{ message: string; userEmail: string }>;
    };
    expect(body.feedback.length).toBe(1);
    expect(body.feedback[0]!.message).toContain('tiny on mobile');
    expect(body.feedback[0]!.userEmail).toBe(alice.email);
  });
});
