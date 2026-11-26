import type { ValidatedValue } from "@app/core";

export { resetDb, testDb } from "../src/testing.js";

export const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

export const INVOICE_V1_TEXT = `MERIDIAN OFFICE SUPPLIES LLC
Invoice Number: INV-2025-0847
Issue Date: 2025-09-14
Due Date: 2025-10-14
                                    Total Due:  $5,230.29`;

export const INVOICE_V2_TEXT = `MERIDIAN OFFICE SUPPLIES LLC
Invoice Number: INV-2025-0847
Issue Date: 2025-09-14
Due Date: 2025-11-13
                                    Total Due:  $6,126.45
This revised invoice supersedes the version issued on 2025-09-14.`;

function value(text: string, field: string, canonical: string, evidence: string): ValidatedValue {
  const start = text.indexOf(evidence);
  if (start < 0) throw new Error(`test evidence not in text: ${evidence}`);
  return { field, value: canonical, evidence, evidenceStart: start, evidenceEnd: start + evidence.length, gapReason: null };
}

export function invoiceValues(text: string, due: string, total: string): ValidatedValue[] {
  return [
    value(text, "invoice_number", "INV-2025-0847", "Invoice Number: INV-2025-0847"),
    value(text, "issue_date", "2025-09-14", "Issue Date: 2025-09-14"),
    value(text, "due_date", due, `Due Date: ${due}`),
    value(text, "vendor_name", "MERIDIAN OFFICE SUPPLIES LLC", "MERIDIAN OFFICE SUPPLIES LLC"),
    value(text, "total_amount", total, `Total Due:  $${Number(total).toLocaleString("en-US", { minimumFractionDigits: 2 })}`),
  ];
}
