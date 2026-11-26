# API reference

Base URL: `/api` (proxied by the web app; the API itself listens on port 4000).

**Conventions**
- JSON in and out. State-changing requests (`POST`/`PUT`/`DELETE`) must send `X-Requested-With: fetch`; cross-origin `Origin` headers outside `APP_ORIGINS` are rejected.
- Auth is a `jp_session` httpOnly cookie set by login/register.
- Lists return `{ data: T[], meta: { page, pageSize, total, totalPages } }`.
- Errors return `{ error: { code, message, details? } }` with codes such as `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` / `CSRF_*` (403), `NOT_FOUND` (404), `DUPLICATE_JOB` / `DUPLICATE_TAG` / `EMAIL_TAKEN` (409), `RATE_LIMITED` (429).
- Roles: `VIEWER < EDITOR < ADMIN < SUPER_ADMIN`. “Editor+” means Editor or higher.

Request/response shapes are defined in `packages/shared/src/schemas.ts` (inputs) and `packages/shared/src/dto.ts` (outputs).

## Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | – | DB check + queue type |

## Authentication

| Method | Path | Auth | Body | Notes |
|---|---|---|---|---|
| POST | `/auth/register` | – | `{ name, email, password }` | Creates a Viewer, sets cookie. 10/min |
| POST | `/auth/login` | – | `{ email, password }` | Sets cookie. 10/min |
| POST | `/auth/logout` | – | – | Clears cookie |
| GET | `/auth/me` | – | – | `{ user: { id, name, email, role } \| null }` |

## Jobs (public)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/jobs` · `/jobs/search` | – | Search & filter (see query below). Adds `bookmarked` when signed in |
| GET | `/jobs/:id` | – | Published/expired jobs; staff can view any status |
| GET | `/jobs/:id/similar` | – | Up to 4 related published jobs |
| GET | `/skills?q=` | – | Skill autocomplete |
| GET | `/companies?q=` | – | Company autocomplete |
| GET | `/meta/filters` | – | Top locations/companies, active & expired counts |

**Search query parameters** (`jobQuerySchema`)

| Param | Example | Notes |
|---|---|---|
| `q` | `java dev` | Prefix full-text + partial match on title, company, skills, location, qualification, description |
| `sort` | `latest` \| `oldest` \| `relevance` | Default `latest` (published date desc) |
| `page`, `pageSize` | `1`, `12` | `pageSize` ≤ 50 |
| `status` | `active` \| `expired` \| `all` | Default `active` |
| `workMode` | `WFH,REMOTE` | `REMOTE, WFH, HYBRID, ONSITE` |
| `employmentType` | `FULL_TIME,INTERNSHIP` | |
| `experience` | `freshers` \| `experienced` | |
| `experienceLevel` | `1-3-years,3-5-years` | Experience tag slugs |
| `category` | `testing-qa` | Job category tag slugs |
| `skills` | `java,sql` | Skill tag slugs |
| `qualification` | `b-e-b-tech` | Qualification tag slugs |
| `tags` | `any-slug` | Any category |
| `location`, `company` | `pune` | Case-insensitive contains |
| `postedWithin` | `7` | Days |

Values within one parameter are OR-ed; different parameters are AND-ed.

## Jobs (management)

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| POST | `/jobs` | Editor+ | `JobInput` | Create. `action`: `draft` \| `submit` \| `publish` \| `schedule` (+ `scheduledAt`). Editors’ `publish` becomes `PENDING_APPROVAL`. Returns 409 `DUPLICATE_JOB` with `details.candidates` unless `confirmDuplicate: true` |
| PUT | `/jobs/:id` | Editor+ | `JobInput` | Full update through the same pipeline |
| DELETE | `/jobs/:id` | Admin+ | – | Permanent delete (prefer archive) |
| POST | `/jobs/preview` | Editor+ | `JobInput` | `{ post, suggestedTags, duplicates, warnings }` without saving. `?excludeJobId=` when editing |

`JobInput` (abridged): `title*`, `companyName*`, `companyWebsite`, `companyLogoUrl`, `location`, `workMode`, `employmentType`, `qualification`, `experienceText`, `minExperience`, `maxExperience`, `isFresherFriendly`, `skills[]`, `preferredSkills[]`, `summary`, `description`, `responsibilities[]`, `salaryMin`, `salaryMax`, `currency`, `salaryType`, `applicationUrl`, `sourceUrl`, `deadline`, `walkInDate`, `postedDate` (`YYYY-MM-DD`), `industry`, `openings`, `tagIds[]`, `autoTag`, `action`, `scheduledAt`, `confirmDuplicate`.

## Bookmarks

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/jobs/:id/bookmark` | Signed in | Save (idempotent) |
| DELETE | `/jobs/:id/bookmark` | Signed in | Remove |
| GET | `/bookmarks?page=` | Signed in | Saved jobs, newest saved first |

## URL extraction

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| POST | `/extractions` | Editor+ | `{ url, forceBrowser? }` | 202 `{ extraction, existingJob }`. SSRF-validated immediately. 20/min/user |
| GET | `/extractions?status=&page=` | Editor+ | – | Recent extractions |
| GET | `/extractions/:id` | Editor+ | – | Status, error, and `result` when `READY`: `{ draft, fieldMeta, suggestedTags, flags, duplicates, postPreview, provider, model, promptVersion }` |
| POST | `/extractions/:id/retry` | Editor+ | `{ forceBrowser? }` | Re-run a failed/ready extraction |
| POST | `/extractions/:id/discard` | Editor+ | – | Mark discarded |
| POST | `/extractions/:id/publish` | Editor+ | `JobInput & { updateJobId? }` | Save the reviewed draft as a job, or update an existing (duplicate) job |

Extraction statuses: `QUEUED → FETCHING → EXTRACTING → READY → PUBLISHED`, or `FAILED` / `DISCARDED`.

## Tags

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/tags?category=` | – | Active tags. `?all=true` (Editor+) adds inactive tags and job counts |
| POST | `/tags` | Editor+ | `{ name, category, synonyms[], description?, isActive }`. 409 `DUPLICATE_TAG` with `details.existing` for case/spelling/synonym duplicates |
| PUT | `/tags/:id` | Admin+ | Partial update. System tags can’t be renamed/re-categorised |
| DELETE | `/tags/:id` | Admin+ | Non-system tags only |

## Admin

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/admin/dashboard` | Editor+ | Counts by status, extraction stats, 30-day LLM usage, published-per-day, recent URLs, pending jobs, possible duplicates |
| GET | `/admin/jobs?status=&sourceType=&q=&page=` | Editor+ | All jobs, any status |
| GET | `/admin/jobs/pending` | Editor+ | Jobs awaiting approval |
| POST | `/admin/jobs/:id/approve` | Admin+ | Publish (or schedule if `scheduledAt` is in the future) |
| POST | `/admin/jobs/:id/reject` | Admin+ | Back to draft |
| POST | `/admin/jobs/:id/publish` | Admin+ | Publish now |
| POST | `/admin/jobs/:id/expire` | Admin+ | Manual expiry (`expiryReason: MANUAL`) |
| POST | `/admin/jobs/:id/archive` · `/restore` | Admin+ | Archive / restore to draft |
| POST | `/admin/jobs/:id/verify` | Editor+ | Re-check the source: `{ status: ACTIVE \| LIKELY_CLOSED \| UNREACHABLE, httpStatus, note }` |
| GET | `/admin/extraction-logs?stage=&status=&extractionId=` | Admin+ | Fetch/render/LLM/pipeline logs with tokens and cost |
| GET | `/admin/history?action=&entityType=&entityId=` | Admin+ | Audit log |
| GET | `/admin/settings` | Admin+ | `{ llm, general, providers[{ name, configured, defaultModel, pricing }], promptVersions, queue, browserRendering }` |
| PUT | `/admin/settings/llm` | Admin+ | `LlmSettings` |
| PUT | `/admin/settings/general` | Admin+ | Partial `GeneralSettings` |
| POST | `/admin/llm/test` | Admin+ | `{ provider, model }` → `{ ok, latencyMs, message }` |
| POST | `/admin/maintenance/run` | Admin+ | Publish due scheduled jobs and expire old ones now |
| GET | `/admin/users?q=` | Admin+ | Users |
| POST | `/admin/users` | Admin+ | `{ name, email, password, role }` (only roles below your own unless Super Admin) |
| PUT | `/admin/users/:id` | Admin+ | `{ name?, role?, status? }` |

The spec’s `GET /api/admin/jobs/pending`, `POST /api/admin/jobs/:id/approve` and `/expire` map directly to the endpoints above.
