import { readFileSync } from "node:fs";
import { findEvidence } from "@app/core";
import { describe, expect, it } from "vitest";
import { parsePdf } from "./parse.js";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../../../fixtures/documents/${name}`, import.meta.url)));

describe("parsePdf on the fixtures", () => {
  it("keeps each invoice header field on its own line", async () => {
    const lines = (await parsePdf(fixture("invoice-001.pdf"))).split("\n").map((l) => l.trim());
    for (const line of [
      "Invoice Number: INV-2025-0847",
      "Issue Date: 2025-09-14",
      "Due Date: 2025-10-14",
      "Payment Terms: Net 30",
    ]) {
      expect(lines).toContain(line);
    }
  });

  it("finds the passages each expected field is quoted from", async () => {
    const cases: [string, string[]][] = [
      ["invoice-001.pdf", ["MERIDIAN OFFICE SUPPLIES LLC", "Total Due: $5,230.29"]],
      ["invoice-001.v2.pdf", ["Due Date: 2025-11-13", "Total Due: $6,126.45", "issued on 2025-09-14"]],
      ["lease-excerpt-001.pdf", ["Dana Okafor", "monthly rent of $2,350.00", "twenty-four (24) months", "$3,525.00"]],
      ["market-report-excerpt-001.pdf", ["Reporting Period: Q3 2025", "declined to 4.2%", "$1,985 per month"]],
    ];
    for (const [file, quotes] of cases) {
      const text = await parsePdf(fixture(file));
      for (const quote of quotes) expect(findEvidence(text, quote), `${file}: ${quote}`).not.toBeNull();
    }
  });

  it("does not mention a median household income in the market report", async () => {
    const text = await parsePdf(fixture("market-report-excerpt-001.pdf"));
    expect(text.toLowerCase()).not.toContain("household income");
  });

  it("rejects a file that is not a PDF", async () => {
    await expect(parsePdf(new TextEncoder().encode("not a pdf"))).rejects.toThrow();
  });
});
