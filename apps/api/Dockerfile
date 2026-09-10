# DailyBee sync API (apps/api) as a container. Build from the repository root so the pnpm
# workspace lockfile is in the context:
#
#   docker build -f apps/api/Dockerfile -t dailybee-api .
#
# deploy/cloud/docker-compose.yml builds it this way and runs it next to Postgres.
FROM node:22-alpine

# corepack picks the pnpm version pinned in package.json ("packageManager"); wget serves the health check.
RUN corepack enable && apk add --no-cache wget
WORKDIR /app

# Only the manifests first, so dependencies are cached between source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
# The API runs its TypeScript sources through tsx (no build step), so its dev dependencies are
# installed too; lifecycle scripts are skipped (the root postinstall only concerns Electron).
RUN pnpm install --filter @dailybee/api --frozen-lockfile --ignore-scripts --prod=false

COPY apps/api/tsconfig.json apps/api/
COPY apps/api/src apps/api/src

ENV NODE_ENV=production PORT=8787
EXPOSE 8787
USER node
# /trpc/health answers { ok, service, db, dbOk, version } once the database is reachable.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:8787/trpc/health | grep -q '"ok":true' || exit 1
CMD ["pnpm", "--filter", "@dailybee/api", "start"]
