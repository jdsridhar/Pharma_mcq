# syntax=docker/dockerfile:1
# Build context MUST be the repository root (see docker-compose.yml).
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

# ---- deps: install with a frozen lockfile (run `pnpm install` once at repo root first) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY apps/api/package.json apps/api/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---- build: compile internal packages, generate Prisma client, build the API ----
FROM deps AS build
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @pharmacy/config --filter @pharmacy/contracts build \
 && pnpm --filter @pharmacy/api exec prisma generate \
 && pnpm --filter @pharmacy/api build

# ---- runner ----
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/packages /repo/packages
COPY --from=build /repo/apps/api/dist /repo/apps/api/dist
COPY --from=build /repo/apps/api/package.json /repo/apps/api/package.json
COPY --from=build /repo/apps/api/prisma /repo/apps/api/prisma
WORKDIR /repo/apps/api
EXPOSE 4000
# Drop root — the `node` user (uid 1000) ships with the base image. The app writes nothing to
# disk (logs go to stdout), so read-only access to the copied artifacts is sufficient.
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health >/dev/null 2>&1 || exit 1
# Run pending migrations then start (safe: `migrate deploy` is idempotent). For multi-replica
# deploys, override this to start-only (`node dist/main.js`) and run migrations as a separate
# release task — see DEPLOYMENT_GUIDE.md → "Database lifecycle".
CMD ["sh", "-c", "node ../../node_modules/prisma/build/index.js migrate deploy && node dist/main.js"]
