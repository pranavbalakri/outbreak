import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../db.js';

type NotificationKind = 'project.assigned' | 'project.overdue' | 'week.locked';

export async function notify(
  userId: string,
  kind: NotificationKind,
  payload: Prisma.InputJsonValue,
  tx?: Prisma.TransactionClient | PrismaClient,
): Promise<void> {
  const client = tx ?? prisma;
  await client.notification.create({
    data: { userId, kind, payload },
  });
}

export async function notifyMany(
  userIds: string[],
  kind: NotificationKind,
  payload: Prisma.InputJsonValue,
  tx?: Prisma.TransactionClient | PrismaClient,
): Promise<void> {
  if (userIds.length === 0) return;
  const client = tx ?? prisma;
  await client.notification.createMany({
    data: userIds.map((userId) => ({ userId, kind, payload })),
  });
}
