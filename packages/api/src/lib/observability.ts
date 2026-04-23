// Observability hooks. Kept deliberately thin: if the relevant env var is
// unset, these are no-ops. We don't take a hard dep on @sentry/node here —
// it's dynamically imported so local dev, tests, and the Docker image don't
// need the package unless Sentry is actually turned on.

import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../env.js';

type SentryLike = {
  init: (opts: { dsn: string; environment: string; tracesSampleRate: number }) => void;
  captureException: (err: unknown) => void;
};

let sentry: SentryLike | null = null;

export async function initObservability(app: FastifyInstance): Promise<void> {
  const env = loadEnv();
  if (!env.SENTRY_DSN) return;
  try {
    // Indirect so TypeScript doesn't try to resolve @sentry/node statically —
    // it's only present in deployments that opted into Sentry.
    const pkg = '@sentry/node';
    const mod = (await import(/* @vite-ignore */ pkg)) as unknown as SentryLike;
    mod.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      tracesSampleRate: 0.1,
    });
    sentry = mod;
    app.log.info('Sentry initialized');
  } catch (err) {
    app.log.warn({ err }, 'Sentry DSN set but @sentry/node not installed; skipping');
  }
}

export function reportError(err: unknown): void {
  if (sentry) sentry.captureException(err);
}
