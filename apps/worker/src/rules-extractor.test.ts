import { readFileSync } from "node:fs";
import { validateExtraction } from "@app/core";
import { describe, expect, it } from "vitest";
import { parsePdf } from "./parse.js";
import { RulesExtractor } from "./rules-extractor.js";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../../../fixtures/documents/${name}`, import.meta.url)));

async function extract(type: "invoice" | "lease" | "market_report", file: string) {
  const text = await parsePdf(fixture(file));
  const result = await new RulesExtractor().extract({ type, text, signal: new AbortController().signal });
  if (!result.ok) throw new Error(result.error);
  return Object.fromEntries(validateExtraction(type, text, result.output).map((v) => [v.field, v]));
}

// The test-only extractor must produce values that pass the real evidence check.
describe("RulesExtractor on the fixtures", () => {
  it("extracts the invoice and its revision", async () => {
    const v1 = await extract("invoice", "invoice-001.pdf");
    expect(Object.fromEntries(Object.entries(v1).map(([k, v]) => [k, v.value]))).toEqual({
      invoice_number: "INV-2025-0847",
      issue_date: "2025-09-14",
      due_date: "2025-10-14",
      vendor_name: "MERIDIAN OFFICE SUPPLIES LLC",
      total_amount: "5230.29",
    });
    const v2 = await extract("invoice", "invoice-001.v2.pdf");
    expect([v2.due_date?.value, v2.total_amount?.value]).toEqual(["2025-11-13", "6126.45"]);
  });

  it("extracts the lease", async () => {
    const lease = await extract("lease", "lease-excerpt-001.pdf");
    expect(Object.fromEntries(Object.entries(lease).map(([k, v]) => [k, v.value]))).toEqual({
      tenant_name: "Dana Okafor",
      monthly_rent: "2350.00",
      security_deposit: "3525.00",
      lease_start: "2025-03-01",
      term_months: "24",
    });
  });

  it("leaves the market report's missing field as a gap", async () => {
    const report = await extract("market_report", "market-report-excerpt-001.pdf");
    expect(report.vacancy_rate?.value).toBe("4.2");
    expect(report.average_rent_1br?.value).toBe("1985.00");
    expect(report.median_household_income).toMatchObject({ value: null, gapReason: "Not stated in the document." });
  });
});
