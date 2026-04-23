import type { FastifyInstance } from 'fastify';
import type { Role, User } from '@prisma/client';
import { execSync } from 'node:child_process';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { SESSION_CONFIG, signSession } from '../src/lib/session.js';

let migrated = false;

/**
 * Apply the schema to the test DB once per process. We call `prisma migrate
 * deploy` so that a pre-existing test DB is upgraded without prompts; an empty
 * DB picks up all migrations.
 */
export function ensureSchema(): void {
  if (migrated) return;
  execSync('pnpm exec prisma migrate deploy', {
    cwd: new URL('..', import.meta.url).pathname,
    stdio: 'pipe',
    env: process.env,
  });
  migrated = true;
}

/** Truncate every business table and reset sequences — cheap and deterministic. */
export async function resetDb(): Promise<void> {
  // Order: child → parent. TimeEntry trigger (week-lock) has to be disabled
  // for the truncate so we don't trip `week_locked` on bulk delete.
  await prisma.$executeRawUnsafe('ALTER TABLE time_entries DISABLE TRIGGER ALL');
  try {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE ' +
        [
          'notifications',
          'audit_logs',
          'auth_attempts',
          'week_locks',
          'project_tags',
          'project_assignments',
          'task_assignments',
          'time_entries',
          'tasks',
          'projects',
          'tags',
          'folders',
          'api_tokens',
          'rate_history',
          'users',
        ].join(', ') +
        ' RESTART IDENTITY CASCADE',
    );
  } finally {
    await prisma.$executeRawUnsafe('ALTER TABLE time_entries ENABLE TRIGGER ALL');
  }
}

export async function buildTestApp(): Promise<FastifyInstance> {
  ensureSchema();
  const app = await buildApp();
  await app.ready();
  return app;
}

export async function createUser(overrides: Partial<User> = {}): Promise<User> {
  const role: Role = (overrides.role as Role) ?? 'INSTRUCTOR';
  const email =
    overrides.email ?? `user-${Math.random().toString(36).slice(2, 10)}@example.com`;
  return prisma.user.create({
    data: {
      name: overrides.name ?? (role === 'ADMIN' ? 'Test Admin' : 'Test Instructor'),
      email,
      role,
      currentRateCents: overrides.currentRateCents ?? (role === 'ADMIN' ? 15000 : 6000),
      timezone: overrides.timezone ?? 'America/New_York',
    },
  });
}

export async function sessionCookieFor(user: Pick<User, 'id' | 'role'>): Promise<string> {
  const token = await signSession({ sub: user.id, role: user.role });
  return `${SESSION_CONFIG.cookieName}=${token}`;
}
