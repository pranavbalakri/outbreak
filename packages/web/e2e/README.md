# End-to-end tests

Playwright tests that exercise the 3 key flows called out in plan.md Step 36:

1. Admin creates a project.
2. Instructor tracks time via the web app.
3. Admin runs a monthly report.

## Running

These tests run against a live stack — spin one up first:

```
# Terminal 1 — Postgres
pnpm db:up
pnpm --filter @breaklog/api db:migrate deploy
pnpm --filter @breaklog/api db:seed

# Terminal 2 — API
pnpm --filter @breaklog/api dev

# Terminal 3 — Web
pnpm --filter @breaklog/web dev
```

Then in another shell:

```
E2E_WEB_URL=http://127.0.0.1:5173 \
E2E_API_URL=http://127.0.0.1:4000 \
E2E_ADMIN_USER_ID=<id-from-seed> \
E2E_INSTRUCTOR_USER_ID=<id-from-seed> \
pnpm --filter @breaklog/web e2e
```

Auth is short-circuited via `scripts/mint-dev-session.ts` — the tests mint
session JWTs for the seeded users and inject them as cookies before loading
the app.
