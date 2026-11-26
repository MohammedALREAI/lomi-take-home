# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

There is no application code yet: only the assignment brief ([docs/ASSIGNMENT.md](docs/ASSIGNMENT.md)), the plan and TODO list ([docs/PLAN.md](docs/PLAN.md)), the job description it is for ([jd.md](jd.md), useful for the team's stack preferences), and `fixtures/`. No build, lint or test commands exist. Once they do, replace this section with them (including how to run a single test) and describe the architecture as built.

The brief is the source of truth and the summary below does not replace it. `docs/PLAN.md` records the decisions made so far; keep its TODO checkboxes current. The root `README.md` is reserved for the deliverable README.

Deadline: **28 November 2026, 23:59 UTC**. The brief prefers a smaller thing done well; record deliberate cuts in the README.

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
