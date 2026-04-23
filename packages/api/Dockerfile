# Multi-stage build for the Outbreak API.
# Stage 1: install deps (with dev) and build the monorepo subset we need.
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /repo

# Copy workspace manifests first for better layer caching.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/api/package.json packages/api/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile --filter @outbreak/api... --filter @outbreak/shared...

# Source
COPY packages/shared packages/shared
COPY packages/api packages/api

RUN pnpm --filter @outbreak/api db:generate \
  && pnpm --filter @outbreak/api build

# Stage 2: runtime. Ship only prod deps + compiled JS + prisma engine + migrations.
FROM node:20-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate \
  && apk add --no-cache dumb-init

ENV NODE_ENV=production
ENV API_PORT=4000

WORKDIR /app

COPY --from=builder /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml /repo/package.json ./
COPY --from=builder /repo/packages/api/package.json packages/api/
COPY --from=builder /repo/packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile --prod --filter @outbreak/api... --filter @outbreak/shared...

# Compiled output + Prisma schema/migrations (for `migrate deploy` on boot).
COPY --from=builder /repo/packages/api/dist packages/api/dist
COPY --from=builder /repo/packages/api/prisma packages/api/prisma
COPY --from=builder /repo/packages/shared/src packages/shared/src
COPY --from=builder /repo/packages/api/node_modules/.prisma packages/api/node_modules/.prisma

EXPOSE 4000

USER node

ENTRYPOINT ["dumb-init", "--"]
# `migrate deploy` is idempotent and fast; run it on every boot so fresh
# deploys converge on the schema without a separate release step.
CMD ["sh", "-c", "pnpm --filter @outbreak/api exec prisma migrate deploy && node packages/api/dist/server.js"]
