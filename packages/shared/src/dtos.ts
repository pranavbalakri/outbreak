import { z } from 'zod';
import { RoleSchema, ProjectStatusSchema, TimeEntrySourceSchema } from './enums.js';

const IdSchema = z.string().min(1);
const DateTimeSchema = z.string().datetime();
const EmailSchema = z.string().email().max(254);

// ---------- User ----------
export const UserDtoSchema = z.object({
  id: IdSchema,
  name: z.string(),
  email: EmailSchema,
  role: RoleSchema,
  avatarUrl: z.string().url().nullable(),
  currentRateCents: z.number().int().nonnegative(),
  rateVisibleToSelf: z.boolean(),
  isActive: z.boolean(),
  timezone: z.string(),
  createdAt: DateTimeSchema,
});
export type UserDto = z.infer<typeof UserDtoSchema>;

export const CreateUserInputSchema = z.object({
  name: z.string().min(1).max(200),
  email: EmailSchema,
  role: RoleSchema,
  rateCents: z.number().int().nonnegative().default(0),
  timezone: z.string().default('America/New_York'),
});
export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;

export const UpdateUserInputSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  role: RoleSchema.optional(),
  timezone: z.string().optional(),
  rateVisibleToSelf: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof UpdateUserInputSchema>;

export const UpdateRateInputSchema = z.object({
  rateCents: z.number().int().nonnegative(),
  effectiveFrom: DateTimeSchema.optional(),
});
export type UpdateRateInput = z.infer<typeof UpdateRateInputSchema>;

// ---------- Folder ----------
export const FolderDtoSchema = z.object({
  id: IdSchema,
  name: z.string(),
  color: z.string().nullable(),
  parentFolderId: IdSchema.nullable(),
  archivedAt: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
});
export type FolderDto = z.infer<typeof FolderDtoSchema>;

export const CreateFolderInputSchema = z.object({
  name: z.string().min(1).max(200),
  color: z.string().max(32).optional(),
  parentFolderId: IdSchema.nullable().optional(),
});
export type CreateFolderInput = z.infer<typeof CreateFolderInputSchema>;

export const UpdateFolderInputSchema = CreateFolderInputSchema.partial().extend({
  archived: z.boolean().optional(),
});
export type UpdateFolderInput = z.infer<typeof UpdateFolderInputSchema>;

// ---------- Tag ----------
export const TagDtoSchema = z.object({
  id: IdSchema,
  name: z.string(),
});
export type TagDto = z.infer<typeof TagDtoSchema>;

export const CreateTagInputSchema = z.object({
  name: z.string().min(1).max(64),
});
export type CreateTagInput = z.infer<typeof CreateTagInputSchema>;

// ---------- Project ----------
export const ProjectDtoSchema = z.object({
  id: IdSchema,
  folderId: IdSchema,
  name: z.string(),
  description: z.string().nullable(),
  estimatedMinutes: z.number().int().nonnegative(),
  originalEstimatedMinutes: z.number().int().nonnegative(),
  dueAt: DateTimeSchema.nullable(),
  status: ProjectStatusSchema,
  createdByUserId: IdSchema,
  createdAt: DateTimeSchema,
  assigneeIds: z.array(IdSchema),
  tagIds: z.array(IdSchema),
  actualMinutes: z.number().int().nonnegative().optional(),
  varianceMinutes: z.number().int().optional(),
  isOverEstimate: z.boolean().optional(),
});
export type ProjectDto = z.infer<typeof ProjectDtoSchema>;

export const CreateProjectInputSchema = z.object({
  folderId: IdSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(10_000).optional(),
  estimatedMinutes: z.number().int().nonnegative(),
  dueAt: DateTimeSchema.optional(),
  assigneeIds: z.array(IdSchema).default([]),
  tagIds: z.array(IdSchema).default([]),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export const UpdateProjectInputSchema = z.object({
  folderId: IdSchema.optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(10_000).nullable().optional(),
  estimatedMinutes: z.number().int().nonnegative().optional(),
  dueAt: DateTimeSchema.nullable().optional(),
  status: ProjectStatusSchema.optional(),
});
export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;

export const UpcomingProjectFiltersSchema = z.object({
  assigneeId: IdSchema.optional(),
  folderId: IdSchema.optional(),
});
export type UpcomingProjectFilters = z.infer<typeof UpcomingProjectFiltersSchema>;

export const UpcomingProjectDtoSchema = ProjectDtoSchema.extend({
  dueAt: DateTimeSchema, // not nullable in upcoming
  isOverdue: z.boolean(),
});
export type UpcomingProjectDto = z.infer<typeof UpcomingProjectDtoSchema>;

export const ProjectListFiltersSchema = z.object({
  folderId: IdSchema.optional(),
  status: ProjectStatusSchema.optional(),
  tagId: IdSchema.optional(),
  assigneeId: IdSchema.optional(),
  dueBefore: DateTimeSchema.optional(),
  search: z.string().min(1).max(200).optional(),
});
export type ProjectListFilters = z.infer<typeof ProjectListFiltersSchema>;

// ---------- Task ----------
export const TaskDtoSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  name: z.string(),
  estimatedMinutes: z.number().int().nonnegative(),
  originalEstimatedMinutes: z.number().int().nonnegative(),
  dueAt: DateTimeSchema.nullable(),
  status: ProjectStatusSchema,
  createdAt: DateTimeSchema,
  assigneeIds: z.array(IdSchema),
});
export type TaskDto = z.infer<typeof TaskDtoSchema>;

export const CreateTaskInputSchema = z.object({
  name: z.string().min(1).max(200),
  estimatedMinutes: z.number().int().nonnegative(),
  dueAt: DateTimeSchema.optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

export const UpdateTaskInputSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  estimatedMinutes: z.number().int().nonnegative().optional(),
  dueAt: DateTimeSchema.nullable().optional(),
  status: ProjectStatusSchema.optional(),
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

// ---------- Time entries ----------
export const TimeEntryDtoSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  projectId: IdSchema.nullable(),
  taskId: IdSchema.nullable(),
  startedAt: DateTimeSchema,
  endedAt: DateTimeSchema.nullable(),
  description: z.string().nullable(),
  isBillable: z.boolean(),
  locked: z.boolean(),
  rateCentsAtEntry: z.number().int().nonnegative(),
  source: TimeEntrySourceSchema,
  createdAt: DateTimeSchema,
});
export type TimeEntryDto = z.infer<typeof TimeEntryDtoSchema>;

export const CreateManualTimeEntryInputSchema = z
  .object({
    projectId: IdSchema.nullable().optional(),
    taskId: IdSchema.nullable().optional(),
    startedAt: DateTimeSchema,
    endedAt: DateTimeSchema,
    description: z.string().max(2_000).optional(),
    isBillable: z.boolean().default(true),
  })
  .refine((v) => new Date(v.endedAt).getTime() > new Date(v.startedAt).getTime(), {
    message: 'endedAt must be after startedAt',
    path: ['endedAt'],
  })
  .refine((v) => !v.taskId || !!v.projectId, {
    message: 'taskId requires projectId',
    path: ['taskId'],
  });
export type CreateManualTimeEntryInput = z.infer<typeof CreateManualTimeEntryInputSchema>;

export const UpdateTimeEntryInputSchema = z.object({
  projectId: IdSchema.nullable().optional(),
  taskId: IdSchema.nullable().optional(),
  startedAt: DateTimeSchema.optional(),
  endedAt: DateTimeSchema.optional(),
  description: z.string().max(2_000).nullable().optional(),
  isBillable: z.boolean().optional(),
});
export type UpdateTimeEntryInput = z.infer<typeof UpdateTimeEntryInputSchema>;

export const StartTimerInputSchema = z.object({
  projectId: IdSchema.nullable().optional(),
  taskId: IdSchema.nullable().optional(),
  description: z.string().max(2_000).optional(),
  source: z.enum(['WEB', 'EXTENSION']).default('WEB'),
});
export type StartTimerInput = z.infer<typeof StartTimerInputSchema>;

export const TimerEventSchema = z.object({
  type: z.enum(['timer.started', 'timer.stopped', 'timer.updated']),
  entry: TimeEntryDtoSchema.nullable(),
  stoppedEntry: TimeEntryDtoSchema.optional(),
});
export type TimerEvent = z.infer<typeof TimerEventSchema>;

export const TimeEntryListFiltersSchema = z.object({
  userId: IdSchema.optional(),
  projectId: IdSchema.optional(),
  taskId: IdSchema.optional(),
  from: DateTimeSchema.optional(),
  to: DateTimeSchema.optional(),
  isBillable: z.coerce.boolean().optional(),
  unassigned: z.coerce.boolean().optional(),
});
export type TimeEntryListFilters = z.infer<typeof TimeEntryListFiltersSchema>;

// ---------- Reports ----------
export const ReportGroupBySchema = z.enum(['instructor', 'project', 'folder', 'tag']);
export type ReportGroupBy = z.infer<typeof ReportGroupBySchema>;

export const ReportSummaryFiltersSchema = z.object({
  from: DateTimeSchema,
  to: DateTimeSchema,
  groupBy: ReportGroupBySchema,
  billable: z.coerce.boolean().optional(),
  folderId: IdSchema.optional(),
  tagId: IdSchema.optional(),
  instructorId: IdSchema.optional(),
  includeUnassigned: z.coerce.boolean().default(true),
});
export type ReportSummaryFilters = z.infer<typeof ReportSummaryFiltersSchema>;

export const ReportSummaryRowSchema = z.object({
  key: z.string(), // id of the group, or "unassigned"
  label: z.string(),
  minutes: z.number().int().nonnegative(),
  billableMinutes: z.number().int().nonnegative(),
  costCents: z.number().int().nonnegative(),
  isUnassigned: z.boolean().optional(),
});
export type ReportSummaryRow = z.infer<typeof ReportSummaryRowSchema>;

export const ReportSummaryResponseSchema = z.object({
  from: DateTimeSchema,
  to: DateTimeSchema,
  groupBy: ReportGroupBySchema,
  rows: z.array(ReportSummaryRowSchema),
  totals: z.object({
    minutes: z.number().int().nonnegative(),
    billableMinutes: z.number().int().nonnegative(),
    costCents: z.number().int().nonnegative(),
  }),
  currency: z.string(),
  rateSource: z.literal('entry_snapshot'),
});
export type ReportSummaryResponse = z.infer<typeof ReportSummaryResponseSchema>;

export const ReportDailyFiltersSchema = z.object({
  from: DateTimeSchema,
  to: DateTimeSchema,
  folderId: IdSchema.optional(),
  tagId: IdSchema.optional(),
  instructorId: IdSchema.optional(),
  billable: z.coerce.boolean().optional(),
  includeUnassigned: z.coerce.boolean().default(true),
});
export type ReportDailyFilters = z.infer<typeof ReportDailyFiltersSchema>;

export const ReportDailyCellSchema = z.object({
  date: z.string(), // YYYY-MM-DD in UTC
  instructorId: IdSchema,
  instructorName: z.string(),
  minutes: z.number().int().nonnegative(),
});
export type ReportDailyCell = z.infer<typeof ReportDailyCellSchema>;

export const ReportDailyResponseSchema = z.object({
  from: DateTimeSchema,
  to: DateTimeSchema,
  cells: z.array(ReportDailyCellSchema),
  instructors: z.array(z.object({ id: IdSchema, name: z.string() })),
  days: z.array(z.string()),
});
export type ReportDailyResponse = z.infer<typeof ReportDailyResponseSchema>;

export const ReportProjectsFiltersSchema = z.object({
  from: DateTimeSchema,
  to: DateTimeSchema,
  folderId: IdSchema.optional(),
});
export type ReportProjectsFilters = z.infer<typeof ReportProjectsFiltersSchema>;

export const ReportProjectsRowSchema = z.object({
  projectId: IdSchema,
  name: z.string(),
  folderId: IdSchema,
  folderName: z.string(),
  status: ProjectStatusSchema,
  estimatedMinutes: z.number().int().nonnegative(),
  originalEstimatedMinutes: z.number().int().nonnegative(),
  actualMinutes: z.number().int().nonnegative(),
  varianceMinutes: z.number().int(),
  originalVarianceMinutes: z.number().int(),
  isOverEstimate: z.boolean(),
  costCents: z.number().int().nonnegative(),
});
export type ReportProjectsRow = z.infer<typeof ReportProjectsRowSchema>;

export const ReportProjectsResponseSchema = z.object({
  from: DateTimeSchema,
  to: DateTimeSchema,
  rows: z.array(ReportProjectsRowSchema),
  unassigned: z.object({
    minutes: z.number().int().nonnegative(),
    costCents: z.number().int().nonnegative(),
  }),
  currency: z.string(),
  rateSource: z.literal('entry_snapshot'),
});
export type ReportProjectsResponse = z.infer<typeof ReportProjectsResponseSchema>;

// ---------- Week locks ----------
export const WeekLockDtoSchema = z.object({
  id: IdSchema,
  isoYear: z.number().int(),
  isoWeek: z.number().int(),
  lockedByUserId: IdSchema,
  lockedAt: DateTimeSchema,
});
export type WeekLockDto = z.infer<typeof WeekLockDtoSchema>;

export const WeekSummarySchema = z.object({
  isoYear: z.number().int(),
  isoWeek: z.number().int(),
  startDate: z.string(), // YYYY-MM-DD
  endDate: z.string(),
  totalMinutes: z.number().int().nonnegative(),
  locked: z.boolean(),
  lockedByUserId: IdSchema.nullable(),
  lockedAt: DateTimeSchema.nullable(),
});
export type WeekSummary = z.infer<typeof WeekSummarySchema>;

// ---------- Notifications ----------
export const NotificationKindSchema = z.enum([
  'project.assigned',
  'project.overdue',
  'week.locked',
]);
export type NotificationKind = z.infer<typeof NotificationKindSchema>;

export const NotificationDtoSchema = z.object({
  id: IdSchema,
  kind: NotificationKindSchema,
  payload: z.record(z.unknown()),
  readAt: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
});
export type NotificationDto = z.infer<typeof NotificationDtoSchema>;

// ---------- API tokens ----------
export const ApiTokenDtoSchema = z.object({
  id: IdSchema,
  label: z.string().nullable(),
  source: z.string(),
  createdAt: DateTimeSchema,
  lastUsedAt: DateTimeSchema.nullable(),
  revokedAt: DateTimeSchema.nullable(),
});
export type ApiTokenDto = z.infer<typeof ApiTokenDtoSchema>;

// ---------- Rate history ----------
export const RateHistoryEntrySchema = z.object({
  id: IdSchema,
  rateCents: z.number().int().nonnegative(),
  effectiveFrom: DateTimeSchema,
  createdAt: DateTimeSchema,
});
export type RateHistoryEntry = z.infer<typeof RateHistoryEntrySchema>;

// ---------- Feedback ----------
export const FeedbackDtoSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  userName: z.string(),
  userEmail: EmailSchema,
  message: z.string(),
  pageUrl: z.string().nullable(),
  resolvedAt: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
});
export type FeedbackDto = z.infer<typeof FeedbackDtoSchema>;

export const CreateFeedbackInputSchema = z.object({
  message: z.string().min(1).max(10_000),
  pageUrl: z.string().url().max(2_000).optional(),
});
export type CreateFeedbackInput = z.infer<typeof CreateFeedbackInputSchema>;

// ---------- Usage analytics (admin) ----------
// Weekly count of time entries by source. Surfaces "are instructors actually
// using the extension?" — the metric spec §3.3 calls out.
export const UsageWeekRowSchema = z.object({
  isoYear: z.number().int(),
  isoWeek: z.number().int(),
  source: TimeEntrySourceSchema,
  count: z.number().int().nonnegative(),
});
export type UsageWeekRow = z.infer<typeof UsageWeekRowSchema>;

export const UsageSummarySchema = z.object({
  weeks: z.array(UsageWeekRowSchema),
  totalsBySource: z.record(TimeEntrySourceSchema, z.number().int().nonnegative()),
});
export type UsageSummary = z.infer<typeof UsageSummarySchema>;

// ---------- Errors ----------
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
