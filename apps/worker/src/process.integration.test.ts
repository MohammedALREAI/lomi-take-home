import { readFileSync } from "node:fs";
import type { LlmField } from "@app/core";
import { claimVersion, createDocument, getDocument, reconcile, retryLatest } from "@app/db";
import { resetDb, testDb } from "@app/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FakeExtractor } from "./fake-extractor.js";
import { processVersion } from "./process.js";

const db = testDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

const invoicePdf = new Uint8Array(
  readFileSync(new URL("../../../fixtures/documents/invoice-001.pdf", import.meta.url)),
);

const field = (value: string | null, evidence: string | null): LlmField => ({
  value,
  evidence,
  missing_reason: value === null ? "Not stated." : null,
});

// A plausible model answer for invoice v1, with one hallucinated quote.
const invoiceAnswer = () => ({
  invoice_number: field("INV-2025-0847", "Invoice Number: INV-2025-0847"),
  issue_date: field("2025-09-14", "Issue Date: 2025-09-14"),
  due_date: field("2025-10-14", "Payment is due on October 14, 2025"),
  vendor_name: field("MERIDIAN OFFICE SUPPLIES LLC", "MERIDIAN OFFICE SUPPLIES LLC"),
  total_amount: field("5230.29", "Total Due: $5,230.29"),
});

async function upload() {
  return createDocument(db, { type: "invoice", title: "Invoice", fileName: "invoice.pdf", pdf: invoicePdf });
}

describe("processVersion", () => {
  it("parses the PDF, stores the run, and keeps only values whose evidence is in the text", async () => {
    const { documentId, versionId } = await upload();
    const outcome = await processVersion({ db, extractor: new FakeExtractor(invoiceAnswer) }, versionId);
    expect(outcome).toBe("extracted");

    const doc = await getDocument(db, documentId);
    expect(doc.shownVersion.parsedText).toContain("Due Date: 2025-10-14");
    const byField = Object.fromEntries(doc.values.map((v) => [v.field, v]));
    const total = byField.total_amount!;
    expect(total).toMatchObject({ value: "5230.29", gap: null, evidence: expect.stringContaining("$5,230.29") });
    expect(doc.shownVersion.parsedText!.slice(total.evidenceStart!, total.evidenceEnd!)).toBe(total.evidence);
    expect(byField.due_date).toMatchObject({ value: null, gap: { reason: expect.stringMatching(/does not appear/) } });

    const runs = await db.extractionRun.findMany({ where: { versionId } });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ attempt: 1, model: "fake", error: null });
    expect(runs[0]!.prompt).toContain("invoice");
    expect(runs[0]!.rawResponse).toContain("INV-2025-0847");
  });

  it("skips a version another worker already took", async () => {
    const { versionId } = await upload();
    await claimVersion(db, versionId);
    const extractor = new FakeExtractor(invoiceAnswer);
    expect(await processVersion({ db, extractor }, versionId)).toBe("skipped");
    expect(extractor.calls).toBe(0);
  });

  it("records a model error as a failed, retryable version", async () => {
    const { documentId, versionId } = await upload();
    const broken = new FakeExtractor(() => new Error("Gemini API error 503: high demand"));
    expect(await processVersion({ db, extractor: broken }, versionId)).toBe("failed");

    let version = await db.documentVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(version).toMatchObject({ status: "failed", leaseToken: null });
    expect(version.failureReason).toMatch(/high demand/);
    expect((await db.extractionRun.findFirstOrThrow({ where: { versionId } })).error).toMatch(/high demand/);

    await retryLatest(db, documentId);
    expect(await processVersion({ db, extractor: new FakeExtractor(invoiceAnswer) }, versionId)).toBe("extracted");
    version = await db.documentVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(version.status).toBe("extracted");
    expect(await db.extractionRun.count({ where: { versionId } })).toBe(2);
  });

  it("fails with a clear reason when no model is configured", async () => {
    const { versionId } = await upload();
    expect(await processVersion({ db, extractor: null }, versionId)).toBe("failed");
    const version = await db.documentVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(version.failureReason).toMatch(/GEMINI_API_KEY/);
  });

  it("fails a PDF it cannot read", async () => {
    const { versionId } = await createDocument(db, {
      type: "invoice", title: "Broken", fileName: "broken.pdf", pdf: new TextEncoder().encode("not a pdf"),
    });
    expect(await processVersion({ db, extractor: new FakeExtractor(invoiceAnswer) }, versionId)).toBe("failed");
    const version = await db.documentVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(version.failureReason).toMatch(/Could not read the PDF/);
  });

  it("times out a hung model call and leaves the version retryable", async () => {
    const { versionId } = await upload();
    const hung = new FakeExtractor(invoiceAnswer, 5_000);
    expect(await processVersion({ db, extractor: hung, deadlineMs: 200 }, versionId)).toBe("failed");
    const version = await db.documentVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(version.failureReason).toMatch(/timed out/);
  });

  it("stops without writing when its lease is taken over mid-extraction", async () => {
    const { versionId } = await upload();
    // The worker stalls (no heartbeat lands for a while) and is presumed dead:
    // its lease expires and another worker takes over before its first heartbeat.
    const slow = new FakeExtractor(invoiceAnswer, 15_000);
    const running = processVersion({ db, extractor: slow, heartbeatMs: 3_000 }, versionId);
    // Wait until it is inside the model call.
    while ((await db.extractionRun.count({ where: { versionId } })) === 0) {
      await new Promise((r) => setTimeout(r, 20));
    }
    const started = Date.now();
    await db.$executeRawUnsafe(
      `UPDATE "DocumentVersion" SET "leaseExpiresAt" = (now() AT TIME ZONE 'UTC') - interval '1 minute' WHERE id = $1::uuid`,
      versionId,
    );
    expect((await reconcile(db)).requeued).toEqual([versionId]);
    const takeover = await claimVersion(db, versionId);
    expect(takeover).not.toBeNull();

    // Its next heartbeat finds the lease gone and aborts the model call early.
    expect(await running).toBe("lost_lease");
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(await db.extractedValue.count({ where: { versionId } })).toBe(0);
    const version = await db.documentVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(version).toMatchObject({ status: "extracting", leaseToken: takeover!.token });
  });
});
