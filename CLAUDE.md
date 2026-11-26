# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Orientation

The brief is [docs/ASSIGNMENT.md](docs/ASSIGNMENT.md) and is the source of truth. [docs/PLAN.md](docs/PLAN.md) records decisions and the TODO list; keep its checkboxes current. [README.md](README.md) is the deliverable for the reviewers and explains the design; read it before changing coordination or carry-over. Deadline: **28 November 2026, 23:59 UTC**; record deliberate cuts in the README.

## Commands

```sh
pnpm install
docker compose up -d postgres redis     # Postgres on localhost:5433, Redis on localhost:6380
pnpm build                              # turbo; db's build runs `prisma generate`
pnpm lint
pnpm test                               # unit tests, no services
pnpm test:integration                   # needs the compose Postgres
docker compose up --build               # whole stack: web :3000, api :3001 (Swagger at /docs)
```

- One package: `pnpm --filter @app/core test`. One test: `pnpm --filter @app/core exec vitest run -t "token boundaries"`. Integration tests: `pnpm --filter @app/db test:integration` (also `@app/worker`, `@app/api`).
- Integration tests use their own databases (`app_test`, `app_test_api`, `app_test_worker`), created and migrated by a vitest globalSetup from `@app/db/testing`.
- Packages are consumed from `dist`, so build a package after changing it before its dependents see the change (turbo does this for `build` and `test`).
- Schema change: edit `packages/db/prisma/schema.prisma`, then `pnpm --filter @app/db exec prisma migrate dev --name <name>` against the dev database. **Never edit a migration that any database may have applied**; add a new one.
- `ANTHROPIC_API_KEY` goes in the root `.env` (gitignored), never in `.env.example`.

## Architecture

- `packages/core`: pure functions, no IO. Field definitions (mirrors `fixtures/expected-fields.json`, a test enforces it), evidence matching, value canonicalization, `validateExtraction` (unverified evidence becomes a gap), `decideCarryOver`, zod request contracts.
- `packages/db`: Prisma 7 with `@prisma/adapter-pg`. All state transitions live in `src/coordination.ts` (claim with lease, fenced writes, commit with carry-over, reconcile, retry, review) and read models in `src/queries.ts`. Lock order is always the `Document` row first.
- `packages/queue`: BullMQ queue name and best-effort enqueue. Redis is never the source of truth.
- `apps/worker`: plain Node, no Nest. `process.ts` runs one version under a lease; `main.ts` runs the BullMQ consumer and the reconciler.
- `apps/api`: NestJS controllers only; inject with explicit `@Inject(...)` so tests work under Vitest without decorator metadata.
- `apps/web`: Next.js client pages; the browser calls `/api/*`, rewritten to `API_URL` at build time. One theme in `app/globals.css`; components in `app/_components/`.
- Everything is ESM (`"type": "module"`, `.js` import suffixes in TypeScript).

## What is being built

PDF upload → text parsing → LLM extraction → human review of each value against its quoted evidence → re-extraction of a revised PDF that carries over reviews whose evidence did not change.

Fixed by the brief:

- Turborepo monorepo on pnpm or yarn workspaces, with build, test and lint wired through `turbo.json`.
- Node.js + TypeScript API, React UI (Next.js or Vite), Postgres, Redis-backed job queue (BullMQ or similar).
- `docker compose up` at the root starts everything, runs migrations and seeds **only version 1** of each document in [fixtures/documents.json](fixtures/documents.json). Fields per document type are in [fixtures/expected-fields.json](fixtures/expected-fields.json).
- Endpoints: `POST /documents`, `POST /documents/:id/versions`, `GET /documents/:id`, `POST /values/:id/review`, `GET /documents/:id/progress`.
- Document status is one of `queued`, `extracting`, `extracted`, `failed`.

Left open, and each choice must be explained in the README: package boundaries, correction model (replace vs. annotate), polling vs. streaming, storing parsed text vs. re-parsing, the definition of "unchanged" evidence, and what happens when a new version arrives mid-extraction.

## Invariants that are tested

- Upload responds without waiting for the LLM.
- Postgres is the system of record. Extracted values, reviews and user-visible job outcomes must survive `FLUSHALL` plus a stack restart.
- After a restart, container kill or Redis flush mid-extraction, the document completes or is visibly retryable, never stuck in `extracting`.
- Re-running extraction for the same version (retry, recovery, double click) never duplicates values.
- Parse or LLM errors leave the document `failed` and retryable.
- Evidence must appear verbatim in the parsed text of the version being extracted; otherwise store a gap (`value: null` plus a reason). A field the LLM cannot find is also a gap, never a guess.
- Each extraction's prompt and raw LLM response are stored or logged.
- Old versions and their reviews are never deleted and stay queryable. Evidence validation and review for version N always use version N's text.
- Re-extraction: unchanged evidence keeps its review and is marked carried over; changed evidence returns to pending with the previous value and review shown beside it.

## Fixture traps

Inspect a PDF's text with `pdftotext -layout fixtures/documents/<file>.pdf -`.

- Invoice v1 → v2: of the expected fields, only `due_date` and `total_amount` change, so exactly those two should need re-review. The surrounding text also changes (title, payment terms, a line item, subtotal, tax, a new closing paragraph).
- That new paragraph repeats the issue date `2025-09-14`, so the same string occurs twice in v2.
- Line grouping depends on the parser. Plain `pdftotext` joins invoice number, issue date, due date and payment terms into one line, so line- or neighbourhood-based evidence comparison can flag unchanged fields as changed.
- The lease's prose wraps mid-phrase (`twenty-four` / `(24) months`), which affects verbatim matching.
- The market report has no median household income, so `median_household_income` must be a gap. It also contains near-miss numbers (prior-quarter vacancy, two-bedroom rent, outlook percentages); the lease's late charge is a similar distractor.

## Submission

The coding agent session logs are submitted as a public GitHub Gist (one file per session). Do not commit them to the repo.
