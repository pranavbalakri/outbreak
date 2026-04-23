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

# Need prisma CLI at runtime for `migrate deploy` + `generate`, so install
# dev deps too. The image stays small since pnpm dedupes across packages.
RUN pnpm install --frozen-lockfile --filter @outbreak/api... --filter @outbreak/shared...

# Compiled output + Prisma schema/migrations.
COPY --from=builder /repo/packages/api/dist packages/api/dist
COPY --from=builder /repo/packages/api/prisma packages/api/prisma
COPY --from=builder /repo/packages/shared/src packages/shared/src

# Regenerate the Prisma client in the runtime image. pnpm puts the generated
# client in its virtual store (node_modules/.pnpm/...), which the previous
# `COPY node_modules/.prisma` approach couldn't locate.
RUN pnpm --filter @outbreak/api exec prisma generate

# tsc with rootDir=".." placed the compiled @outbreak/shared output inside
# the api's dist tree. Copy it into packages/shared/dist and flip shared's
# package.json so Node resolves `@outbreak/shared` to the compiled .js files
# instead of the .ts source (which it can't execute).
RUN mkdir -p packages/shared/dist \
  && cp -r packages/api/dist/shared/src/. packages/shared/dist/ \
  && node -e "const fs=require('fs'),p='packages/shared/package.json',j=JSON.parse(fs.readFileSync(p,'utf8'));j.main='./dist/index.js';j.types='./dist/index.d.ts';j.exports={'.':{'types':'./dist/index.d.ts','default':'./dist/index.js'}};fs.writeFileSync(p,JSON.stringify(j,null,2));"

EXPOSE 4000

USER node

ENTRYPOINT ["dumb-init", "--"]
# `migrate deploy` is idempotent and fast; run it on every boot so fresh
# deploys converge on the schema without a separate release step.
CMD ["sh", "-c", "pnpm --filter @outbreak/api exec prisma migrate deploy && node packages/api/dist/api/src/server.js"]
