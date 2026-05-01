// Destructive: wipes all projects, tasks, assignments, and time entries.
// Keeps folders, tags, users, rate history, api tokens, and audit logs.
//
// Usage (from repo root):
//   DATABASE_URL='postgresql://…'  \
//   pnpm --filter @breaklog/api exec tsx scripts/wipe-tracking-data.ts --yes
//
// Refuses to run without `--yes` so you can't fat-finger it into production.
import { prisma } from '../src/db.js';

async function main() {
  if (!process.argv.includes('--yes')) {
    console.error(
      'Refusing to run without --yes. This will permanently delete every project, task, assignment, and time entry.',
    );
    console.error(
      'Re-run with: pnpm --filter @breaklog/api exec tsx scripts/wipe-tracking-data.ts --yes',
    );
    process.exit(2);
  }

  const url = process.env['DATABASE_URL'];
  console.log(`Target: ${url?.replace(/:[^:@/]+@/, ':***@')}`);

  const before = {
    projects: await prisma.project.count(),
    tasks: await prisma.task.count(),
    timeEntries: await prisma.timeEntry.count(),
    projectAssignments: await prisma.projectAssignment.count(),
    taskAssignments: await prisma.taskAssignment.count(),
    projectTags: await prisma.projectTag.count(),
    folders: await prisma.folder.count(),
    tags: await prisma.tag.count(),
    users: await prisma.user.count(),
  };
  console.log('Before:', before);

  // Order matters due to FKs. The week-lock trigger on `time_entries` rejects
  // writes inside locked weeks — disable it by name (Neon's role can't touch
  // the internal system FK triggers, so `DISABLE TRIGGER ALL` is rejected).
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'ALTER TABLE time_entries DISABLE TRIGGER "time_entries_week_lock_guard"',
    );
    try {
      await tx.$executeRawUnsafe(
        'TRUNCATE TABLE ' +
          [
            'time_entries',
            'project_tags',
            'project_assignments',
            'task_assignments',
            'tasks',
            'projects',
          ].join(', ') +
          ' RESTART IDENTITY CASCADE',
      );
    } finally {
      await tx.$executeRawUnsafe(
        'ALTER TABLE time_entries ENABLE TRIGGER "time_entries_week_lock_guard"',
      );
    }
  });

  const after = {
    projects: await prisma.project.count(),
    tasks: await prisma.task.count(),
    timeEntries: await prisma.timeEntry.count(),
    projectAssignments: await prisma.projectAssignment.count(),
    taskAssignments: await prisma.taskAssignment.count(),
    projectTags: await prisma.projectTag.count(),
    folders: await prisma.folder.count(),
    tags: await prisma.tag.count(),
    users: await prisma.user.count(),
  };
  console.log('After: ', after);
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
