import type { Extractor } from "./extractor.js";
import { GeminiExtractor } from "./gemini-extractor.js";
import { RulesExtractor } from "./rules-extractor.js";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

const cleanEnv = (v: string | undefined) => v?.trim().replace(/^["']|["']$/g, "").trim();

/**
 * Gemini, configured by GEMINI_API_KEY, GEMINI_MODEL and GEMINI_FALLBACK_MODEL.
 * EXTRACTOR=rules swaps in the test-only regex extractor. Returns null when no
 * key is set; versions then fail with a clear reason instead of hanging.
 */
export function chooseExtractor(env: NodeJS.ProcessEnv = process.env): Extractor | null {
  if (env.EXTRACTOR === "rules") {
    console.warn("[worker] EXTRACTOR=rules: TEST-ONLY regex extraction, no model is called.");
    return new RulesExtractor();
  }

  const apiKey = cleanEnv(env.GEMINI_API_KEY);
  if (!apiKey) {
    console.warn("[worker] GEMINI_API_KEY is not set; extractions will fail until it is.");
    return null;
  }
  return new GeminiExtractor(apiKey, cleanEnv(env.GEMINI_MODEL) || DEFAULT_GEMINI_MODEL, {
    fallbackModel: cleanEnv(env.GEMINI_FALLBACK_MODEL) || undefined,
  });
}
