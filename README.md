# DailyJobUpdates

An AI-assisted job discovery and aggregation portal. Editors paste a job-posting URL; the system fetches the page safely, extracts structured details with an LLM, validates them against the source, tags and de-duplicates the job, and produces a standardised LinkedIn-style post for human review before publishing. Visitors browse, search, filter and save jobs, newest first.

- **Web**: Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · light/dark themes · mobile-first
- **API**: Node.js · Fastify 5 · Prisma 6 · PostgreSQL (full-text search) · Zod
- **Extraction**: undici (SSRF-safe fetcher) · Cheerio · Playwright fallback for JavaScript pages
- **LLM**: Google Gemini · OpenAI · Groq · Ollama · plus a rule-based extractor that needs no API key
- **Jobs**: BullMQ + Redis when configured; in-process queue otherwise
- **Tests**: Vitest (unit + DB integration) · Playwright (E2E, desktop + mobile)

## Features

| Area | What you get |
|---|---|
| URL extraction | URL validation, SSRF protection (private/metadata IPs blocked, DNS re-checked at connect time, redirect re-validation), robots.txt, size limits, timeouts, retries, per-host throttling, Cheerio boilerplate removal, Playwright fallback, CAPTCHA/login walls refused (never bypassed) |
| LLM pipeline | Provider abstraction, versioned prompts, JSON output validated with Zod, repair retry, backoff, fallback provider → rule-based extractor, token & cost tracking, request logs, prompt-injection hardening |
| Anti-hallucination | Missing fields stay `null`; salary figures and application links not found on the page are removed and flagged; inferred fields are badged “AI inferred”; conflicting/unparseable values flagged for review |
| Review & publishing | Extraction preview with editable form, live post preview, suggested tags, duplicate warnings, publish / save draft / submit for approval / schedule |
| Manual jobs | Same form, data model and publishing pipeline as extracted jobs |
| Tagging | Controlled taxonomy (experience, work mode, employment type, skills, qualification, job category), synonym mapping, duplicate-proof tag creation, admin management |
| Search | PostgreSQL full-text (prefix matching) + ILIKE partial matching, relevance/newest/oldest sort, combinable filters, debounced, infinite scroll |
| Duplicates | Source URL, application URL, company, normalised title and location similarity; blocks accidental duplicates, offers “update existing” |
| Expiry | Deadline / walk-in / default listing period; scheduled publishing; manual expiry; source re-verification; nothing is silently deleted |
| Admin | Dashboard, job management, tag management, users & roles, LLM configuration & connection tests, extraction logs, publishing history (audit log) |
| Security | RBAC (Super Admin, Admin, Content Editor, Viewer), httpOnly SameSite session cookie, CSRF (origin allow-list + custom header), rate limiting, Helmet headers, bcrypt, input validation, no `dangerouslySetInnerHTML` |

## Quick start (local, no Docker)

Requirements: **Node.js 20.11+** and **pnpm 10** (`corepack enable`).

```bash
pnpm install

# 1. Start PostgreSQL (downloads real Postgres binaries; leave it running)
pnpm db:local                      # → port 5433, databases jobportal + jobportal_test

# 2. Configure and migrate (new terminal)
cp apps/api/.env.example apps/api/.env
pnpm db:deploy
pnpm db:seed                       # super admin, tag taxonomy, 12 sample jobs

# 3. Optional: headless Chromium for JavaScript-rendered pages
pnpm --filter @jobs/api playwright:install

# 4. Run API (4000) + web (3000)
pnpm dev
```

Open http://localhost:3000 and sign in as **admin@jobportal.local / ChangeMe123!** (set `SEED_ADMIN_*` to change it; change the password for anything beyond local use).

> Already have PostgreSQL? Skip `pnpm db:local` and point `DATABASE_URL` / `TEST_DATABASE_URL` at your server.

### Enabling an LLM

Without API keys the **rule-based extractor** is used (reads schema.org `JobPosting` data and labelled lines). For full AI extraction add a key to `apps/api/.env`:

```bash
GEMINI_API_KEY=...        # recommended low-cost default: gemini-2.5-flash-lite
# or OPENAI_API_KEY / GROQ_API_KEY / OLLAMA_BASE_URL
```

Then pick the provider, model and fallback in **Admin → LLM & settings** and press **Test**. Keys are only read on the server; the UI only shows whether each provider is configured.

## Docker

```bash
cp .env.example .env              # set JWT_SECRET; add LLM keys if you have them
docker compose up --build
docker compose exec api node dist/seed.js
```

Runs PostgreSQL, Redis, the API (migrates on start), a separate BullMQ extraction worker, and the web app on http://localhost:3000. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Render/Railway/Vercel.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | API + web in watch mode |
| `pnpm db:local` | Local PostgreSQL without Docker (port 5433) |
| `pnpm db:migrate` / `db:deploy` | Create / apply Prisma migrations |
| `pnpm db:seed` | Admin user, taxonomy, settings, sample jobs (idempotent) |
| `pnpm typecheck` | TypeScript across all packages |
| `pnpm test` | Unit + DB integration tests (needs `TEST_DATABASE_URL`) |
| `pnpm test:e2e` | Playwright E2E — see below |
| `pnpm build` | Production builds (API bundle + Next.js) |

### End-to-end tests

E2E tests drive the real stack, including the paste-URL → review → publish flow against a local fixture page. Start the API with the **test-only** loopback flag (rejected when `NODE_ENV=production`), then run the suite:

```bash
ALLOW_LOOPBACK_FETCH=true AUTH_RATE_LIMIT_PER_MIN=1000 pnpm dev   # terminal 1
pnpm test:e2e                                                      # terminal 2
```

In CI the Playwright config starts the API, web app and fixture server itself.

## Project structure

```
apps/
  api/                 Fastify REST API (modular monolith)
    prisma/            schema, migrations, seed
    src/modules/       auth · jobs · search · tags · duplicates · extraction · llm · expiry · admin · settings · audit
    src/routes/        HTTP layer (validation + authorization)
    test/              unit, integration (real PostgreSQL), HTML fixtures
  web/                 Next.js app
    src/app/(public)/  feed, search, job details, saved jobs
    src/app/admin/     dashboard, submit URL, extraction review, jobs, tags, users, settings, logs, history
    e2e/               Playwright specs + fixture server
packages/
  shared/              Zod schemas, DTOs, enums, taxonomy, tagging engine, post formatter, similarity, date/experience parsing
docs/                  architecture, API, deployment
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — modules, ER diagram, extraction workflow, LLM integration, security, assumptions
- [API reference](docs/API.md)
- [Deployment](docs/DEPLOYMENT.md)

## Troubleshooting

- **Windows: “invariant expected layout router to be mounted”** — Next.js was started from a path with a lower-case drive letter (`c:\…`; VS Code terminals often do this), so it loads modules twice. `pnpm dev` normalises this automatically; if you run `next dev` directly, `cd` into the folder using `C:\…`.
- **“Could not launch headless Chromium”** in extraction logs — run `pnpm --filter @jobs/api playwright:install`, or set `ENABLE_BROWSER_RENDERING=false`. Static pages still work.
- **Extraction says robots.txt disallows the page** — the site has opted out of automated access; create the job manually.
- **Integration tests skipped** — set `TEST_DATABASE_URL` (it is migrated automatically).
