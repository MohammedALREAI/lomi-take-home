import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  INVOICE_V1_TEXT,
  INVOICE_V2_TEXT,
  PDF,
  invoiceValues,
  resetDb,
  testDb,
} from "../test/db.js";
import {
  addVersion,
  claimVersion,
  commitExtraction,
  createDocument,
  failVersion,
  heartbeat,
  reconcile,
  retryLatest,
  reviewValue,
  saveParsedText,
  type Lease,
} from "./coordination.js";
import { ConflictError } from "./errors.js";
import { getDocument, getProgress } from "./queries.js";

const db = testDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

async function newInvoice() {
  return createDocument(db, { id: "doc-invoice-001", type: "invoice", title: "Invoice", fileName: "v1.pdf", pdf: PDF });
}

async function expireLease(versionId: string) {
  await db.$executeRawUnsafe(
    `UPDATE "DocumentVersion" SET "leaseExpiresAt" = (now() AT TIME ZONE 'UTC') - interval '1 minute' WHERE id = $1::uuid`,
    versionId,
  );
}

async function extract(lease: Lease, text: string, due: string, total: string) {
  expect(await saveParsedText(db, lease, text)).toBe(true);
  return commitExtraction(db, lease, invoiceValues(text, due, total));
}

const valueCount = (versionId: string) => db.extractedValue.count({ where: { versionId } });

describe("extracting the same version twice", () => {
  it("commits once, however the second run happens", async () => {
    const { versionId } = await newInvoice();
    const lease = (await claimVersion(db, versionId))!;
    expect(lease).not.toBeNull();
    expect(await claimVersion(db, versionId)).toBeNull(); // a second worker cannot take it

    expect(await extract(lease, INVOICE_V1_TEXT, "2025-10-14", "5230.29")).toBe("committed");
    // The same worker running again (a retry after a timeout, say) is fenced out.
    expect(await saveParsedText(db, lease, INVOICE_V1_TEXT)).toBe(false);
    expect(await commitExtraction(db, lease, invoiceValues(INVOICE_V1_TEXT, "2025-10-14", "5230.29"))).toBe(
      "lost_lease",
    );
    expect(await valueCount(versionId)).toBe(5);
  });

  it("fences out a worker whose lease expired and was taken over", async () => {
    const { versionId } = await newInvoice();
    const stale = (await claimVersion(db, versionId))!;
    await expireLease(versionId);
    expect((await reconcile(db)).requeued).toEqual([versionId]);
    const fresh = (await claimVersion(db, versionId))!;
    expect(fresh.attempt).toBe(2);

    // The stale worker wakes up: none of its writes may land.
    expect(await heartbeat(db, stale)).toBe(false);
    expect(await saveParsedText(db, stale, "stale text")).toBe(false);
    expect(await failVersion(db, stale, "stale failure")).toBe(false);
    expect(await commitExtraction(db, stale, invoiceValues(INVOICE_V1_TEXT, "2025-10-14", "5230.29"))).toBe(
      "lost_lease",
    );

    expect(await extract(fresh, INVOICE_V1_TEXT, "2025-10-14", "5230.29")).toBe("committed");
    expect(await valueCount(versionId)).toBe(5);
    const version = await db.documentVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(version).toMatchObject({ status: "extracted", parsedText: INVOICE_V1_TEXT, leaseToken: null });
  });
});

describe("recovering from lost queue state", () => {
  it("finds every runnable version from Postgres alone, as after a Redis flush", async () => {
    const { versionId: a } = await newInvoice();
    const { versionId: b } = await createDocument(db, {
      type: "lease", title: "Lease", fileName: "lease.pdf", pdf: PDF,
    });
    const leaseB = (await claimVersion(db, b))!;
    expect(leaseB).not.toBeNull();

    // Nothing is in Redis. The queued version is runnable; the live lease is left alone.
    expect(await reconcile(db)).toEqual({ requeued: [], failed: [], runnable: [a] });

    // The worker holding b dies: once its lease expires, b is runnable again.
    await expireLease(b);
    expect(await reconcile(db)).toEqual({ requeued: [b], failed: [], runnable: [a, b] });
  });

  it("fails a version that keeps losing its worker, and retry makes it runnable again", async () => {
    const { documentId, versionId } = await newInvoice();
    for (let i = 0; i < 3; i++) {
      expect(await claimVersion(db, versionId)).not.toBeNull();
      await expireLease(versionId);
      await reconcile(db);
    }
    const failed = await db.documentVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(failed.status).toBe("failed");
    expect(failed.failureReason).toMatch(/stopped responding 3 times/);

    expect(await retryLatest(db, documentId)).toEqual({ versionId, requeued: true });
    expect(await retryLatest(db, documentId)).toEqual({ versionId, requeued: false });
    expect((await claimVersion(db, versionId))?.attempt).toBe(1);
  });
});

describe("a new version while the previous one is extracting", () => {
  it("waits, then carries over unchanged reviews and blocks reviews of the old version", async () => {
    const { documentId, versionId: v1 } = await newInvoice();
    const lease1 = (await claimVersion(db, v1))!;

    const { versionId: v2, number } = await addVersion(db, documentId, { fileName: "v2.pdf", pdf: PDF });
    expect(number).toBe(2);
    expect(await claimVersion(db, v2)).toBeNull(); // queued behind v1
    expect((await reconcile(db)).runnable).toEqual([]);

    expect(await extract(lease1, INVOICE_V1_TEXT, "2025-10-14", "5230.29")).toBe("committed");
    expect((await reconcile(db)).runnable).toEqual([v2]);

    // Review all of v1; correct the vendor name.
    const v1Values = await db.extractedValue.findMany({ where: { versionId: v1 } });
    for (const v of v1Values) {
      await reviewValue(
        db,
        v.id,
        v.field === "vendor_name"
          ? { action: "correct", correctedValue: "Meridian Office Supplies LLC", note: "Use the legal name" }
          : { action: "approve" },
      );
    }

    const lease2 = (await claimVersion(db, v2))!;
    // v1 stays reviewable while v2 is extracting.
    await reviewValue(db, v1Values[0]!.id, { action: "approve", note: "double-checked" });
    expect(await extract(lease2, INVOICE_V2_TEXT, "2025-11-13", "6126.45")).toBe("committed");

    const doc = await getDocument(db, documentId);
    const byField = Object.fromEntries(doc.values.map((v) => [v.field, v]));
    expect(byField.due_date).toMatchObject({
      state: "pending",
      value: "2025-11-13",
      baseline: { versionNumber: 1, value: "2025-10-14", state: "approved" },
    });
    expect(byField.total_amount).toMatchObject({ state: "pending", baseline: { value: "5230.29" } });
    expect(byField.vendor_name).toMatchObject({
      state: "carried_over",
      effectiveValue: "Meridian Office Supplies LLC",
      review: { action: "correct", note: "Use the legal name", carriedOver: true },
    });
    expect(byField.invoice_number?.state).toBe("carried_over");
    expect(byField.issue_date?.state).toBe("carried_over");

    expect(await getProgress(db, documentId)).toMatchObject({
      currentVersion: 2, countedVersion: 2, total: 5, pending: 2, carriedOver: 3, approved: 0, corrected: 0,
    });

    // The old version is still there and readable, but no longer reviewable.
    const old = await getDocument(db, documentId, 1);
    expect(old.shownVersion).toMatchObject({ number: 1, reviewable: false, parsedText: INVOICE_V1_TEXT });
    expect(old.values).toHaveLength(5);
    await expect(reviewValue(db, v1Values[0]!.id, { action: "approve" })).rejects.toBeInstanceOf(ConflictError);
  });
});
