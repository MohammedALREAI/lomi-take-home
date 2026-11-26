import { FIELD_DEFINITIONS, type DocumentType, type LlmField } from "@app/core";
import type { ExtractionRequest, ExtractionResult, Extractor } from "./extractor.js";

// TEST ONLY (EXTRACTOR=rules): reads the fixture documents' fields with
// regular expressions instead of calling a model, so end-to-end tests and CI
// can run the whole pipeline without an API key. Its "evidence" is the exact
// regex match in the parsed text, so it goes through the same verbatim check
// as a model's answer. It knows only the fixture layouts.

type Rule = { pattern: RegExp; value?: (m: RegExpMatchArray) => string };

const RULES: Record<DocumentType, Record<string, Rule>> = {
  invoice: {
    invoice_number: { pattern: /Invoice Number:\s*(\S+)/ },
    issue_date: { pattern: /Issue Date:\s*(\d{4}-\d{2}-\d{2})/ },
    due_date: { pattern: /Due Date:\s*(\d{4}-\d{2}-\d{2})/ },
    vendor_name: { pattern: /^([A-Z][A-Z ]+LLC)$/m },
    total_amount: { pattern: /Total Due:\s*\$([\d,.]+)/ },
  },
  lease: {
    tenant_name: { pattern: /and\s+([A-Z][a-z]+\s+[A-Z][a-z]+)\s+\("Tenant"\)/ },
    monthly_rent: { pattern: /monthly\s+rent\s+of\s+\$([\d,.]+\d)/ },
    security_deposit: { pattern: /the\s+sum\s+of\s+\$([\d,.]+\d)/ },
    lease_start: { pattern: /commencing\s+on\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/ },
    term_months: { pattern: /\((\d+)\)\s+months/ },
  },
  market_report: {
    report_quarter: { pattern: /Reporting Period:\s*(Q\d \d{4})/ },
    market_area: { pattern: /Market Area:\s*(.+)/ },
    vacancy_rate: { pattern: /vacancy\s+rate\s+declined\s+to\s+([\d.]+)%/ },
    average_rent_1br: { pattern: /one-bedroom\s+unit\s+reached\s+\$([\d,]+)/ },
    year_over_year_rent_growth: { pattern: /year-over-year\s+increase\s+of\s+([\d.]+)%/ },
    median_household_income: { pattern: /median\s+household\s+income\s+of\s+\$([\d,]+)/i },
  },
};

export class RulesExtractor implements Extractor {
  readonly model = "rules (test only)";

  prompt(type: DocumentType): string {
    return `Rule-based test extraction for ${type}; no model is called.`;
  }

  async extract({ type, text, signal }: ExtractionRequest): Promise<ExtractionResult> {
    signal.throwIfAborted();
    const output: Record<string, LlmField> = {};
    for (const { field } of FIELD_DEFINITIONS[type]) {
      const rule = RULES[type][field];
      const match = rule ? text.match(rule.pattern) : null;
      output[field] = match
        ? { value: rule!.value?.(match) ?? match[1]!.trim(), evidence: match[0].trim(), missing_reason: null }
        : { value: null, evidence: null, missing_reason: "Not stated in the document." };
    }
    return { ok: true, output, rawResponse: JSON.stringify(output) };
  }
}
