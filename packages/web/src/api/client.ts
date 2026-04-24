const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  // Only set Content-Type when there's actually a body. Fastify 400s on an
  // empty body with Content-Type: application/json (bodyless POSTs like
  // /timer/stop and /auth/logout).
  const hasBody = init.body !== undefined && init.body !== null;
  const res = await fetch(`${API_ORIGIN}${path}`, {
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    ...init,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const err = (body as { error?: { code: string; message: string; details?: unknown } })
      ?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'http_error',
      err?.message ?? `HTTP ${res.status}`,
      err?.details,
    );
  }
  return body as T;
}

export function apiOrigin(): string {
  return API_ORIGIN;
}

export function wsUrl(path: string): string {
  // When API_ORIGIN is a path (e.g. "/api" via the Vercel proxy), build the
  // WebSocket URL against the current window origin. Vercel's HTTP rewrites
  // don't proxy WebSocket upgrades, so this will fail to connect in prod —
  // that's a known gap; real-time timer sync is best-effort, and the rest of
  // the app works fine without it.
  const base = API_ORIGIN.startsWith('/') ? window.location.origin : API_ORIGIN;
  const url = new URL(path, base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}
