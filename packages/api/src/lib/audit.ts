import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../db.js';

export async function recordAudit(
  action: string,
  opts: {
    actorId?: string | null;
    targetType?: string | null;
    targetId?: string | null;
    payload?: Prisma.InputJsonValue;
    tx?: Prisma.TransactionClient | PrismaClient;
  } = {},
): Promise<void> {
  const client = opts.tx ?? prisma;
  await client.auditLog.create({
    data: {
      action,
      actorId: opts.actorId ?? null,
      targetType: opts.targetType ?? null,
      targetId: opts.targetId ?? null,
      payload: opts.payload ?? {},
    },
  });
}
