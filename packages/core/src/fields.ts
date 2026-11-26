// Mirrors fixtures/expected-fields.json. Kept as code so the type system knows
// every field; fields.test.ts fails if the two drift apart.

export const DOCUMENT_TYPES = ["invoice", "lease", "market_report"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const FIELD_TYPES = ["string", "date", "money", "number", "percent"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldDefinition {
  field: string;
  type: FieldType;
}

export const FIELD_DEFINITIONS = {
  invoice: [
    { field: "invoice_number", type: "string" },
    { field: "issue_date", type: "date" },
    { field: "due_date", type: "date" },
    { field: "vendor_name", type: "string" },
    { field: "total_amount", type: "money" },
  ],
  lease: [
    { field: "tenant_name", type: "string" },
    { field: "monthly_rent", type: "money" },
    { field: "security_deposit", type: "money" },
    { field: "lease_start", type: "date" },
    { field: "term_months", type: "number" },
  ],
  market_report: [
    { field: "report_quarter", type: "string" },
    { field: "market_area", type: "string" },
    { field: "vacancy_rate", type: "percent" },
    { field: "average_rent_1br", type: "money" },
    { field: "year_over_year_rent_growth", type: "percent" },
    { field: "median_household_income", type: "money" },
  ],
} as const satisfies Record<DocumentType, readonly FieldDefinition[]>;

export function isDocumentType(value: string): value is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value);
}
