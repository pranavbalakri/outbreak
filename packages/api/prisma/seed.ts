import { PrismaClient, Role, ProjectStatus, TimeEntrySource } from '@prisma/client';

const prisma = new PrismaClient();

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v : fallback;
}

function envList(name: string, fallback: string[]): string[] {
  const v = process.env[name];
  if (!v || v.trim().length === 0) return fallback;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function main() {
  const adminEmail = env('SEED_ADMIN_EMAIL', 'vik@example.com').toLowerCase();
  const instructorEmails = envList('SEED_INSTRUCTOR_EMAILS', [
    'alice@example.com',
    'bob@example.com',
  ]).map((e) => e.toLowerCase());

  if (instructorEmails.length < 2) {
    throw new Error('SEED_INSTRUCTOR_EMAILS must contain at least 2 emails.');
  }

  console.log(`Seeding admin ${adminEmail} and instructors ${instructorEmails.join(', ')}`);

  // Clean slate — safe in dev because seed is only invoked via `pnpm db:seed`.
  // Order matters due to FKs.
  await prisma.$transaction([
    prisma.timeEntry.deleteMany(),
    prisma.projectTag.deleteMany(),
    prisma.projectAssignment.deleteMany(),
    prisma.task.deleteMany(),
    prisma.project.deleteMany(),
    prisma.tag.deleteMany(),
    prisma.folder.deleteMany(),
    prisma.weekLock.deleteMany(),
    prisma.apiToken.deleteMany(),
    prisma.rateHistory.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  // Users. google_sub stays null until first sign-in.
  const admin = await prisma.user.create({
    data: {
      name: 'Vik (Admin)',
      email: adminEmail,
      role: Role.ADMIN,
      currentRateCents: 15000, // $150/hr — placeholder
      timezone: 'America/New_York',
    },
  });

  const alice = await prisma.user.create({
    data: {
      name: 'Alice Instructor',
      email: instructorEmails[0]!,
      role: Role.INSTRUCTOR,
      currentRateCents: 6000, // $60/hr
      timezone: 'America/New_York',
    },
  });

  const bob = await prisma.user.create({
    data: {
      name: 'Bob Instructor',
      email: instructorEmails[1]!,
      role: Role.INSTRUCTOR,
      currentRateCents: 5500, // $55/hr
      timezone: 'America/Los_Angeles',
    },
  });

  // Rate history snapshot for current rates.
  const effectiveFrom = new Date('2026-01-01T00:00:00Z');
  await prisma.rateHistory.createMany({
    data: [
      { userId: admin.id, rateCents: admin.currentRateCents, effectiveFrom },
      { userId: alice.id, rateCents: alice.currentRateCents, effectiveFrom },
      { userId: bob.id, rateCents: bob.currentRateCents, effectiveFrom },
    ],
  });

  // Folders.
  const fall = await prisma.folder.create({
    data: { name: 'Fall 2026 Season', color: '#4f46e5' },
  });
  const ops = await prisma.folder.create({
    data: { name: 'Internal Ops', color: '#64748b' },
  });

  // Tags.
  const [ld, policy, evidence] = await Promise.all([
    prisma.tag.create({ data: { name: 'LD' } }),
    prisma.tag.create({ data: { name: 'Policy' } }),
    prisma.tag.create({ data: { name: 'evidence-cutting' } }),
  ]);

  // Projects.
  const nuclearAff = await prisma.project.create({
    data: {
      folderId: fall.id,
      name: 'Topic: Nuclear Energy — Aff Research',
      description: 'Research and evidence cuts for the Aff side of the nuclear-energy topic.',
      estimatedMinutes: 4 * 60,
      originalEstimatedMinutes: 4 * 60,
      dueAt: new Date('2026-05-01T23:59:00Z'),
      status: ProjectStatus.IN_PROGRESS,
      createdByUserId: admin.id,
      assignments: {
        create: [{ userId: alice.id }, { userId: bob.id }],
      },
      projectTags: {
        create: [{ tagId: policy.id }, { tagId: evidence.id }],
      },
    },
  });

  await prisma.project.create({
    data: {
      folderId: fall.id,
      name: 'LD Neg Case — Surveillance',
      estimatedMinutes: 3 * 60,
      originalEstimatedMinutes: 3 * 60,
      dueAt: new Date('2026-04-25T23:59:00Z'),
      status: ProjectStatus.NOT_STARTED,
      createdByUserId: admin.id,
      assignments: { create: [{ userId: alice.id }] },
      projectTags: { create: [{ tagId: ld.id }] },
    },
  });

  await prisma.project.create({
    data: {
      folderId: ops.id,
      name: 'Weekly Team Sync Notes',
      estimatedMinutes: 60,
      originalEstimatedMinutes: 60,
      status: ProjectStatus.IN_PROGRESS,
      createdByUserId: admin.id,
      assignments: { create: [{ userId: bob.id }] },
    },
  });

  // One historical time entry (Alice on nuclear aff, 90 minutes, billable, billed at snapshot rate).
  const started = new Date('2026-04-10T14:00:00Z');
  const ended = new Date('2026-04-10T15:30:00Z');
  await prisma.timeEntry.create({
    data: {
      userId: alice.id,
      projectId: nuclearAff.id,
      startedAt: started,
      endedAt: ended,
      description: 'Initial Aff topic survey',
      isBillable: true,
      rateCentsAtEntry: alice.currentRateCents,
      source: TimeEntrySource.WEB,
    },
  });

  const counts = {
    users: await prisma.user.count(),
    folders: await prisma.folder.count(),
    projects: await prisma.project.count(),
    tags: await prisma.tag.count(),
    assignments: await prisma.projectAssignment.count(),
    timeEntries: await prisma.timeEntry.count(),
  };
  console.log('Seed complete:', counts);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
