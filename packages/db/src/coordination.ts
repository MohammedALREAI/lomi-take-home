import { randomUUID } from "node:crypto";
import {
  FIELD_DEFINITIONS,
  canonicalize,
  decideCarryOver,
  type DocumentType,
  type FieldType,
  type ValidatedValue,
} from "@app/core";
import type { Db } from "./client.js";
import { ConflictError, NotFoundError, ValidationError } from "./errors.js";

// Postgres is the system of record for extraction state. Redis only carries
// "please look at version X" messages, so every function here is safe to call
// again, and the reconciler can rebuild the queue from these rows alone.
//
// Lock order is always Document row, then version rows, so concurrent uploads,
// commits and reviews of the same document serialize without deadlocks.

export const LEASE_SECONDS = 30;
export const MAX_ATTEMPTS = 3;

type Tx = Omit<
  Db,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

// Timestamps are stored as UTC "timestamp without time zone" (Prisma's default).
const NOW = "(now() AT TIME ZONE 'UTC')";

async function lockDocument(tx: Tx, documentId: string) {
  const rows = await tx.$queryRaw<{ id: string; type: DocumentType }[]>`
    SELECT id, type::text AS type FROM "Document" WHERE id = ${documentId} FOR UPDATE`;
  const doc = rows[0];
  if (!doc) throw new NotFoundError(`Document ${documentId} not found`);
  return doc;
}

export interface UploadedFile {
  fileName: string;
  pdf: Uint8Array<ArrayBuffer>;
}

export interface CreatedVersion {
  documentId: string;
  versionId: string;
  number: number;
}

export async function createDocument(
  db: Db,
  input: { id?: string; type: DocumentType; title: string } & UploadedFile,
): Promise<CreatedVersion> {
  const documentId = input.id ?? randomUUID();
  const version = await db.$transaction(async (tx) => {
    await tx.document.create({
      data: { id: documentId, type: input.type, title: input.title },
    });
    return tx.documentVersion.create({
      data: { documentId, number: 1, fileName: input.fileName, pdf: input.pdf },
      select: { id: true, number: true },
    });
  });
  return { documentId, versionId: version.id, number: version.number };
}

/** A new version is queued; it waits for earlier versions of the document to finish. */
export async function addVersion(
  db: Db,
  documentId: string,
  file: UploadedFile,
): Promise<CreatedVersion> {
  return db.$transaction(async (tx) => {
    await lockDocument(tx, documentId);
    const last = await tx.documentVersion.findFirst({
      where: { documentId },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    const version = await tx.documentVersion.create({
      data: {
        documentId,
        number: (last?.number ?? 0) + 1,
        fileName: file.fileName,
        pdf: file.pdf,
      },
      select: { id: true, number: true },
    });
    return { documentId, versionId: version.id, number: version.number };
  });
}

export interface Lease {
  versionId: string;
  token: string;
  attempt: number;
}

/**
 * Atomically takes a queued version for extraction. Returns null if the version
 * is not queued (already taken, finished, or failed) or an earlier version of
 * the same document has not finished yet.
 */
export async function claimVersion(
  db: Db,
  versionId: string,
): Promise<Lease | null> {
  const token = randomUUID();
  const rows = await db.$queryRawUnsafe<{ attempts: number }[]>(
    `UPDATE "DocumentVersion" v
        SET status = 'extracting', "leaseToken" = $2::uuid,
            "leaseExpiresAt" = ${NOW} + make_interval(secs => $3),
            attempts = attempts + 1, "failureReason" = NULL
      WHERE v.id = $1::uuid AND v.status = 'queued'
        AND NOT EXISTS (
          SELECT 1 FROM "DocumentVersion" e
           WHERE e."documentId" = v."documentId" AND e.number < v.number
             AND e.status IN ('queued', 'extracting'))
      RETURNING attempts`,
    versionId,
    token,
    LEASE_SECONDS,
  );
  const row = rows[0];
  return row ? { versionId, token, attempt: row.attempts } : null;
}

/** Fenced writes return false when the lease was lost; the caller must stop. */
export async function heartbeat(db: Db, lease: Lease): Promise<boolean> {
  const count = await db.$executeRawUnsafe(
    `UPDATE "DocumentVersion" SET "leaseExpiresAt" = ${NOW} + make_interval(secs => $3)
      WHERE id = $1::uuid AND "leaseToken" = $2::uuid AND status = 'extracting'`,
    lease.versionId,
    lease.token,
    LEASE_SECONDS,
  );
  return count === 1;
}

export async function saveParsedText(
  db: Db,
  lease: Lease,
  parsedText: string,
): Promise<boolean> {
  const { count } = await db.documentVersion.updateMany({
    where: {
      id: lease.versionId,
      leaseToken: lease.token,
      status: "extracting",
    },
    data: { parsedText },
  });
  return count === 1;
}

export async function failVersion(
  db: Db,
  lease: Lease,
  reason: string,
): Promise<boolean> {
  const { count } = await db.documentVersion.updateMany({
    where: {
      id: lease.versionId,
      leaseToken: lease.token,
      status: "extracting",
    },
    data: {
      status: "failed",
      failureReason: reason,
      leaseToken: null,
      leaseExpiresAt: null,
    },
  });
  return count === 1;
}

/** Loads what the worker needs to extract a version it holds the lease on. */
export async function loadVersionForExtraction(db: Db, lease: Lease) {
  const version = await db.documentVersion.findFirst({
    where: {
      id: lease.versionId,
      leaseToken: lease.token,
      status: "extracting",
    },
    // Selecting pdf explicitly overrides the client-wide omit.
    select: {
      pdf: true,
      parsedText: true,
      document: { select: { type: true } },
    },
  });
  return version
    ? {
        pdf: version.pdf,
        parsedText: version.parsedText,
        type: version.document.type,
      }
    : null;
}

export async function startRun(
  db: Db,
  lease: Lease,
  model: string,
  prompt: string,
): Promise<string> {
  const run = await db.extractionRun.create({
    data: { versionId: lease.versionId, attempt: lease.attempt, model, prompt },
    select: { id: true },
  });
  return run.id;
}

export async function finishRun(
  db: Db,
  runId: string,
  result: {
    rawResponse?: string | null;
    error?: string | null;
    usage?: unknown;
  },
): Promise<void> {
  await db.extractionRun.update({
    where: { id: runId },
    data: {
      rawResponse: result.rawResponse ?? null,
      error: result.error ?? null,
      usage: result.usage === undefined ? undefined : (result.usage as object),
      finishedAt: new Date(),
    },
  });
}

export type CommitResult = "committed" | "lost_lease";

/**
 * Stores the extracted values and applies review carry-over in one
 * transaction. Only the current lease holder can commit, and only once, so a
 * retry, a crash recovery or a second worker can never duplicate values.
 */
export async function commitExtraction(
  db: Db,
  lease: Lease,
  values: ValidatedValue[],
): Promise<CommitResult> {
  return db.$transaction(async (tx) => {
    const meta = await tx.documentVersion.findUnique({
      where: { id: lease.versionId },
      select: { documentId: true },
    });
    if (!meta) return "lost_lease";
    const doc = await lockDocument(tx, meta.documentId);

    const version = await tx.documentVersion.findUnique({
      where: { id: lease.versionId },
      select: {
        number: true,
        status: true,
        leaseToken: true,
        parsedText: true,
      },
    });
    if (
      !version ||
      version.status !== "extracting" ||
      version.leaseToken !== lease.token
    )
      return "lost_lease";
    if (version.parsedText === null)
      throw new Error("Cannot commit a version without parsed text");

    const prior = await tx.documentVersion.findFirst({
      where: {
        documentId: meta.documentId,
        status: "extracted",
        number: { lt: version.number },
      },
      orderBy: { number: "desc" },
      select: {
        parsedText: true,
        values: {
          select: {
            id: true,
            field: true,
            value: true,
            evidence: true,
            reviews: { orderBy: { seq: "desc" }, take: 1 },
          },
        },
      },
    });

    const fieldTypes = new Map<string, FieldType>(
      FIELD_DEFINITIONS[doc.type].map((f) => [f.field, f.type]),
    );
    const valueRows: {
      id: string;
      versionId: string;
      field: string;
      value: string | null;
      evidence: string | null;
      evidenceStart: number | null;
      evidenceEnd: number | null;
      gapReason: string | null;
      baselineValueId: string | null;
    }[] = [];
    const reviewRows: {
      valueId: string;
      action: "approve" | "correct";
      correctedValue: string | null;
      note: string | null;
      carriedFromReviewId: string;
    }[] = [];

    for (const value of values) {
      const fieldType = fieldTypes.get(value.field);
      if (!fieldType)
        throw new Error(`Unknown field ${value.field} for ${doc.type}`);
      const before = prior?.values.find((p) => p.field === value.field);
      const id = randomUUID();
      valueRows.push({
        id,
        versionId: lease.versionId,
        field: value.field,
        value: value.value,
        evidence: value.evidence,
        evidenceStart: value.evidenceStart,
        evidenceEnd: value.evidenceEnd,
        gapReason: value.gapReason,
        baselineValueId: before?.id ?? null,
      });

      const review = before?.reviews[0];
      if (!prior || !before || !review) continue;
      const decision = decideCarryOver({
        fieldType,
        prior: { value: before.value, evidence: before.evidence, review },
        next: { value: value.value },
        priorText: prior.parsedText ?? "",
        nextText: version.parsedText,
      });
      if (decision.carry) {
        reviewRows.push({
          valueId: id,
          action: review.action,
          correctedValue: review.correctedValue,
          note: review.note,
          carriedFromReviewId: review.id,
        });
      }
    }

    if (valueRows.length > 0) {
      await tx.extractedValue.createMany({ data: valueRows });
    }
    if (reviewRows.length > 0) {
      await tx.review.createMany({ data: reviewRows });
    }

    await tx.documentVersion.update({
      where: { id: lease.versionId },
      data: {
        status: "extracted",
        extractedAt: new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    return "committed";
  });
}

export interface ReconcileResult {
  /** Versions whose worker stopped responding and that went back to the queue. */
  requeued: string[];
  /** Versions that lost their worker too many times and are now failed. */
  failed: string[];
  /** Queued versions that can run now; the caller (re-)enqueues them. */
  runnable: string[];
}

/**
 * Repairs extraction state from Postgres alone. Safe to run at any time and
 * from several processes; this is what makes a Redis flush or a killed worker
 * recoverable.
 */
export async function reconcile(db: Db): Promise<ReconcileResult> {
  const expired = await db.$queryRawUnsafe<{ id: string; status: string }[]>(
    `UPDATE "DocumentVersion"
        SET status = CASE WHEN attempts >= $1 THEN 'failed'::"VersionStatus" ELSE 'queued'::"VersionStatus" END,
            "failureReason" = CASE WHEN attempts >= $1
              THEN 'The worker stopped responding ' || attempts || ' times while extracting this version.'
              ELSE NULL END,
            "leaseToken" = NULL, "leaseExpiresAt" = NULL
      WHERE status = 'extracting' AND "leaseExpiresAt" < ${NOW}
      RETURNING id::text AS id, status::text AS status`,
    MAX_ATTEMPTS,
  );
  const runnable = await db.$queryRawUnsafe<{ id: string }[]>(
    `SELECT v.id::text AS id FROM "DocumentVersion" v
      WHERE v.status = 'queued'
        AND NOT EXISTS (
          SELECT 1 FROM "DocumentVersion" e
           WHERE e."documentId" = v."documentId" AND e.number < v.number
             AND e.status IN ('queued', 'extracting'))
      ORDER BY v."createdAt"`,
  );
  return {
    requeued: expired.filter((r) => r.status === "queued").map((r) => r.id),
    failed: expired.filter((r) => r.status === "failed").map((r) => r.id),
    runnable: runnable.map((r) => r.id),
  };
}

/** Puts the latest version back in the queue if it failed. Returns its id and whether it was requeued. */
export async function retryLatest(
  db: Db,
  documentId: string,
): Promise<{ versionId: string; requeued: boolean }> {
  return db.$transaction(async (tx) => {
    await lockDocument(tx, documentId);
    const latest = await tx.documentVersion.findFirst({
      where: { documentId },
      orderBy: { number: "desc" },
      select: { id: true, status: true },
    });
    if (!latest)
      throw new NotFoundError(`Document ${documentId} has no versions`);
    if (latest.status !== "failed")
      return { versionId: latest.id, requeued: false };
    await tx.documentVersion.update({
      where: { id: latest.id },
      data: {
        status: "queued",
        attempts: 0,
        failureReason: null,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    return { versionId: latest.id, requeued: true };
  });
}

export interface ReviewInput {
  action: "approve" | "correct";
  correctedValue?: string | null;
  note?: string | null;
}

/**
 * Records a review. Only values of the document's latest extracted version can
 * be reviewed; the check runs under the document lock that commits also take,
 * so a review can never land on a version that carry-over has already read.
 */
export async function reviewValue(db: Db, valueId: string, input: ReviewInput) {
  const note = input.note?.trim() || null;
  return db.$transaction(async (tx) => {
    const value = await tx.extractedValue.findUnique({
      where: { id: valueId },
      select: {
        field: true,
        versionId: true,
        version: { select: { documentId: true, number: true } },
      },
    });
    if (!value) throw new NotFoundError(`Value ${valueId} not found`);
    const doc = await lockDocument(tx, value.version.documentId);

    const latestExtracted = await tx.documentVersion.findFirst({
      where: { documentId: doc.id, status: "extracted" },
      orderBy: { number: "desc" },
      select: { id: true, number: true },
    });
    if (latestExtracted?.id !== value.versionId) {
      throw new ConflictError(
        `Version ${value.version.number} is no longer the current version; review version ${latestExtracted?.number} instead.`,
      );
    }

    let correctedValue: string | null = null;
    if (input.action === "correct") {
      const fieldType =
        FIELD_DEFINITIONS[doc.type].find((f) => f.field === value.field)
          ?.type ?? "string";
      const raw = input.correctedValue?.trim() ?? "";
      if (raw === "") throw new ValidationError("A correction needs a value.");
      correctedValue = canonicalize(fieldType, raw);
      if (correctedValue === null)
        throw new ValidationError(`"${raw}" is not a valid ${fieldType}.`);
    }

    return tx.review.create({
      data: { valueId, action: input.action, correctedValue, note },
    });
  });
}
