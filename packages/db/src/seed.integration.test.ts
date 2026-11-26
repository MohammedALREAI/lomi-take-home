import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, resetDb, testDb } from "./testing.js";

process.env.DATABASE_URL = TEST_DATABASE_URL;
const { seed } = await import("./seed.js");

const db = testDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

describe("seed", () => {
  it("seeds only version 1 of each manifest document, as queued", async () => {
    await seed();
    const versions = await db.documentVersion.findMany({
      select: { documentId: true, number: true, status: true, fileName: true },
      orderBy: { documentId: "asc" },
    });
    expect(versions).toEqual([
      { documentId: "doc-invoice-001", number: 1, status: "queued", fileName: "invoice-001.pdf" },
      { documentId: "doc-lease-001", number: 1, status: "queued", fileName: "lease-excerpt-001.pdf" },
      { documentId: "doc-report-001", number: 1, status: "queued", fileName: "market-report-excerpt-001.pdf" },
    ]);
  });

  it("leaves existing documents untouched when run again", async () => {
    await seed();
    await db.documentVersion.updateMany({
      where: { documentId: "doc-invoice-001" },
      data: { status: "extracted", parsedText: "already extracted" },
    });
    await seed();
    expect(await db.documentVersion.count()).toBe(3);
    const invoice = await db.documentVersion.findFirstOrThrow({ where: { documentId: "doc-invoice-001" } });
    expect(invoice).toMatchObject({ status: "extracted", parsedText: "already extracted" });
  });
});
