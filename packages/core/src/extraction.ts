import { z } from "zod";
import { FIELD_DEFINITIONS, type DocumentType } from "./fields.js";
import { findEvidence } from "./text.js";
import { canonicalize } from "./values.js";

// The shape the LLM must return: one entry per expected field.

export const llmFieldSchema = z.object({
  value: z.string().nullable(),
  evidence: z.string().nullable(),
  missing_reason: z.string().nullable(),
});
export type LlmField = z.infer<typeof llmFieldSchema>;

export function llmOutputSchema(type: DocumentType) {
  const shape = Object.fromEntries(FIELD_DEFINITIONS[type].map((f) => [f.field, llmFieldSchema]));
  return z.object(shape).strict();
}

/** Parses and checks the model's JSON answer. */
export function parseLlmOutput(
  type: DocumentType,
  json: unknown,
): { ok: true; output: Record<string, LlmField> } | { ok: false; error: string } {
  const parsed = llmOutputSchema(type).safeParse(json);
  return parsed.success ? { ok: true, output: parsed.data } : { ok: false, error: z.prettifyError(parsed.error) };
}

/** JSON Schema for the provider's structured-output mode (all keys required, no extras). */
export function llmOutputJsonSchema(type: DocumentType): Record<string, unknown> {
  const fieldSchema = {
    type: "object",
    properties: {
      value: { type: ["string", "null"] },
      evidence: { type: ["string", "null"] },
      missing_reason: { type: ["string", "null"] },
    },
    required: ["value", "evidence", "missing_reason"],
    additionalProperties: false,
  };
  const fields = FIELD_DEFINITIONS[type].map((f) => f.field);
  return {
    type: "object",
    properties: Object.fromEntries(fields.map((f) => [f, fieldSchema])),
    required: fields,
    additionalProperties: false,
  };
}

export interface ValidatedValue {
  field: string;
  /** Canonical value, or null for a gap. */
  value: string | null;
  /** Exact slice of the parsed text, or null for a gap. */
  evidence: string | null;
  evidenceStart: number | null;
  evidenceEnd: number | null;
  gapReason: string | null;
}

function gap(field: string, reason: string): ValidatedValue {
  return { field, value: null, evidence: null, evidenceStart: null, evidenceEnd: null, gapReason: reason };
}

/**
 * Turns the LLM's answer into stored values. A value is kept only if its
 * evidence occurs verbatim in this version's parsed text and the value reads
 * as the field's type; everything else becomes a gap with a reason.
 */
export function validateExtraction(
  type: DocumentType,
  parsedText: string,
  output: Record<string, LlmField | undefined>,
): ValidatedValue[] {
  return FIELD_DEFINITIONS[type].map(({ field, type: fieldType }) => {
    const answer = output[field];
    if (!answer) return gap(field, "The model returned nothing for this field.");
    const rawValue = answer.value?.trim() ?? "";
    const quote = answer.evidence?.trim() ?? "";
    if (rawValue === "") {
      return gap(field, answer.missing_reason?.trim() || "The model did not find this field.");
    }
    if (quote === "") return gap(field, `The model gave "${rawValue}" without quoting any evidence.`);

    const match = findEvidence(parsedText, quote);
    if (!match) {
      return gap(field, `The quoted evidence does not appear in the document: "${quote}"`);
    }
    const value = canonicalize(fieldType, rawValue);
    if (value === null) return gap(field, `"${rawValue}" is not a valid ${fieldType}.`);

    return {
      field,
      value,
      evidence: match.text,
      evidenceStart: match.start,
      evidenceEnd: match.end,
      gapReason: null,
    };
  });
}
