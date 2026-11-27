import {
  FIELD_DEFINITIONS,
  parseLlmOutput,
  type DocumentType,
} from "@app/core";
import type {
  ExtractionRequest,
  ExtractionResult,
  Extractor,
} from "./extractor.js";
import { SYSTEM_PROMPT, userPrompt } from "./prompt.js";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_FALLBACK_MODELS = ["gemini-3.1-flash-lite"];

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: unknown;
  error?: { code?: number; message?: string; status?: string };
}

/** OpenAPI-subset response schema accepted natively across Gemini 2.0 / 2.5 / 3.x models. */
export function geminiResponseSchema(type: DocumentType) {
  const nullableString = { type: "STRING", nullable: true };
  const fieldSchema = {
    type: "OBJECT",
    properties: {
      value: nullableString,
      evidence: nullableString,
      missing_reason: nullableString,
    },
    required: ["value", "evidence", "missing_reason"],
  };
  const fields = FIELD_DEFINITIONS[type].map((f) => f.field);
  return {
    type: "OBJECT",
    properties: Object.fromEntries(fields.map((f) => [f, fieldSchema])),
    required: fields,
  };
}

/** Exponential backoff with equal jitter ([0.5x, 1.0x]), honoring Retry-After seconds when present. */
export function retryDelayMs(
  attempt: number,
  retryAfterHeader: string | null,
  opts: { baseMs: number; maxMs: number },
  rand: () => number = Math.random,
): number {
  if (retryAfterHeader !== null) {
    const secs = Number(retryAfterHeader.trim());
    if (Number.isFinite(secs) && secs > 0) {
      return Math.min(opts.maxMs, Math.round(secs * 1_000));
    }
  }
  const exp = Math.min(opts.maxMs, opts.baseMs * Math.pow(2, attempt));
  return Math.round(exp * (0.5 + 0.5 * rand()));
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted)
    return Promise.reject(signal.reason ?? new Error("Aborted"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Aborted"));
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isRetryableStatus(status: number): boolean {
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

export interface GeminiExtractorOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  retryBudgetMs?: number;
  fallbackModel?: string;
  fallbackModels?: string[];
}

/** Low-latency Gemini structured extraction (`thinkingBudget: 0`, `maxOutputTokens: 2048`, retry + failover). */
export class GeminiExtractor implements Extractor {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private readonly retryBudgetMs: number;
  private readonly instantFailover: boolean;
  private readonly fallbackModels: string[];

  constructor(
    private readonly apiKey: string,
    readonly model: string = "gemini-3-flash-preview",
    opts?: GeminiExtractorOptions,
  ) {
    this.fetchImpl = opts?.fetch ?? globalThis.fetch;
    this.timeoutMs = opts?.timeoutMs ?? 25_000;
    this.maxRetries = opts?.maxRetries ?? 4;
    this.retryBaseMs = opts?.retryBaseMs ?? 600;
    this.retryMaxMs = opts?.retryMaxMs ?? 10_000;
    this.retryBudgetMs = opts?.retryBudgetMs ?? 90_000;
    this.instantFailover =
      opts?.fallbackModels !== undefined && opts?.maxRetries === undefined;

    const baseFallbacks =
      opts?.fallbackModels ?? (opts?.fetch ? [] : DEFAULT_FALLBACK_MODELS);
    this.fallbackModels = opts?.fallbackModel
      ? [opts.fallbackModel, ...baseFallbacks]
      : baseFallbacks;
  }

  prompt(type: DocumentType, text: string): string {
    return JSON.stringify(
      { system: SYSTEM_PROMPT, user: userPrompt(type, text) },
      null,
      2,
    );
  }

  private buildBody(
    type: DocumentType,
    text: string,
    disableThinking: boolean,
  ): string {
    return JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userPrompt(type, text) }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 2_048,
        responseMimeType: "application/json",
        responseSchema: geminiResponseSchema(type),
        ...(disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    });
  }

  async extract({
    type,
    text,
    signal,
  }: ExtractionRequest): Promise<ExtractionResult> {
    const candidates = [...new Set([this.model, ...this.fallbackModels])];
    const deadlineAt = Date.now() + this.retryBudgetMs;
    let totalAttempts = 0;
    let sawOverload = false;
    let lastOverloadDetail = "high demand";
    let lastFailure: ExtractionResult = {
      ok: false,
      error: "Gemini request produced no response.",
      rawResponse: null,
    };

    for (let mIdx = 0; mIdx < candidates.length; mIdx++) {
      const candidateModel = candidates[mIdx]!;
      const hasNextModel = mIdx < candidates.length - 1;
      const retriesForModel =
        mIdx === 0
          ? this.instantFailover && hasNextModel
            ? 0
            : this.maxRetries
          : 1;
      const url = `${GEMINI_API_BASE}/${encodeURIComponent(candidateModel)}:generateContent`;
      let disableThinking = true;

      for (let attempt = 0; attempt <= retriesForModel; attempt++) {
        const remainingBudget = deadlineAt - Date.now();
        if (totalAttempts > 0 && remainingBudget <= 0) break;

        totalAttempts++;
        const perCallMs = Math.min(
          this.timeoutMs,
          Math.max(50, remainingBudget),
        );
        const callSignal = AbortSignal.any([
          signal,
          AbortSignal.timeout(perCallMs),
        ]);
        let res: Response;
        let rawText: string;

        try {
          res = await this.fetchImpl(url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-goog-api-key": this.apiKey,
            },
            body: this.buildBody(type, text, disableThinking),
            signal: callSignal,
          });
          rawText = await res.text();
        } catch (err) {
          if (signal.aborted) throw err;
          const msg = err instanceof Error ? err.message : String(err);
          sawOverload = true;
          lastOverloadDetail = msg;
          lastFailure = {
            ok: false,
            error: `Gemini request failed: ${msg}`,
            rawResponse: null,
          };

          if (Date.now() >= deadlineAt) break;
          if (attempt < retriesForModel) {
            const delay = Math.min(
              retryDelayMs(attempt, null, {
                baseMs: this.retryBaseMs,
                maxMs: this.retryMaxMs,
              }),
              Math.max(0, deadlineAt - Date.now()),
            );
            if (delay > 0) await abortableSleep(delay, signal);
            continue;
          }
          break; // Move to fallback model if available
        }

        let payload: GeminiResponse | null;
        try {
          payload = JSON.parse(rawText) as GeminiResponse;
        } catch {
          payload = null;
        }

        if (!res.ok) {
          const apiMessage =
            payload?.error?.message ??
            (rawText.slice(0, 300) || res.statusText);
          if (
            res.status === 400 &&
            disableThinking &&
            /thinking/i.test(apiMessage)
          ) {
            disableThinking = false;
            totalAttempts--;
            attempt--;
            continue;
          }

          if (isRetryableStatus(res.status)) {
            sawOverload = true;
            lastOverloadDetail = apiMessage;
            lastFailure = {
              ok: false,
              error: `Gemini API error ${res.status}: ${apiMessage}`,
              rawResponse: rawText || null,
            };

            if (Date.now() >= deadlineAt) break;
            if (attempt < retriesForModel) {
              const retryAfter = res.headers.get("retry-after");
              const delay = Math.min(
                retryDelayMs(attempt, retryAfter, {
                  baseMs: this.retryBaseMs,
                  maxMs: this.retryMaxMs,
                }),
                Math.max(0, deadlineAt - Date.now()),
              );
              if (delay > 0) await abortableSleep(delay, signal);
              continue;
            }
            break; // Move to fallback model if available
          }

          // 404 on a deprecated/unavailable model can fall over to the next candidate model
          if (res.status === 404 && hasNextModel) {
            lastFailure = {
              ok: false,
              error: `Gemini API error ${res.status}: ${apiMessage}`,
              rawResponse: rawText || null,
            };
            break;
          }

          return {
            ok: false,
            error: `Gemini API error ${res.status}: ${apiMessage}`,
            rawResponse: rawText || null,
          };
        }

        if (!payload) {
          return {
            ok: false,
            error: "Gemini returned a non-JSON HTTP payload.",
            rawResponse: rawText,
          };
        }

        const usage =
          candidateModel === this.model
            ? payload.usageMetadata
            : {
                ...((payload.usageMetadata as
                  | Record<string, unknown>
                  | undefined) ?? {}),
                model: candidateModel,
              };

        const failed = (error: string): ExtractionResult => ({
          ok: false,
          error,
          rawResponse: rawText,
          usage,
        });

        if (payload.promptFeedback?.blockReason) {
          return failed(
            `The model blocked the prompt (${payload.promptFeedback.blockReason}).`,
          );
        }

        const candidate = payload.candidates?.[0];
        if (!candidate) return failed("The model returned no candidates.");

        const finish = candidate.finishReason;
        if (finish === "MAX_TOKENS") {
          return failed("The model's answer was cut off (max_tokens).");
        }
        if (
          finish === "SAFETY" ||
          finish === "RECITATION" ||
          finish === "BLOCKLIST" ||
          finish === "PROHIBITED_CONTENT"
        ) {
          return failed(
            `The model declined to process this document (${finish}).`,
          );
        }

        const answerText = (candidate.content?.parts ?? [])
          .filter((part) => typeof part.text === "string" && !part.thought)
          .map((part) => part.text!)
          .join("")
          .trim();

        if (!answerText) return failed("The model returned no text.");

        let json: unknown;
        try {
          json = JSON.parse(answerText);
        } catch {
          return failed("The model's answer was not valid JSON.");
        }

        const parsed = parseLlmOutput(type, json);
        if (!parsed.ok)
          return failed(
            `The model's answer did not match the schema: ${parsed.error}`,
          );
        return { ok: true, output: parsed.output, rawResponse: rawText, usage };
      }

      if (Date.now() >= deadlineAt) break;
    }

    if (sawOverload) {
      return {
        ...lastFailure,
        ok: false,
        error: `Gemini is temporarily overloaded (${lastOverloadDetail}) after ${totalAttempts} attempts. Click Retry in a moment.`,
      };
    }

    return lastFailure;
  }
}
