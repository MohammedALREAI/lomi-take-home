import { FIELD_DEFINITIONS, type FieldType } from "@app/core";
import type { Db } from "./client.js";
import { NotFoundError } from "./errors.js";

// Read models for the API. A value's state is derived from its latest review,
// so there is no separate status column to keep consistent.

export type ValueState = "pending" | "approved" | "corrected" | "carried_over";

interface ReviewRow {
  id: string;
  action: "approve" | "correct";
  correctedValue: string | null;
  note: string | null;
  carriedFromReviewId: string | null;
  createdAt: Date;
}

export function stateOf(review: ReviewRow | undefined | null): ValueState {
  if (!review) return "pending";
  if (review.carriedFromReviewId) return "carried_over";
  return review.action === "correct" ? "corrected" : "approved";
}

function reviewView(review: ReviewRow | undefined | null) {
  if (!review) return null;
  return {
    id: review.id,
    action: review.action,
    correctedValue: review.correctedValue,
    note: review.note,
    carriedOver: review.carriedFromReviewId !== null,
    createdAt: review.createdAt,
  };
}

function effectiveValue(value: string | null, review: ReviewRow | undefined | null) {
  return review?.action === "correct" ? review.correctedValue : value;
}

const latestReview = { orderBy: { seq: "desc" }, take: 1 } as const;

export async function getDocument(db: Db, documentId: string, versionNumber?: number) {
  const doc = await db.document.findUnique({
    where: { id: documentId },
    include: {
      versions: {
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          fileName: true,
          status: true,
          failureReason: true,
          attempts: true,
          createdAt: true,
          extractedAt: true,
        },
      },
    },
  });
  if (!doc) throw new NotFoundError(`Document ${documentId} not found`);

  const current = doc.versions.at(-1);
  if (!current) throw new NotFoundError(`Document ${documentId} has no versions`);
  const latestExtracted = doc.versions.filter((v) => v.status === "extracted").at(-1) ?? null;

  const shown = versionNumber === undefined ? current : doc.versions.find((v) => v.number === versionNumber);
  if (!shown) throw new NotFoundError(`Document ${documentId} has no version ${versionNumber}`);

  const detail = await db.documentVersion.findUniqueOrThrow({
    where: { id: shown.id },
    select: {
      parsedText: true,
      values: {
        orderBy: { createdAt: "asc" },
        include: {
          reviews: latestReview,
          baseline: {
            include: { reviews: latestReview, version: { select: { number: true } } },
          },
        },
      },
    },
  });

  const types = new Map<string, FieldType>(FIELD_DEFINITIONS[doc.type].map((f) => [f.field, f.type]));
  const order = FIELD_DEFINITIONS[doc.type].map((f) => f.field as string);
  const values = detail.values
    .map((v) => {
      const review = v.reviews[0];
      const baselineReview = v.baseline?.reviews[0];
      return {
        id: v.id,
        field: v.field,
        type: types.get(v.field) ?? "string",
        value: v.value,
        evidence: v.evidence,
        evidenceStart: v.evidenceStart,
        evidenceEnd: v.evidenceEnd,
        gap: v.value === null ? { reason: v.gapReason ?? "No value was extracted." } : null,
        state: stateOf(review),
        review: reviewView(review),
        effectiveValue: effectiveValue(v.value, review),
        baseline: v.baseline
          ? {
              versionNumber: v.baseline.version.number,
              value: v.baseline.value,
              evidence: v.baseline.evidence,
              gapReason: v.baseline.gapReason,
              state: stateOf(baselineReview),
              review: reviewView(baselineReview),
              effectiveValue: effectiveValue(v.baseline.value, baselineReview),
            }
          : null,
      };
    })
    .sort((a, b) => order.indexOf(a.field) - order.indexOf(b.field));

  const versionView = (v: typeof current) => ({
    id: v.id,
    number: v.number,
    fileName: v.fileName,
    status: v.status,
    failureReason: v.failureReason,
    attempts: v.attempts,
    createdAt: v.createdAt,
    extractedAt: v.extractedAt,
  });

  return {
    id: doc.id,
    type: doc.type,
    title: doc.title,
    createdAt: doc.createdAt,
    currentVersion: versionView(current),
    latestExtractedVersion: latestExtracted?.number ?? null,
    versions: doc.versions.map(versionView),
    shownVersion: {
      ...versionView(shown),
      reviewable: shown.id === latestExtracted?.id,
      parsedText: detail.parsedText,
    },
    values,
  };
}

export interface Progress {
  total: number;
  pending: number;
  approved: number;
  corrected: number;
  carriedOver: number;
}

const EMPTY_PROGRESS: Progress = { total: 0, pending: 0, approved: 0, corrected: 0, carriedOver: 0 };

/** Review counts per version, one query for any number of versions. */
export async function progressByVersion(db: Db, versionIds: string[]): Promise<Map<string, Progress>> {
  if (versionIds.length === 0) return new Map();
  const rows = await db.$queryRaw<
    { versionId: string; total: bigint; pending: bigint; approved: bigint; corrected: bigint; carried: bigint }[]
  >`
    SELECT v."versionId"::text AS "versionId",
           count(*) AS total,
           count(*) FILTER (WHERE r.id IS NULL) AS pending,
           count(*) FILTER (WHERE r."carriedFromReviewId" IS NULL AND r.action = 'approve') AS approved,
           count(*) FILTER (WHERE r."carriedFromReviewId" IS NULL AND r.action = 'correct') AS corrected,
           count(*) FILTER (WHERE r."carriedFromReviewId" IS NOT NULL) AS carried
      FROM "ExtractedValue" v
      LEFT JOIN LATERAL (
        SELECT id, action, "carriedFromReviewId" FROM "Review"
         WHERE "valueId" = v.id ORDER BY seq DESC LIMIT 1) r ON true
     WHERE v."versionId" = ANY(${versionIds}::uuid[])
     GROUP BY v."versionId"`;
  return new Map(
    rows.map((r) => [
      r.versionId,
      {
        total: Number(r.total),
        pending: Number(r.pending),
        approved: Number(r.approved),
        corrected: Number(r.corrected),
        carriedOver: Number(r.carried),
      },
    ]),
  );
}

/**
 * Progress of the document's current version. While that version is still
 * queued or extracting, the counts describe the latest extracted version, and
 * the response says which version it is.
 */
export async function getProgress(db: Db, documentId: string) {
  const versions = await db.documentVersion.findMany({
    where: { documentId },
    orderBy: { number: "desc" },
    select: { id: true, number: true, status: true },
  });
  const current = versions[0];
  if (!current) throw new NotFoundError(`Document ${documentId} not found`);
  const counted = current.status === "extracted" ? current : versions.find((v) => v.status === "extracted");
  const progress = counted ? (await progressByVersion(db, [counted.id])).get(counted.id) : undefined;
  return {
    documentId,
    currentVersion: current.number,
    currentStatus: current.status,
    countedVersion: counted?.number ?? null,
    ...(progress ?? EMPTY_PROGRESS),
  };
}

export async function listDocuments(db: Db) {
  const docs = await db.document.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      versions: {
        orderBy: { number: "desc" },
        select: { id: true, number: true, status: true, failureReason: true },
      },
    },
  });
  const counted = docs.map((d) => d.versions.find((v) => v.status === "extracted") ?? null);
  const progress = await progressByVersion(
    db,
    counted.flatMap((v) => (v ? [v.id] : [])),
  );
  return docs.map((d, i) => {
    const current = d.versions[0]!;
    const c = counted[i];
    return {
      id: d.id,
      type: d.type,
      title: d.title,
      currentVersion: current.number,
      status: current.status,
      failureReason: current.failureReason,
      countedVersion: c?.number ?? null,
      progress: (c && progress.get(c.id)) || EMPTY_PROGRESS,
    };
  });
}
