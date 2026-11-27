# Plan

Living record of decisions and open work. The brief is in [ASSIGNMENT.md](ASSIGNMENT.md).

- **Deadline:** 28 November 2026, 23:59 UTC.
- **Budget:** under 10 working hours, so scope is cut deliberately (see "Cut order").

## Decisions

### Stack

| Tool             | Version                                              | Why                                         |
| ---------------- | ---------------------------------------------------- | ------------------------------------------- |
| Node             | 24 (`node:24-bookworm-slim`)                         | Current LTS line                            |
| pnpm + Turborepo | 10.28 / 2.11                                         | Required by the brief                       |
| TypeScript       | 6.0.x                                                | `typescript-eslint` does not support 7 yet  |
| NestJS           | 11                                                   | Stable, well-known API; no time to learn 12 |
| Next.js / React  | 16.4 / 19                                            |                                             |
| Prisma           | 7.10 + `@prisma/adapter-pg`                          | 8 is still a release candidate              |
| BullMQ           | 5.81                                                 | Maintained line with a known API            |
| Others           | zod 4, `@anthropic-ai/sdk`, unpdf, Vitest, ESLint 10 |                                             |

### Monorepo layout

| Package         | Responsibility                                                                                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`      | NestJS, thin HTTP layer: controllers, zod validation, error mapping (400/404/409)                                                                                                                  |
| `apps/worker`   | Plain Node: BullMQ consumer, lease heartbeat, reconciler, PDF parsing, extractors (Anthropic and a fake for tests)                                                                                 |
| `apps/web`      | Next.js review UI with TanStack Query                                                                                                                                                              |
| `packages/core` | Pure logic, no IO: field definitions, text normalization, evidence matching, value canonicalization, carry-over rule, shared zod contracts                                                         |
| `packages/db`   | Prisma schema, migrations, seed, and coordination functions (upload, claim, heartbeat, commit, fail, reconcile, review, progress, retry) that take a `PrismaClient` so they can be tested directly |

### Schema

| Table             | Key columns                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Document`        | `id` (text, manifest ids such as `doc-invoice-001`), `type`, `title`                                                                                                                                   |
| `DocumentVersion` | `number` (unique per document), `pdf` (bytea, omitted by default), `parsedText`, `status` (`queued`, `extracting`, `extracted`, `failed`), `failureReason`, `attempts`, `leaseToken`, `leaseExpiresAt` |
| `ExtractedValue`  | `field`, `value` (model value, `null` for a gap), `evidence`, `evidenceStart`, `evidenceEnd`, `gapReason`, `baselineValueId` (same field in the previous version). Unique on (`versionId`, `field`)    |
| `Review`          | Append-only: `action` (`approve` or `correct`), `correctedValue`, `note`, `carriedFromReviewId`                                                                                                        |
| `ExtractionRun`   | One row per attempt: `model`, `prompt`, `rawResponse`, `error`, `usage`, timestamps                                                                                                                    |

- **Corrections are annotations.** The model value is kept; the latest review gives the effective value.
- **Value state** comes from the latest review:

  | Latest review             | State          |
  | ------------------------- | -------------- |
  | None                      | `pending`      |
  | Has `carriedFromReviewId` | `carried_over` |
  | `approve`                 | `approved`     |
  | `correct`                 | `corrected`    |

- **Gaps are reviewable.** Approving a gap confirms the value is absent; correcting it supplies a value.

### Redis and Postgres

Postgres is the system of record. Redis only carries `{versionId}` jobs.

- **Upload:** a transaction locks the `Document` row, allocates the version number and inserts the version as `queued`. The response is sent, then the job is enqueued without blocking (`enableOfflineQueue: false`). If Redis is down, the reconciler picks the version up later. Re-uploading an identical file creates a new version.
- **Claim:** one atomic `UPDATE` sets `extracting` with a lease token and `leaseExpiresAt = now() + 30s` (database clock). It only succeeds if no earlier version of the same document is `queued` or `extracting`.
- **Fencing:** every worker write (heartbeat, parsed text, fail, commit) is conditioned on `leaseToken` and `status = 'extracting'`. A heartbeat that matches no row aborts the in-flight LLM call.
- **Commit:** one transaction locks the `Document`, checks the lease, inserts the values (the unique constraint blocks duplicates), applies carry-over and sets `extracted`.
- **Failure is a state.** Parse, LLM, refusal, `max_tokens`, schema, timeout (90s SDK timeout, 3 min per attempt), empty text and a missing API key all end as `failed` with a reason.
- **Reconciler:** runs on startup and every 10s (`setInterval`, not a Redis repeatable job). Expired leases go back to `queued`, or to `failed` after 3 attempts. Every eligible `queued` version is re-enqueued. This covers container kills and `FLUSHALL`.
- **Retry:** moves the latest version from `failed` to `queued` and resets `attempts`. On a version that is not failed it returns 200 with the current state.
- **BullMQ settings:** `jobId = v-<versionId>`, `attempts: 1`, `removeOnComplete`, `removeOnFail`, `maxRetriesPerRequest: null`, an `error` listener on every Queue and Worker.

### New version while the previous one is extracting

**Queued.** Versions of a document are processed in order.

- Reviews are accepted only on the latest extracted version, otherwise 409 and the UI refetches.
- This check runs under the same `Document` lock as the commit, so no review is lost between carry-over and commit.
- Version 1 stays reviewable until version 2 commits.

### Extraction and evidence

- **Parsing:** unpdf `extractText({ mergePages: true })`, normalized once (NFC, `\r\n` to `\n`, strip `\0`) and stored as `parsedText` before the LLM call. All offsets index into it.
- **LLM call:** `client.messages.create` with `claude-opus-5-5` (override with `LLM_MODEL`), `max_tokens: 16000`, structured output and `effort: "medium"`. The raw response is stored before it is validated with zod. Document text is delimited and treated as data, not instructions.
- **Refusal fallback:** the server-side fallback is enabled if the spike shows it works with structured output; otherwise a refusal is `failed`.
- **Output per field:** `{value, evidence, missing_reason}`. Dates are ISO, money and percentages plain numbers, strings as printed. Evidence must be the shortest passage containing the label and the value and no other field.
- **Validation:** evidence must occur verbatim in `parsedText`, tolerating runs of whitespace and respecting token boundaries (`Net 30` does not match `Net 300`, `INV-2025-0847` does not match `INV-2025-0847-A`). The matched slice and its offsets are stored. No match means a gap with a reason.
- **Canonicalization per type:** money, date, percent, number, string. Strings use NFC, trim, collapsed whitespace and case-folding.

### Carry-over

For each field, compared with the same field in the latest earlier extracted version, a review carries over when both hold:

1. The old evidence still occurs in the new text, using the same matching rules.
2. The canonical new value equals the old value or its corrected value.

Otherwise the value is `pending` and shows the previous value and review. A reviewed gap carries only if the whole normalized text is identical.

**Known risk:** an over-wide quote in version 1 (several fields on one line) would send an unchanged field back to review. The prompt guards against it first. If the spike shows it happening, add `value_as_printed` to the schema and deterministically trim the evidence to the lines containing it.

### API

Port 3001, no prefix, published by compose.

| Endpoint                       | Purpose                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /documents`              | Upload (type + file)                                                                                                                       |
| `POST /documents/:id/versions` | Upload a new version                                                                                                                       |
| `GET /documents/:id`           | Latest version and status. Values are `[]` until extracted, with a pointer to the latest extracted version. `?version=N` selects a version |
| `POST /values/:id/review`      | Approve or correct (value + optional note)                                                                                                 |
| `GET /documents/:id/progress`  | Pending / approved / corrected / carried-over counts, with the version number                                                              |
| `GET /documents`               | Document list                                                                                                                              |
| `POST /documents/:id/retry`    | Retry the latest failed version                                                                                                            |

Each value in a response carries `value` (`null` for a gap), `gap.reason`, `effectiveValue`, `state`, `review` and `baseline`.

need docu api use swigger

### UI

- **List:** status, current version, review progress, upload.
- **Detail:** value cards ordered by attention: pending and gaps first, then carried over, then done. Each card shows the value or `GAP` with its reason, the evidence quote, a state badge, approve and correct actions, and the previous value and review when it changed. Also: upload a new version, retry, switch versions.
- **Polling** every 2s, only while a version is `queued` or `extracting`. Extraction takes seconds and there is one reviewer, so polling is enough and survives restarts without extra infrastructure.
  need e2e to be add

### Docker

- **One root Dockerfile:** `node:24-bookworm-slim` with `openssl` and pnpm, then install and build (including `prisma generate`). Every service uses the same image with a different exec-form command. The web app runs `next start`.
- **Compose services:**

  | Service       | Notes                                                                             |
  | ------------- | --------------------------------------------------------------------------------- |
  | `postgres:17` | Named volume, healthcheck, host port 5433 to avoid clashing with a local Postgres |
  | `redis:7.4`   | Healthcheck                                                                       |
  | `migrate`     | One-shot: `migrate deploy`, then seed                                             |
  | `api`         | Port 3001                                                                         |
  | `worker`      |                                                                                   |
  | `web`         | Port 3000                                                                         |

  `api`, `worker` and `web` wait for `migrate` to complete and use `restart: unless-stopped`. An optional root `.env` provides `ANTHROPIC_API_KEY`.

- **Seed:** idempotent (`ON CONFLICT DO NOTHING`, never touches `status`). Seeds version 1 of each manifest document as `queued`; the reconciler picks them up, so seeding needs no Redis.

### Out of scope

Live deployment, auth, SSE, object storage, OCR, pagination, browser end-to-end tests, testcontainers, lease release on SIGTERM (lease expiry covers it), Next standalone output and `turbo prune`.

## TODO

Riskiest first, about 9.5 hours in total.

### 0. Prep (15 min)

- [x] Move the brief to `docs/ASSIGNMENT.md`.
- [x] Write this plan.
- [x] Docker Desktop installed and running.
- [ ] `ANTHROPIC_API_KEY` in the root `.env` (gitignored).

### 1. Spike (45 min)

- [x] Run unpdf on all four fixtures; check that `Due Date: 2025-10-14` is on its own line.
- [ ] One real structured-output call to `claude-opus-5-5`.
- [ ] Extract invoice v1 and v2 three to five times; inspect evidence length and value stability.
- [ ] Decide whether the evidence-trimming rule and the refusal fallback are needed.

### 2. Scaffold (1.25 h)

- [x] pnpm workspaces and `turbo.json` (`build`, `lint`, `test`, and `test:integration` with `cache: false`), `globalEnv`.
- [x] Prisma 7: `prisma.config.ts`, driver adapter, `generate` wired into turbo. Full schema and the first migration (`0001_init`) are in.
- [x] NestJS hello endpoint (`GET /health` runs `SELECT 1`).
- [ ] Dockerfile and compose with postgres, redis, migrate and api running. Written, not yet run: needs Docker.

### 3. `packages/core` with unit tests on the real fixture text (1 h)

- [x] Evidence matching, token boundaries, the lease's wrapped line.
- [x] Canonicalization per type.
- [x] Carry-over matrix: invoice v1 to v2 sends exactly `due_date` and `total_amount` back to review.
- [x] Parity test between the field definitions and `fixtures/expected-fields.json`.
- [x] Extraction validation: hallucinated evidence becomes a gap.

### 4. `packages/db` (1.75 h)

- [x] Schema and first migration. `Review.seq` orders reviews, since `createdAt` can tie.
- [x] Coordination functions: upload, claim, heartbeat, fenced commit with carry-over, fail, reconcile, review, progress, retry.
- [x] Integration tests against Postgres (`pnpm test:integration`, database `app_test`):
  1. Double commit and stale lease: no duplicate values.
  2. Expired lease and reconciler after the queue is wiped.
  3. Version 2 while version 1 is extracting: waits, then carry-over, then 409 on the old version.

### 5. Worker (1 h)

- [x] BullMQ consumer, heartbeat, per-attempt deadline.
- [x] Reconciler (startup, every 10s, and after each job).
- [x] Fake extractor for tests.
- [x] Anthropic extractor that stores the prompt and raw response before parsing. Not yet run against the real API: needs `ANTHROPIC_API_KEY`.
- [x] Parse test on the real fixtures: unpdf keeps each invoice header field on its own line, so no line reconstruction is needed.
- [x] `packages/queue`: queue name and best-effort enqueue shared by api and worker.

### 6. API (45 min)

- [x] Endpoints and file upload (PDF magic-byte check, 10 MB limit).
- [x] zod validation (contracts in `packages/core`) and error mapping (400/404/409).
- [x] Non-blocking enqueue. Integration tests run the API with no Redis at all and uploads still answer at once.
- [x] Swagger docs at `/docs` (OpenAPI JSON at `/docs-json`). Request body schemas are generated from the same zod schemas that validate them.

### 7. UI (1 h)

- [x] UI/UX skills: no existing page or theme to follow, so the page shape was agreed in words first; one theme as CSS variables in `app/globals.css`; components in `app/_components/`.
- [x] Document list: status, current version, review progress, upload.
- [x] Detail page: value cards beside the verbatim quote, approve/correct with note, gaps with reasons, previous value and review on changed values, carried-over badge, quote highlighted in the document text.
- [x] Upload new version, version switcher, retry; older versions read-only.
- [x] Conditional polling (2s, only while a version is queued or extracting).
- [x] Checked in the browser end to end: invoice v1 reviewed, v2 uploaded, exactly `due_date` and `total_amount` back to review, the other three carried over (including a correction and its note).

### 7b. Redesign to the agreed mockup, fully responsive (after phases 8–10)

- [x] Theme: the mockup's palette (navy sidebar, blue primary), larger radius, shadows, a colour per document type, all in `app/globals.css`.
- [x] New components in `app/_components/`: `AppShell` (sidebar + top bar, used by both pages), `TypeBadge`, `Icon` (hand-written SVGs, no icon library).
- [x] Only what works: sidebar with the logo, Documents and API docs link; a search box (`⌘K`) that filters the list and extracted fields; Light/Dark theme toggle; Refresh button. No dead placeholder nav, notifications, profile or "…" menu.
- [x] List page as in the mockup: upload card with "Supported formats", table with type badge, status, progress bar with "x / y reviewed", short error with "View details", View and Retry actions.
- [x] Review page as in the second mockup: header with version switcher, progress toolbar with circular `%` ring + inline revision upload, field-icon value cards with diff callouts, and paper document viewer with zoom/copy/expand.
- [x] Responsive: the sidebar collapses to a drawer on narrow screens and the table becomes stacked cards; review page stacks cards above the document text.

### 8. Finish compose (30 min)

- [x] `worker` and `web` services (the web image is built with `API_URL=http://api:3001`).
- [x] Healthchecks and restart policy (`unless-stopped`; web waits for a healthy api).
- [x] Idempotent seed (`packages/db/src/seed.ts`, run by `migrate` after the migrations), with integration tests.
- [x] `.env.example`.
- [ ] Verified with a clean `docker compose down -v && docker compose up --build`.

### 9. Drills from a clean start (30 min)

See "Verification".

### 10. Docs (35 min)

- [x] README covering everything the brief asks for: how to run it, layout, schema, the Redis/Postgres line, open decisions, cuts, and what changes at 10,000 documents. Draft; recheck against the drills.
- [x] Update `CLAUDE.md` with the real commands.

### 10b. Dev setup, CI and e2e

- [x] `docker-compose.dev.yml` (Postgres + Redis only, own volume) with `pnpm dev:up` / `pnpm dev` / `pnpm dev:down`.
- [x] Test-only `EXTRACTOR=rules` worker mode, checked against the fixtures by unit tests.
- [x] Playwright e2e (`apps/e2e`): invoice review, revision and carry-over; gap shown with its reason.
- [x] GitHub Actions: checks job (build, lint, unit, integration, e2e) and docker job (`compose up --build` + `scripts/smoke-test.sh` with FLUSHALL and restart).
- [ ] First CI run green.

### 11. Submit

- [x] Push to our own GitHub repository.
- [ ] Public gist with the coding agent session logs.
- [ ] Walkthrough video, if time allows.
- [ ] Submit at submit.lomilabs.ai.

### Cut order if behind

1. Quote highlighting (stretch goal).
2. Version switcher in the UI (stays in the API).
3. Refusal fallback.
4. Third integration test, replaced by a manual drill.

## Verification

**Local:**

- `pnpm install && pnpm turbo build lint test` runs the unit tests without Postgres.
- `pnpm test:integration` runs against the compose Postgres on port 5433.

**Clean start:** `docker compose down -v && docker compose up --build`, then open http://localhost:3000. The three seeded documents go from `queued` to `extracting` to `extracted`.

**Drills (what the reviewers will try):**

1. **Instant upload:** `curl -F type=invoice -F file=@fixtures/documents/invoice-001.pdf localhost:3001/documents` returns immediately with `queued`.
2. **No duplicates:** this query returns no rows:
   ```sql
   SELECT "versionId", field, count(*) FROM "ExtractedValue"
   GROUP BY 1, 2 HAVING count(*) > 1;
   ```
3. **Worker killed:** `docker compose kill worker` mid-extraction, then `docker compose up -d worker`. The document completes within about 40 seconds.
4. **Redis flushed:** `docker compose exec redis redis-cli FLUSHALL`, then `docker compose restart`. No value or review is lost and nothing stays stuck.
5. **Invoice v2:**
   - After reviewing v1, upload v2: `due_date` and `total_amount` are pending with their previous value; the other three are carried over.
   - Upload v2 twice quickly, or while v1 is extracting: versions are processed in order.
   - Reviewing the old version returns 409.
6. **Failure:** without an API key the version is `failed` with a reason; after adding the key, retry succeeds.
7. **Gaps:** `median_household_income` in the market report is a gap with a reason.
