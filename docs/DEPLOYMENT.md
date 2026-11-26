# Deployment

## Components

| Service | Image / command | Needs |
|---|---|---|
| PostgreSQL 14+ | managed DB or `postgres:16` | — |
| Redis 6+ (recommended) | managed Redis or `redis:7` | — |
| API | `apps/api/Dockerfile` → `prisma migrate deploy && node dist/index.js` | `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`, `APP_ORIGINS`, `COOKIE_SECURE=true`, LLM keys |
| Worker | same image, `node dist/worker.js` | same env as API; `RUN_WORKER_IN_PROCESS=false` on the API |
| Web | `apps/web/Dockerfile` → `node apps/web/server.js` | `API_INTERNAL_URL` at **build and run** time |

Without Redis, run a single API instance with `RUN_WORKER_IN_PROCESS=true` (the default); extractions then run inside the API process.

## Docker Compose (single host)

```bash
cp .env.example .env            # set JWT_SECRET (openssl rand -hex 32), PUBLIC_URL, LLM keys
docker compose up -d --build
docker compose exec api node dist/seed.js
```

Put a TLS-terminating reverse proxy (Caddy, Nginx, Traefik) in front of `web:3000`, set `PUBLIC_URL=https://your-domain` and `COOKIE_SECURE=true`. Only the web container needs to be public — the browser reaches the API through the web app’s `/api` proxy.

## Render / Railway

1. Create PostgreSQL and Redis add-ons.
2. **API service** — Docker, `apps/api/Dockerfile`, repository root as build context. Env: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `NODE_ENV=production`, `RUN_WORKER_IN_PROCESS=false`, `APP_ORIGINS=https://<web-domain>`, `COOKIE_SECURE=true`, LLM keys. Health check path `/api/health`.
3. **Worker service** — same image, start command `node dist/worker.js`, same env.
4. **Web service** — Docker, `apps/web/Dockerfile`, build arg + env `API_INTERNAL_URL=https://<api-internal-host>`.
5. Seed once: run `node dist/seed.js` in the API service shell.

## Vercel (web) + container host (API)

The web app can be deployed to Vercel with root directory `apps/web`, install command `pnpm install --frozen-lockfile` (from the repo root), and env `API_INTERNAL_URL=https://api.example.com`. Because `/api/*` is a rewrite, cookies remain first-party on the Vercel domain. Set the API’s `APP_ORIGINS` to the Vercel domain. Host the API and worker on any container platform.

## Production checklist

- [ ] `JWT_SECRET` is long and random; `COOKIE_SECURE=true`; `APP_ORIGINS` lists only your public origin(s)
- [ ] Change the seeded admin password (or set `SEED_ADMIN_PASSWORD` before seeding)
- [ ] `ALLOW_LOOPBACK_FETCH` is unset/false (the API refuses to start in production otherwise)
- [ ] Egress network policy for the API/worker denying private address ranges (defence in depth for the headless browser)
- [ ] At least one LLM key configured and tested in **Admin → LLM & settings**, with a fallback provider
- [ ] Database backups and point-in-time recovery enabled
- [ ] Log shipping from stdout (structured JSON in production) to your log platform; alert on `/api/health` and on extraction failure rate (visible on the dashboard and in **Extraction logs**)
- [ ] `INSTALL_BROWSER=false` build arg if you don’t need JavaScript rendering (much smaller image)

## Migrations

`prisma migrate deploy` runs automatically when the API container starts. To create a new migration during development: edit `apps/api/prisma/schema.prisma`, then `pnpm db:migrate --name <change>`.

## CI/CD

`.github/workflows/ci.yml` runs on pushes and pull requests:

1. **test** — install, Prisma generate, typecheck all packages, unit + PostgreSQL integration tests, production builds.
2. **e2e** — migrated + seeded database, builds, Playwright (desktop + mobile) against the real API/web and a fixture job page; uploads the report on failure.
3. **docker** — builds both images with layer caching.

To deploy continuously, add a job after these that pushes images to your registry and triggers your platform’s deploy hook.
