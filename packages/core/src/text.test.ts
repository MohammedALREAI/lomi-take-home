import { describe, expect, it } from "vitest";
import { findEvidence, findEvidenceAll, normalizeText } from "./text.js";

describe("normalizeText", () => {
  it("normalizes line endings, NUL bytes and Unicode form", () => {
    expect(normalizeText("a\r\nb\rc\0d")).toBe("a\nb\ncd");
    expect(normalizeText("Café")).toBe("Café");
  });
});

describe("findEvidence", () => {
  const invoice = [
    "Invoice Number: INV-2025-0847",
    "Payment Terms: Net 30",
    "                                    Total Due:      $5,230.29",
  ].join("\n");

  it("tolerates runs of whitespace and returns the exact source slice", () => {
    const match = findEvidence(invoice, "Total Due: $5,230.29");
    expect(match?.text).toBe("Total Due:      $5,230.29");
    expect(invoice.slice(match!.start, match!.end)).toBe(match!.text);
  });

  it("matches a phrase wrapped across lines, as in the lease", () => {
    const lease = "The initial term of this Lease shall be twenty-four (24)\nmonths, commencing on March 1, 2025";
    expect(findEvidence(lease, "twenty-four (24) months")).not.toBeNull();
  });

  it("is case-sensitive", () => {
    expect(findEvidence(invoice, "invoice number: INV-2025-0847")).toBeNull();
  });

  it("respects token boundaries", () => {
    expect(findEvidence("Payment Terms: Net 300", "Net 30")).toBeNull();
    expect(findEvidence("Ref INV-2025-0847-A", "INV-2025-0847")).toBeNull();
    expect(findEvidence("rent of $1,985.50 per month", "$1,985")).toBeNull();
    expect(findEvidence("rent of $11,985 per month", "1,985")).toBeNull();
    expect(findEvidence("a rate of 4.2%.", "4.2%")).not.toBeNull();
    expect(findEvidence("issued on 2025-09-14 and", "2025-09-14")).not.toBeNull();
  });

  it("finds every occurrence", () => {
    const v2 = "Issue Date: 2025-09-14\nThis revised invoice supersedes the version issued on 2025-09-14 and";
    expect(findEvidenceAll(v2, "2025-09-14")).toHaveLength(2);
  });

  it("treats regex characters in the quote literally", () => {
    expect(findEvidence("Sales Tax (8.625%): $415.29", "Sales Tax (8.625%): $415.29")).not.toBeNull();
    expect(findEvidence("Sales Tax (8x625%)", "(8.625%)")).toBeNull();
  });

  it("returns null for an empty quote", () => {
    expect(findEvidence(invoice, "   ")).toBeNull();
  });
});
