import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CreateUserInputSchema,
  UpdateRateInputSchema,
  UpdateUserInputSchema,
} from '@outbreak/shared';
import { prisma } from '../db.js';
import { authenticate, requireAdmin } from '../lib/auth.js';
import { toUserDto } from '../lib/dto.js';
import { recordAudit } from '../lib/audit.js';
import { Conflict, Forbidden, NotFound } from '../errors.js';

const IdParams = z.object({ id: z.string().min(1) });

export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  app.get('/users', { preHandler: requireAdmin }, async () => {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    return { users: users.map(toUserDto) };
  });

  app.get<{ Params: { id: string } }>('/users/:id', async (request) => {
    const viewer = await authenticate(request);
    const { id } = IdParams.parse(request.params);
    if (viewer.role !== 'ADMIN' && viewer.id !== id) {
      throw Forbidden('You can only view your own profile');
    }
    const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw NotFound('User not found');
    return { user: toUserDto(user) };
  });

  app.post('/users', { preHandler: requireAdmin }, async (request) => {
    const input = CreateUserInputSchema.parse(request.body);
    const email = input.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && !existing.deletedAt) {
      throw Conflict('email_exists', 'A user with this email already exists');
    }

    const user = await prisma.$transaction(async (tx) => {
      const created = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              name: input.name,
              role: input.role,
              currentRateCents: input.rateCents,
              timezone: input.timezone,
              isActive: true,
              deletedAt: null,
              googleSub: null, // force re-bind on next sign-in
            },
          })
        : await tx.user.create({
            data: {
              name: input.name,
              email,
              role: input.role,
              currentRateCents: input.rateCents,
              timezone: input.timezone,
            },
          });

      await tx.rateHistory.create({
        data: {
          userId: created.id,
          rateCents: input.rateCents,
          effectiveFrom: new Date(),
        },
      });

      return created;
    });

    return { user: toUserDto(user) };
  });

  app.patch<{ Params: { id: string } }>(
    '/users/:id',
    { preHandler: requireAdmin },
    async (request) => {
      const { id } = IdParams.parse(request.params);
      const input = UpdateUserInputSchema.parse(request.body);
      const existing = await prisma.user.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw NotFound('User not found');

      const user = await prisma.user.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.role !== undefined && { role: input.role }),
          ...(input.timezone !== undefined && { timezone: input.timezone }),
          ...(input.rateVisibleToSelf !== undefined && {
            rateVisibleToSelf: input.rateVisibleToSelf,
          }),
          ...(input.isActive !== undefined && { isActive: input.isActive }),
        },
      });
      return { user: toUserDto(user) };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/users/:id',
    { preHandler: requireAdmin },
    async (request) => {
      const admin = await authenticate(request);
      const { id } = IdParams.parse(request.params);
      if (id === admin.id) {
        throw Conflict('self_delete', 'You cannot deactivate your own account');
      }
      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) throw NotFound('User not found');

      const user = await prisma.$transaction(async (tx) => {
        const u = await tx.user.update({
          where: { id },
          data: { isActive: false, deletedAt: new Date() },
        });
        await recordAudit('user.deactivate', {
          actorId: admin.id,
          targetType: 'user',
          targetId: id,
          payload: { email: u.email },
          tx,
        });
        return u;
      });
      return { user: toUserDto(user) };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/users/:id/rate-history',
    { preHandler: requireAdmin },
    async (request) => {
      const { id } = IdParams.parse(request.params);
      const existing = await prisma.user.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw NotFound('User not found');
      const history = await prisma.rateHistory.findMany({
        where: { userId: id },
        orderBy: { effectiveFrom: 'desc' },
      });
      return {
        history: history.map((h) => ({
          id: h.id,
          rateCents: h.rateCents,
          effectiveFrom: h.effectiveFrom.toISOString(),
          createdAt: h.createdAt.toISOString(),
        })),
      };
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/users/:id/rate',
    { preHandler: requireAdmin },
    async (request) => {
      const { id } = IdParams.parse(request.params);
      const input = UpdateRateInputSchema.parse(request.body);
      const existing = await prisma.user.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw NotFound('User not found');

      const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();

      const admin = await authenticate(request);
      const user = await prisma.$transaction(async (tx) => {
        await tx.rateHistory.create({
          data: { userId: id, rateCents: input.rateCents, effectiveFrom },
        });
        const updated = await tx.user.update({
          where: { id },
          data: { currentRateCents: input.rateCents },
        });
        await recordAudit('rate.update', {
          actorId: admin.id,
          targetType: 'user',
          targetId: id,
          payload: {
            previousRateCents: existing.currentRateCents,
            newRateCents: input.rateCents,
            effectiveFrom: effectiveFrom.toISOString(),
          },
          tx,
        });
        return updated;
      });

      return { user: toUserDto(user) };
    },
  );
}
