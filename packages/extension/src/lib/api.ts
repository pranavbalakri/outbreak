import type { ProjectDto, TimeEntryDto, UserDto } from '@outbreak/shared';
import { API_ORIGIN } from './config.js';
import { readStorage, writeStorage } from './storage.js';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const { token } = await readStorage('token');
  if (!token) throw new ApiError(401, 'no_token', 'Not signed in');

  const res = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });

  // Tag last-online so the offline banner can decide. Any successful HTTP
  // round-trip counts — a 4xx still means the network reached the server.
  await writeStorage({ lastOnline: Date.now() });

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const err = (body as { error?: { code: string; message: string } })?.error;
    throw new ApiError(res.status, err?.code ?? 'http_error', err?.message ?? `HTTP ${res.status}`);
  }
  return body as T;
}

export const fetchMe = () => call<{ user: UserDto }>('/auth/me');

export const fetchAssignedProjects = () =>
  call<{ projects: ProjectDto[] }>('/projects');

export const fetchCurrentTimer = () =>
  call<{ entry: TimeEntryDto | null }>('/timer/current');

export const startTimer = (input: {
  projectId?: string | null;
  description?: string;
}) =>
  call<{ entry: TimeEntryDto; stoppedEntry: TimeEntryDto | null }>('/timer/start', {
    method: 'POST',
    body: JSON.stringify({
      source: 'EXTENSION',
      projectId: input.projectId ?? null,
      ...(input.description ? { description: input.description } : {}),
    }),
  });

export const stopTimer = () =>
  call<{ entry: TimeEntryDto }>('/timer/stop', { method: 'POST' });
