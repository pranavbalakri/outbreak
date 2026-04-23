import type { FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '@prisma/client';
import { createHash } from 'node:crypto';
import { prisma } from '../db.js';
import { Unauthorized, Forbidden } from '../errors.js';
import { SESSION_CONFIG, verifySession } from './session.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function authenticateBearer(token: string): Promise<User | null> {
  const tokenHash = hashToken(token);
  const apiToken = await prisma.apiToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!apiToken || apiToken.revokedAt) return null;
  if (!apiToken.user || apiToken.user.deletedAt || !apiToken.user.isActive) return null;
  // Touch-up last-used; fire-and-forget to keep hot paths fast.
  void prisma.apiToken
    .update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
  return apiToken.user;
}

export async function authenticate(request: FastifyRequest): Promise<User> {
  // Bearer-token path first — the Chrome extension uses this; the web app uses cookies.
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const raw = authHeader.slice('Bearer '.length).trim();
    if (raw) {
      const user = await authenticateBearer(raw);
      if (!user) throw Unauthorized('Invalid or revoked API token');
      request.user = user;
      return user;
    }
  }

  const token = request.cookies[SESSION_CONFIG.cookieName];
  if (!token) throw Unauthorized('Missing session cookie');

  const payload = await verifySession(token);
  if (!payload) throw Unauthorized('Invalid or expired session');

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.deletedAt || !user.isActive) {
    throw Unauthorized('Account not found or inactive');
  }

  request.user = user;
  return user;
}

export async function requireUser(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  await authenticate(request);
}

export async function requireAdmin(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const user = await authenticate(request);
  if (user.role !== 'ADMIN') throw Forbidden('Admin role required');
}
