import type { DocumentType, LlmField } from "@app/core";

export interface ExtractionRequest {
  type: DocumentType;
  text: string;
  signal: AbortSignal;
}

/** What one extraction attempt produced. Failures are values, not exceptions. */
export type ExtractionResult =
  | { ok: true; output: Record<string, LlmField>; rawResponse: string; usage?: unknown }
  | { ok: false; error: string; rawResponse: string | null; usage?: unknown };

export interface Extractor {
  readonly model: string;
  /** The exact prompt sent for a request, stored with the run before calling the model. */
  prompt(type: DocumentType, text: string): string;
  extract(request: ExtractionRequest): Promise<ExtractionResult>;
}
