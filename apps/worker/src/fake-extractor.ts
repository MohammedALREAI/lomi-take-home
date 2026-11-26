import { FIELD_DEFINITIONS, type DocumentType, type LlmField } from "@app/core";
import type { ExtractionRequest, ExtractionResult, Extractor } from "./extractor.js";

/**
 * For tests only: returns canned answers instead of calling a model, so the
 * pipeline can be exercised deterministically without an API key.
 */
export class FakeExtractor implements Extractor {
  readonly model = "fake";
  calls = 0;

  constructor(
    private readonly answer: (type: DocumentType, text: string) => Record<string, LlmField> | Error = (type) =>
      Object.fromEntries(
        FIELD_DEFINITIONS[type].map((f) => [f.field, { value: null, evidence: null, missing_reason: "fake" }]),
      ),
    private readonly delayMs = 0,
  ) {}

  prompt(type: DocumentType, text: string): string {
    return `fake prompt for ${type}: ${text.length} chars`;
  }

  async extract({ type, text, signal }: ExtractionRequest): Promise<ExtractionResult> {
    this.calls++;
    // Like the real SDK, refuse a request whose signal is already aborted.
    signal.throwIfAborted();
    if (this.delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.delayMs);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(signal.reason);
        });
      });
    }
    const result = this.answer(type, text);
    if (result instanceof Error) return { ok: false, error: result.message, rawResponse: null };
    return { ok: true, output: result, rawResponse: JSON.stringify(result) };
  }
}
