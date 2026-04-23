# Deployment

This document describes how Outbreak is deployed. It is tool-agnostic where
possible — anywhere we reference Fly.io or Vercel, you can swap in Render,
Railway, Cloudflare Pages, etc. without code changes.

## Architecture

- **API** (`packages/api`) — Fastify + Prisma, Docker image built from
  [`packages/api/Dockerfile`](packages/api/Dockerfile). Runs `prisma migrate
  deploy` on boot, then `node dist/server.js`.
- **Web** (`packages/web`) — Vite static bundle. `pnpm --filter @outbreak/web
  build` produces `packages/web/dist/`. Any static host works; a [`vercel.json`](packages/web/vercel.json)
  is provided for Vercel.
- **Extension** (`packages/extension`) — `pnpm --filter @outbreak/extension
  build` emits `dist/extension.zip`. Upload to Chrome Web Store as
  **Unlisted**; share the install link with Vik.
- **Database** — Managed Postgres. Fly Postgres, Neon, and Render all work.

## Secrets

All of these are required in production except where noted:

| Name                    | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `DATABASE_URL`          | Postgres connection string                           |
| `JWT_SECRET`            | 48+ random bytes; signs session cookies              |
| `GOOGLE_CLIENT_ID`      | Google OAuth 2.0 web client                          |
| `GOOGLE_CLIENT_SECRET`  | Google OAuth 2.0 web client                          |
| `API_ORIGIN`            | Public HTTPS URL of the API                          |
| `WEB_ORIGIN`            | Public HTTPS URL of the web app (CORS allowlist)     |
| `SENTRY_DSN`            | Optional — enables error reporting                   |
| `LOG_SHIPPER_URL`       | Optional — reserved for pino transport to Axiom/etc. |

## Fly.io — API

```bash
cd packages/api
fly launch --copy-config --no-deploy   # uses fly.toml as-is
fly secrets set \
  DATABASE_URL=... \
  JWT_SECRET=... \
  GOOGLE_CLIENT_ID=... \
  GOOGLE_CLIENT_SECRET=...
fly deploy
fly status
curl https://api.outbreak.example/healthz   # → { ok: true }
```

The Dockerfile is a multi-stage build that installs dev deps to compile the
TypeScript, then ships only prod deps + compiled JS + Prisma engines. The
container runs as non-root (`USER node`) and uses `dumb-init` as PID 1 to
forward signals to Node.

## Vercel — Web

1. Import the GitHub repo as a Vercel project.
2. Set the root to the repo root (Vercel will pick up `packages/web/vercel.json`).
3. Set env `VITE_API_ORIGIN=https://api.outbreak.example` and optionally
   `VITE_SENTRY_DSN`.
4. Assign the custom domain.

## Chrome extension

```bash
pnpm --filter @outbreak/extension build
# produces packages/extension/dist/extension.zip
```

Submit as an **Unlisted** listing in the Chrome Web Store Developer Dashboard
and share the link with the instructor team. See
[packages/extension/README.md](packages/extension/README.md).

## Observability

- **Sentry** — set `SENTRY_DSN` on the API; the error handler calls
  `reportError` for 500s. The web app is expected to initialize
  `@sentry/react` at boot if `VITE_SENTRY_DSN` is set.
- **Logs** — Fastify uses pino. In production, logs go to stdout; Fly/Render
  stream them to their log aggregator. To ship to Axiom or Logtail, wire a
  pino transport via `LOG_SHIPPER_URL`.
- **Uptime** — configure an external uptime check (e.g., Better Stack,
  UptimeRobot) against `${API_ORIGIN}/healthz` on a 1-minute interval.

## Backups

A nightly pg_dump with 14-day rotation is provided in
[`scripts/backup-postgres.sh`](scripts/backup-postgres.sh). Run it via cron
on any host with `pg_dump` and network reach to Postgres. If you use Fly
Postgres, also enable their managed daily snapshots as a second line of
defense.

## Releasing

1. Merge to `main`. CI runs lint, typecheck, API tests, and web tests.
2. `fly deploy` (API) and the Vercel auto-deploy (web) run from the same
   commit.
3. Run E2E smoke tests against staging before flipping DNS on bumps that
   touch auth or timer flows.
