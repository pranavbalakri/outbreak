import type {
  FolderDto,
  ProjectDto,
  TagDto,
  TaskDto,
  TimeEntryDto,
  UpcomingProjectDto,
  UserDto,
} from '@breaklog/shared';
import { api, apiOrigin } from './client.js';

// --- Auth
export const fetchMe = () => api<{ user: UserDto }>('/auth/me');
export const logout = () => api('/auth/logout', { method: 'POST' });

// --- Folders
export const fetchFolders = () => api<{ folders: FolderDto[] }>('/folders');
export const createFolder = (input: {
  name: string;
  color?: string;
  parentFolderId?: string | null;
}) =>
  api<{ folder: FolderDto }>('/folders', { method: 'POST', body: JSON.stringify(input) });
export const deleteFolder = (id: string) =>
  api(`/folders/${id}`, { method: 'DELETE' });

// --- Tags
export const fetchTags = () => api<{ tags: TagDto[] }>('/tags');
export const createTag = (input: { name: string }) =>
  api<{ tag: TagDto }>('/tags', { method: 'POST', body: JSON.stringify(input) });

// --- Users
export const fetchUsers = () => api<{ users: UserDto[] }>('/users');

// --- Projects
export interface ProjectListParams {
  folderId?: string | undefined;
  status?: string | undefined;
  tagId?: string | undefined;
  assigneeId?: string | undefined;
  search?: string | undefined;
}
export const fetchProjects = (params: ProjectListParams = {}) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, String(v));
  }
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return api<{ projects: ProjectDto[] }>(`/projects${suffix}`);
};
export const fetchProject = (id: string) =>
  api<{ project: ProjectDto }>(`/projects/${id}`);
export const fetchUpcomingProjects = () =>
  api<{ projects: UpcomingProjectDto[] }>('/projects/upcoming');

export const createProject = (input: {
  folderId: string;
  name: string;
  description?: string | undefined;
  estimatedMinutes: number;
  dueAt?: string | undefined;
  assigneeIds?: string[] | undefined;
  tagIds?: string[] | undefined;
}) => {
  const body: Record<string, unknown> = {
    folderId: input.folderId,
    name: input.name,
    estimatedMinutes: input.estimatedMinutes,
  };
  if (input.description) body.description = input.description;
  if (input.dueAt) body.dueAt = input.dueAt;
  if (input.assigneeIds) body.assigneeIds = input.assigneeIds;
  if (input.tagIds) body.tagIds = input.tagIds;
  return api<{ project: ProjectDto }>('/projects', {
    method: 'POST',
    body: JSON.stringify(body),
  });
};

export const updateProject = (
  id: string,
  input: Partial<{
    folderId: string;
    name: string;
    description: string | null;
    estimatedMinutes: number;
    dueAt: string | null;
    status: string;
  }>,
) =>
  api<{ project: ProjectDto }>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

export const deleteProject = (id: string) =>
  api(`/projects/${id}`, { method: 'DELETE' });

export const addAssignee = (projectId: string, userId: string) =>
  api(`/projects/${projectId}/assignees`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
export const removeAssignee = (projectId: string, userId: string) =>
  api(`/projects/${projectId}/assignees/${userId}`, { method: 'DELETE' });
export const addProjectTag = (projectId: string, tagId: string) =>
  api(`/projects/${projectId}/tags`, {
    method: 'POST',
    body: JSON.stringify({ tagId }),
  });
export const removeProjectTag = (projectId: string, tagId: string) =>
  api(`/projects/${projectId}/tags/${tagId}`, { method: 'DELETE' });

// --- Tasks
export const fetchTasks = (projectId: string) =>
  api<{ tasks: TaskDto[] }>(`/projects/${projectId}/tasks`);
export const createTask = (
  projectId: string,
  input: { name: string; estimatedMinutes: number; dueAt?: string | undefined },
) => {
  const body: Record<string, unknown> = {
    name: input.name,
    estimatedMinutes: input.estimatedMinutes,
  };
  if (input.dueAt) body.dueAt = input.dueAt;
  return api<{ task: TaskDto }>(`/projects/${projectId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
};
export const updateTask = (
  taskId: string,
  input: Partial<{
    name: string;
    estimatedMinutes: number;
    dueAt: string | null;
    status: string;
  }>,
) =>
  api<{ task: TaskDto }>(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
export const deleteTask = (taskId: string) =>
  api(`/tasks/${taskId}`, { method: 'DELETE' });

// --- Time entries
export interface TimeEntryFilters {
  userId?: string | undefined;
  projectId?: string | undefined;
  taskId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  isBillable?: boolean | undefined;
  unassigned?: boolean | undefined;
}
export const fetchTimeEntries = (params: TimeEntryFilters = {}) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) q.set(k, String(v));
  }
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return api<{ entries: TimeEntryDto[] }>(`/time-entries${suffix}`);
};
export const createTimeEntry = (input: {
  projectId?: string | null | undefined;
  taskId?: string | null | undefined;
  startedAt: string;
  endedAt: string;
  description?: string | undefined;
  isBillable?: boolean | undefined;
}) => {
  const body: Record<string, unknown> = {
    startedAt: input.startedAt,
    endedAt: input.endedAt,
  };
  if (input.projectId !== undefined) body.projectId = input.projectId;
  if (input.taskId !== undefined) body.taskId = input.taskId;
  if (input.description) body.description = input.description;
  if (input.isBillable !== undefined) body.isBillable = input.isBillable;
  return api<{ entry: TimeEntryDto }>('/time-entries', {
    method: 'POST',
    body: JSON.stringify(body),
  });
};
export const updateTimeEntry = (
  id: string,
  input: Partial<{
    projectId: string | null;
    taskId: string | null;
    startedAt: string;
    endedAt: string;
    description: string | null;
    isBillable: boolean;
  }>,
) =>
  api<{ entry: TimeEntryDto }>(`/time-entries/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
export const deleteTimeEntry = (id: string) =>
  api(`/time-entries/${id}`, { method: 'DELETE' });

// --- Reports
import type {
  ReportDailyResponse,
  ReportProjectsResponse,
  ReportSummaryResponse,
  ReportGroupBy,
  RateHistoryEntry,
  NotificationDto,
  WeekSummary,
  ApiTokenDto,
} from '@breaklog/shared';

export interface ReportRangeFilters {
  from: string;
  to: string;
  folderId?: string | undefined;
  tagId?: string | undefined;
  instructorId?: string | undefined;
  billable?: boolean | undefined;
  includeUnassigned?: boolean | undefined;
}

function reportQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  return q.toString() ? `?${q.toString()}` : '';
}

export const fetchReportSummary = (
  filters: ReportRangeFilters & { groupBy: ReportGroupBy },
) =>
  api<ReportSummaryResponse>(
    `/reports/summary${reportQuery({ ...filters } as Record<string, unknown>)}`,
  );

export const fetchReportDaily = (filters: ReportRangeFilters) =>
  api<ReportDailyResponse>(
    `/reports/daily${reportQuery({ ...filters } as Record<string, unknown>)}`,
  );

export const fetchReportProjects = (filters: {
  from: string;
  to: string;
  folderId?: string | undefined;
}) => api<ReportProjectsResponse>(`/reports/projects${reportQuery(filters)}`);

export function reportPdfUrl(filters: ReportRangeFilters): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  return `${apiOrigin()}/reports/export.pdf${q.toString() ? `?${q.toString()}` : ''}`;
}

export function reportCsvUrl(filters: ReportRangeFilters): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  return `${apiOrigin()}/reports/export.csv${q.toString() ? `?${q.toString()}` : ''}`;
}

// --- Rate history
export const fetchRateHistory = (userId: string) =>
  api<{ history: RateHistoryEntry[] }>(`/users/${userId}/rate-history`);

export const updateUserRate = (userId: string, rateCents: number) =>
  api<{ user: UserDto }>(`/users/${userId}/rate`, {
    method: 'PATCH',
    body: JSON.stringify({ rateCents }),
  });

export const createUser = (input: {
  name: string;
  email: string;
  role: 'ADMIN' | 'INSTRUCTOR';
  rateCents: number;
}) =>
  api<{ user: UserDto }>('/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const updateUser = (
  id: string,
  input: Partial<{
    name: string;
    role: 'ADMIN' | 'INSTRUCTOR';
    isActive: boolean;
    rateVisibleToSelf: boolean;
  }>,
) =>
  api<{ user: UserDto }>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

export const deactivateUser = (id: string) =>
  api(`/users/${id}`, { method: 'DELETE' });

// --- Notifications
export const fetchNotifications = (params: { unread?: boolean; limit?: number } = {}) => {
  const q = new URLSearchParams();
  if (params.unread) q.set('unread', 'true');
  if (params.limit) q.set('limit', String(params.limit));
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return api<{ unreadCount: number; notifications: NotificationDto[] }>(
    `/notifications${suffix}`,
  );
};
export const markNotificationRead = (id: string) =>
  api(`/notifications/${id}/read`, { method: 'POST' });
export const markAllNotificationsRead = () =>
  api<{ updated: number }>('/notifications/read-all', { method: 'POST' });

// --- Weeks
export const fetchWeeks = () => api<{ weeks: WeekSummary[] }>('/weeks');
export const lockWeek = (isoYear: number, isoWeek: number) =>
  api(`/weeks/${isoYear}/${isoWeek}/lock`, { method: 'POST' });
export const unlockWeek = (isoYear: number, isoWeek: number) =>
  api(`/weeks/${isoYear}/${isoWeek}/lock`, { method: 'DELETE' });

// --- Feedback
import type { FeedbackDto, UsageSummary } from '@breaklog/shared';

export const submitFeedback = (input: { message: string; pageUrl?: string | undefined }) =>
  api<{ feedback: { id: string; createdAt: string } }>('/feedback', {
    method: 'POST',
    body: JSON.stringify(input),
  });
export const fetchFeedback = (includeResolved = false) => {
  const q = includeResolved ? '?includeResolved=true' : '';
  return api<{ feedback: FeedbackDto[] }>(`/feedback${q}`);
};
export const resolveFeedback = (id: string, resolved: boolean) =>
  api(`/feedback/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ resolved }),
  });

// --- Usage analytics (admin)
export const fetchUsageSummary = (params: { from?: string; to?: string } = {}) => {
  const q = new URLSearchParams();
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return api<UsageSummary>(`/reports/usage${suffix}`);
};

// --- API tokens
export const fetchApiTokens = () => api<{ tokens: ApiTokenDto[] }>('/api-tokens');
export const revokeApiToken = (id: string) =>
  api(`/api-tokens/${id}`, { method: 'DELETE' });

// --- Folder CRUD extras
export const updateFolder = (
  id: string,
  input: Partial<{
    name: string;
    color: string;
    archived: boolean;
    parentFolderId: string | null;
  }>,
) =>
  api<{ folder: FolderDto }>(`/folders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
export const deleteTag = (id: string) =>
  api(`/tags/${id}`, { method: 'DELETE' });

// --- Timer
export const fetchCurrentTimer = () =>
  api<{ entry: TimeEntryDto | null }>('/timer/current');
export const startTimer = (input: {
  projectId?: string | null | undefined;
  taskId?: string | null | undefined;
  description?: string | undefined;
  source?: 'WEB' | 'EXTENSION' | undefined;
}) => {
  const body: Record<string, unknown> = { source: input.source ?? 'WEB' };
  if (input.projectId !== undefined) body.projectId = input.projectId;
  if (input.taskId !== undefined) body.taskId = input.taskId;
  if (input.description) body.description = input.description;
  return api<{ entry: TimeEntryDto; stoppedEntry: TimeEntryDto | null }>('/timer/start', {
    method: 'POST',
    body: JSON.stringify(body),
  });
};
export const stopTimer = () =>
  api<{ entry: TimeEntryDto }>('/timer/stop', { method: 'POST' });
