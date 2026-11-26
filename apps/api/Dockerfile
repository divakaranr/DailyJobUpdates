# syntax=docker/dockerfile:1
# Build from the repository root:  docker build -f apps/api/Dockerfile .
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter "@jobs/api..."
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @jobs/api build

FROM base AS runtime
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --prod --frozen-lockfile --filter "@jobs/api..."
COPY apps/api/prisma apps/api/prisma
RUN cd apps/api && npx prisma generate
# Headless Chromium for JavaScript-rendered pages (set INSTALL_BROWSER=false for a slimmer image).
ARG INSTALL_BROWSER=true
RUN if [ "$INSTALL_BROWSER" = "true" ]; then cd apps/api && npx playwright install --with-deps chromium; fi
COPY --from=build /app/apps/api/dist apps/api/dist
WORKDIR /app/apps/api
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply pending migrations, then start. The worker service overrides CMD.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
