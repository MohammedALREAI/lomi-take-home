import { describe, expect, it } from "vitest";
import { decideCarryOver, type PriorValue } from "./carryover.js";
import { validateExtraction, type LlmField } from "./extraction.js";
import { FIELD_DEFINITIONS } from "./fields.js";

// Excerpts of the two invoice fixtures, with their layout spacing.
const INVOICE_V1 = `MERIDIAN OFFICE SUPPLIES LLC
482 Commerce Way, Suite 210

INVOICE

Invoice Number: INV-2025-0847
Issue Date: 2025-09-14
Due Date: 2025-10-14
Payment Terms: Net 30

Ergonomic chair, model EC-220  4    $412.50 $1,650.00
                                    Subtotal:   $4,815.00
                                    Sales Tax (8.625%): $415.29
                                    Total Due:  $5,230.29

Please reference the invoice number on all payments.`;

const INVOICE_V2 = `MERIDIAN OFFICE SUPPLIES LLC
482 Commerce Way, Suite 210

INVOICE (REVISED)

Invoice Number: INV-2025-0847
Issue Date: 2025-09-14
Due Date: 2025-11-13
Payment Terms: Net 60

Ergonomic chair, model EC-220  6    $412.50 $2,475.00
                                    Subtotal:   $5,640.00
                                    Sales Tax (8.625%): $486.45
                                    Total Due:  $6,126.45

This revised invoice supersedes the version issued on 2025-09-14 and
reflects two additional ergonomic chairs and updated payment terms.
Please reference the invoice number on all payments.`;

const answer = (value: string, evidence: string): LlmField => ({ value, evidence, missing_reason: null });

// What a model plausibly returns for each version. For v2 it quotes the new
// paragraph for the issue date, to show carry-over does not depend on which
// passage the model picks this time.
const V1_ANSWERS = {
  invoice_number: answer("INV-2025-0847", "Invoice Number: INV-2025-0847"),
  issue_date: answer("2025-09-14", "Issue Date: 2025-09-14"),
  due_date: answer("2025-10-14", "Due Date: 2025-10-14"),
  vendor_name: answer("Meridian Office Supplies LLC", "MERIDIAN OFFICE SUPPLIES LLC"),
  total_amount: answer("$5,230.29", "Total Due: $5,230.29"),
};
const V2_ANSWERS = {
  invoice_number: answer("INV-2025-0847", "Invoice Number: INV-2025-0847"),
  issue_date: answer("2025-09-14", "the version issued on 2025-09-14"),
  due_date: answer("2025-11-13", "Due Date: 2025-11-13"),
  vendor_name: answer("MERIDIAN OFFICE SUPPLIES LLC", "MERIDIAN OFFICE SUPPLIES LLC"),
  total_amount: answer("6126.45", "Total Due: $6,126.45"),
};

describe("validateExtraction", () => {
  it("keeps values whose evidence is in the text", () => {
    const values = validateExtraction("invoice", INVOICE_V1, V1_ANSWERS);
    expect(values.every((v) => v.gapReason === null)).toBe(true);
    const total = values.find((v) => v.field === "total_amount")!;
    expect(total.value).toBe("5230.29");
    expect(INVOICE_V1.slice(total.evidenceStart!, total.evidenceEnd!)).toBe("Total Due:  $5,230.29");
  });

  it("turns hallucinated evidence into a gap, never a value", () => {
    const values = validateExtraction("invoice", INVOICE_V1, {
      ...V1_ANSWERS,
      due_date: answer("2025-10-14", "Payment due by October 14, 2025"),
    });
    const due = values.find((v) => v.field === "due_date")!;
    expect(due.value).toBeNull();
    expect(due.gapReason).toMatch(/does not appear/);
  });

  it("rejects evidence quoted from another version", () => {
    const values = validateExtraction("invoice", INVOICE_V2, V1_ANSWERS);
    expect(values.find((v) => v.field === "due_date")!.value).toBeNull();
  });

  it("keeps the model's reason for a missing field", () => {
    const values = validateExtraction("market_report", "Market Area: Eastport", {
      median_household_income: { value: null, evidence: null, missing_reason: "Not stated in the report." },
    });
    const income = values.find((v) => v.field === "median_household_income")!;
    expect(income).toMatchObject({ value: null, gapReason: "Not stated in the report." });
    expect(values).toHaveLength(FIELD_DEFINITIONS.market_report.length);
  });

  it("gaps a value without evidence or with an unreadable value", () => {
    const values = validateExtraction("invoice", INVOICE_V1, {
      ...V1_ANSWERS,
      invoice_number: { value: "INV-2025-0847", evidence: null, missing_reason: null },
      total_amount: answer("about five thousand", "Total Due: $5,230.29"),
    });
    expect(values.find((v) => v.field === "invoice_number")!.gapReason).toMatch(/without quoting/);
    expect(values.find((v) => v.field === "total_amount")!.gapReason).toMatch(/not a valid money/);
  });
});

describe("decideCarryOver on the invoice revision", () => {
  const v1 = validateExtraction("invoice", INVOICE_V1, V1_ANSWERS);
  const v2 = validateExtraction("invoice", INVOICE_V2, V2_ANSWERS);

  function decide(review: PriorValue["review"]) {
    return Object.fromEntries(
      FIELD_DEFINITIONS.invoice.map(({ field, type }) => {
        const prior = v1.find((v) => v.field === field)!;
        const next = v2.find((v) => v.field === field)!;
        const decision = decideCarryOver({
          fieldType: type,
          prior: { value: prior.value, evidence: prior.evidence, review },
          next: { value: next.value },
          priorText: INVOICE_V1,
          nextText: INVOICE_V2,
        });
        return [field, decision];
      }),
    );
  }

  it("sends back exactly the two changed fields", () => {
    const decisions = decide({ action: "approve", correctedValue: null });
    const pending = Object.entries(decisions).filter(([, d]) => !d.carry).map(([f]) => f);
    expect(pending.sort()).toEqual(["due_date", "total_amount"]);
  });

  it("has nothing to carry when v1 was never reviewed", () => {
    expect(Object.values(decide(null)).every((d) => !d.carry)).toBe(true);
  });
});

describe("decideCarryOver edge cases", () => {
  const approved = { action: "approve", correctedValue: null } as const;

  it("does not carry when the passage survives but the value changed elsewhere", () => {
    const decision = decideCarryOver({
      fieldType: "date",
      prior: { value: "2025-10-14", evidence: "Due Date: 2025-10-14", review: approved },
      next: { value: "2025-11-13" },
      priorText: "Due Date: 2025-10-14",
      nextText: "Due Date: 2025-10-14\nAmended: payment is now due 2025-11-13.",
    });
    expect(decision).toEqual({ carry: false, reason: "value_changed" });
  });

  it("carries a correction when the new value matches the corrected value", () => {
    const decision = decideCarryOver({
      fieldType: "string",
      prior: {
        value: "Meridian Office",
        evidence: "MERIDIAN OFFICE SUPPLIES LLC",
        review: { action: "correct", correctedValue: "Meridian Office Supplies LLC" },
      },
      next: { value: "MERIDIAN OFFICE SUPPLIES LLC" },
      priorText: "MERIDIAN OFFICE SUPPLIES LLC",
      nextText: "MERIDIAN OFFICE SUPPLIES LLC",
    });
    expect(decision).toEqual({ carry: true });
  });

  it("carries a reviewed gap only if the whole text is unchanged", () => {
    const prior = { value: null, evidence: null, review: approved };
    const text = "Market Area: Eastport-Harborview Submarket";
    expect(
      decideCarryOver({ fieldType: "money", prior, next: { value: null }, priorText: text, nextText: `${text}\n` }),
    ).toEqual({ carry: true });
    expect(
      decideCarryOver({ fieldType: "money", prior, next: { value: null }, priorText: text, nextText: `${text} Q4` }),
    ).toEqual({ carry: false, reason: "gap_changed" });
  });
});
