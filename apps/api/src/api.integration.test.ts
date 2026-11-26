import "reflect-metadata";
import { readFileSync } from "node:fs";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { claimVersion, commitExtraction, saveParsedText } from "@app/db";
import { TEST_DATABASE_URL, resetDb, testDb } from "@app/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// The API runs against the test database and, on purpose, with no Redis at
// all: uploads must still answer at once and leave the version queued.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.REDIS_URL = "redis://127.0.0.1:1";

const { AppModule } = await import("./app.module.js");
const { setupSwagger } = await import("./swagger.js");

const db = testDb();
let app: INestApplication;
let base: string;

beforeAll(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  setupSwagger(app);
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});
beforeEach(() => resetDb(db));

const invoice = readFileSync(new URL("../../../fixtures/documents/invoice-001.pdf", import.meta.url));

function pdfForm(fields: Record<string, string>, file: Buffer | string = invoice, name = "invoice-001.pdf") {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  form.set("file", new Blob([file]), name);
  return form;
}

async function call(method: string, path: string, body?: FormData | object) {
  const init: RequestInit = { method };
  if (body instanceof FormData) init.body = body;
  else if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  const res = await fetch(base + path, init);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

async function uploadInvoice() {
  const res = await call("POST", "/documents", pdfForm({ type: "invoice" }));
  expect(res.status).toBe(202);
  return res.body as { documentId: string; versionId: string; number: number };
}

/** Stands in for the worker: extracts the version with fixed values. */
async function extractAsWorker(versionId: string) {
  const lease = (await claimVersion(db, versionId))!;
  await saveParsedText(db, lease, "Invoice Number: INV-2025-0847");
  await commitExtraction(db, lease, [
    { field: "invoice_number", value: "INV-2025-0847", evidence: "Invoice Number: INV-2025-0847", evidenceStart: 0, evidenceEnd: 29, gapReason: null },
    { field: "issue_date", value: null, evidence: null, evidenceStart: null, evidenceEnd: null, gapReason: "Not stated." },
    { field: "due_date", value: null, evidence: null, evidenceStart: null, evidenceEnd: null, gapReason: "Not stated." },
    { field: "vendor_name", value: null, evidence: null, evidenceStart: null, evidenceEnd: null, gapReason: "Not stated." },
    { field: "total_amount", value: null, evidence: null, evidenceStart: null, evidenceEnd: null, gapReason: "Not stated." },
  ]);
}

describe("uploads", () => {
  it("answers at once with the version queued, even with Redis down", async () => {
    const started = Date.now();
    const created = await uploadInvoice();
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(created).toMatchObject({ number: 1, status: "queued" });

    const doc = await call("GET", `/documents/${created.documentId}`);
    expect(doc.body).toMatchObject({
      type: "invoice",
      title: "invoice-001",
      currentVersion: { number: 1, status: "queued" },
      latestExtractedVersion: null,
      values: [],
    });
  });

  it("rejects bad uploads with 400", async () => {
    expect((await call("POST", "/documents", pdfForm({ type: "receipt" }))).status).toBe(400);
    expect((await call("POST", "/documents", pdfForm({ type: "invoice" }, "hello", "notes.txt"))).status).toBe(400);
    const noFile = new FormData();
    noFile.set("type", "invoice");
    expect((await call("POST", "/documents", noFile)).body).toMatchObject({ statusCode: 400 });
  });

  it("queues a new version behind the current one", async () => {
    const { documentId } = await uploadInvoice();
    const v2 = await call("POST", `/documents/${documentId}/versions`, pdfForm({}));
    expect(v2).toMatchObject({ status: 202, body: { number: 2, status: "queued" } });
    expect((await call("POST", "/documents/nope/versions", pdfForm({}))).status).toBe(404);
  });
});

describe("reviews and progress", () => {
  it("approves, corrects, validates and reports progress", async () => {
    const { documentId, versionId } = await uploadInvoice();
    await extractAsWorker(versionId);

    const doc = await call("GET", `/documents/${documentId}`);
    const [invoiceNumber, issueDate] = doc.body.values as { id: string; field: string }[];
    expect(invoiceNumber!.field).toBe("invoice_number");

    expect((await call("POST", `/values/${invoiceNumber!.id}/review`, { action: "approve" })).status).toBe(201);
    expect(
      (await call("POST", `/values/${issueDate!.id}/review`, { action: "correct", correctedValue: "Sept 14, 2025" })).status,
    ).toBe(201);
    const corrected = await call("GET", `/documents/${documentId}`);
    expect(corrected.body.values[1]).toMatchObject({ state: "corrected", value: null, effectiveValue: "2025-09-14" });

    // Invalid reviews.
    expect((await call("POST", `/values/${issueDate!.id}/review`, { action: "correct" })).status).toBe(400);
    expect((await call("POST", `/values/${issueDate!.id}/review`, { action: "correct", correctedValue: "soon" })).status).toBe(400);
    expect((await call("POST", `/values/${issueDate!.id}/review`, { action: "maybe" })).status).toBe(400);
    expect((await call("POST", "/values/00000000-0000-0000-0000-000000000000/review", { action: "approve" })).status).toBe(404);

    expect((await call("GET", `/documents/${documentId}/progress`)).body).toMatchObject({
      currentVersion: 1, countedVersion: 1, total: 5, pending: 3, approved: 1, corrected: 1, carriedOver: 0,
    });
    const list = await call("GET", "/documents");
    expect(list.body).toEqual([
      expect.objectContaining({ id: documentId, status: "extracted", progress: expect.objectContaining({ pending: 3 }) }),
    ]);
  });

  it("returns 409 for a review of a version that is no longer current", async () => {
    const { documentId, versionId } = await uploadInvoice();
    await extractAsWorker(versionId);
    const oldValue = (await call("GET", `/documents/${documentId}`)).body.values[0].id as string;

    const v2 = await call("POST", `/documents/${documentId}/versions`, pdfForm({}));
    await extractAsWorker(v2.body.versionId);

    const res = await call("POST", `/values/${oldValue}/review`, { action: "approve" });
    expect(res).toMatchObject({ status: 409, body: { message: expect.stringMatching(/no longer the current version/) } });
    expect((await call("GET", `/documents/${documentId}?version=1`)).body.shownVersion).toMatchObject({
      number: 1,
      reviewable: false,
    });
    expect((await call("GET", `/documents/${documentId}?version=7`)).status).toBe(404);
    expect((await call("GET", `/documents/${documentId}?version=abc`)).status).toBe(400);
  });
});

describe("API docs", () => {
  it("documents every endpoint, with request bodies from the zod schemas", async () => {
    const { status, body } = await call("GET", "/docs-json");
    expect(status).toBe(200);
    const operations = Object.entries(body.paths as Record<string, object>).flatMap(([path, methods]) =>
      Object.keys(methods).map((m) => `${m.toUpperCase()} ${path}`),
    );
    expect(operations.sort()).toEqual(
      [
        "GET /documents",
        "GET /documents/{id}",
        "GET /documents/{id}/progress",
        "GET /health",
        "POST /documents",
        "POST /documents/{id}/retry",
        "POST /documents/{id}/versions",
        "POST /values/{id}/review",
      ].sort(),
    );
    const review = body.paths["/values/{id}/review"].post.requestBody.content["application/json"].schema;
    expect(JSON.stringify(review)).toContain("correctedValue");
    const upload = body.paths["/documents"].post.requestBody.content["multipart/form-data"].schema;
    expect(upload.required).toEqual(["type", "file"]);
    expect(upload.properties.type.enum).toEqual(["invoice", "lease", "market_report"]);

    const page = await fetch(`${base}/docs`);
    expect(page.status).toBe(200);
  });
});

describe("retry", () => {
  it("requeues only a failed latest version", async () => {
    const { documentId, versionId } = await uploadInvoice();
    expect((await call("POST", `/documents/${documentId}/retry`)).body).toEqual({ versionId, requeued: false });
    await db.documentVersion.update({ where: { id: versionId }, data: { status: "failed", failureReason: "boom" } });
    expect((await call("POST", `/documents/${documentId}/retry`)).body).toEqual({ versionId, requeued: true });
    expect((await call("GET", `/documents/${documentId}`)).body.currentVersion).toMatchObject({
      status: "queued",
      failureReason: null,
    });
  });
});
