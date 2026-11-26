import Anthropic from "@anthropic-ai/sdk";
import { llmOutputJsonSchema, parseLlmOutput, type DocumentType } from "@app/core";
import type { ExtractionRequest, ExtractionResult, Extractor } from "./extractor.js";
import { SYSTEM_PROMPT, userPrompt } from "./prompt.js";

/** Extraction with Claude's structured output, constrained to the field schema. */
export class AnthropicExtractor implements Extractor {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    // The SDK retries transient errors (429, 5xx, network) itself.
    this.client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 2 });
  }

  prompt(type: DocumentType, text: string): string {
    return JSON.stringify({ system: SYSTEM_PROMPT, user: userPrompt(type, text) }, null, 2);
  }

  async extract({ type, text, signal }: ExtractionRequest): Promise<ExtractionResult> {
    let message: Anthropic.Message;
    try {
      message = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 16_000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt(type, text) }],
          output_config: {
            effort: "medium",
            format: { type: "json_schema", schema: llmOutputJsonSchema(type) },
          },
        },
        { signal },
      );
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        // Prefer the API's own message over the SDK's "400 {json}" summary.
        const body = err.error as { error?: { message?: string } } | undefined;
        const message = body?.error?.message ?? err.message;
        const status = err.status ? ` ${err.status}` : "";
        return { ok: false, error: `Anthropic API error${status}: ${message}`, rawResponse: null };
      }
      throw err;
    }

    // Keep the full response, whatever happens next, for debugging.
    const rawResponse = JSON.stringify(message);
    const failed = (error: string): ExtractionResult => ({ ok: false, error, rawResponse, usage: message.usage });

    if (message.stop_reason === "refusal") return failed("The model declined to process this document.");
    if (message.stop_reason === "max_tokens") return failed("The model's answer was cut off (max_tokens).");

    const answer = message.content.filter((b) => b.type === "text").at(-1);
    if (!answer) return failed("The model returned no text.");
    let json: unknown;
    try {
      json = JSON.parse(answer.text);
    } catch {
      return failed("The model's answer was not valid JSON.");
    }
    const parsed = parseLlmOutput(type, json);
    if (!parsed.ok) return failed(`The model's answer did not match the schema: ${parsed.error}`);
    return { ok: true, output: parsed.output, rawResponse, usage: message.usage };
  }
}
