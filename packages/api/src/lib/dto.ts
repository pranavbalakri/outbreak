import type { Folder, Project, Tag, Task, TimeEntry, User } from '@prisma/client';
import type {
  FolderDto,
  ProjectDto,
  TagDto,
  TaskDto,
  TimeEntryDto,
  UserDto,
} from '@outbreak/shared';

export function toUserDto(u: User): UserDto {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    avatarUrl: u.avatarUrl,
    currentRateCents: u.currentRateCents,
    rateVisibleToSelf: u.rateVisibleToSelf,
    isActive: u.isActive,
    timezone: u.timezone,
    createdAt: u.createdAt.toISOString(),
  };
}

export function toFolderDto(f: Folder): FolderDto {
  return {
    id: f.id,
    name: f.name,
    color: f.color,
    parentFolderId: f.parentFolderId,
    archivedAt: f.archivedAt?.toISOString() ?? null,
    createdAt: f.createdAt.toISOString(),
  };
}

export function toTagDto(t: Tag): TagDto {
  return { id: t.id, name: t.name };
}

export function toProjectDto(
  p: Project & {
    assignments?: { userId: string; user?: { id: string; name: string } }[];
    projectTags?: { tagId: string }[];
  },
  extras?: { actualMinutes?: number },
): ProjectDto {
  const dto: ProjectDto = {
    id: p.id,
    folderId: p.folderId,
    name: p.name,
    description: p.description,
    estimatedMinutes: p.estimatedMinutes,
    originalEstimatedMinutes: p.originalEstimatedMinutes,
    dueAt: p.dueAt?.toISOString() ?? null,
    status: p.status,
    createdByUserId: p.createdByUserId,
    createdAt: p.createdAt.toISOString(),
    assigneeIds: p.assignments?.map((a) => a.userId) ?? [],
    assignees:
      p.assignments
        ?.map((a) => a.user)
        .filter((u): u is { id: string; name: string } => !!u) ?? [],
    tagIds: p.projectTags?.map((t) => t.tagId) ?? [],
  };
  if (extras?.actualMinutes !== undefined) {
    dto.actualMinutes = extras.actualMinutes;
    dto.varianceMinutes = extras.actualMinutes - p.estimatedMinutes;
    dto.isOverEstimate = extras.actualMinutes > p.estimatedMinutes;
  }
  return dto;
}

export function toTaskDto(
  t: Task & { assignments?: { userId: string }[] },
): TaskDto {
  return {
    id: t.id,
    projectId: t.projectId,
    name: t.name,
    estimatedMinutes: t.estimatedMinutes,
    originalEstimatedMinutes: t.originalEstimatedMinutes,
    dueAt: t.dueAt?.toISOString() ?? null,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    assigneeIds: t.assignments?.map((a) => a.userId) ?? [],
  };
}

export function toTimeEntryDto(
  te: TimeEntry & { user?: { id: string; name: string } },
): TimeEntryDto {
  const dto: TimeEntryDto = {
    id: te.id,
    userId: te.userId,
    projectId: te.projectId,
    taskId: te.taskId,
    startedAt: te.startedAt.toISOString(),
    endedAt: te.endedAt?.toISOString() ?? null,
    description: te.description,
    isBillable: te.isBillable,
    locked: te.locked,
    rateCentsAtEntry: te.rateCentsAtEntry,
    source: te.source,
    createdAt: te.createdAt.toISOString(),
  };
  if (te.user) dto.user = { id: te.user.id, name: te.user.name };
  return dto;
}
