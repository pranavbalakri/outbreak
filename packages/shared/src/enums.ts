import { z } from 'zod';

export const RoleSchema = z.enum(['ADMIN', 'INSTRUCTOR']);
export type Role = z.infer<typeof RoleSchema>;

export const ProjectStatusSchema = z.enum([
  'NOT_STARTED',
  'IN_PROGRESS',
  'BLOCKED',
  'COMPLETE',
  'ARCHIVED',
]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const TimeEntrySourceSchema = z.enum(['WEB', 'EXTENSION', 'MANUAL']);
export type TimeEntrySource = z.infer<typeof TimeEntrySourceSchema>;
