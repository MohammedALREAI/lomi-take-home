import { AnthropicExtractor } from "./anthropic-extractor.js";
import type { Extractor } from "./extractor.js";
import { GeminiExtractor } from "./gemini-extractor.js";
import { RulesExtractor } from "./rules-extractor.js";

export const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview";
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

const cleanEnv = (v: string | undefined) => v?.trim().replace(/^["']|["']$/g, "").trim();

export function chooseExtractor(env: NodeJS.ProcessEnv = process.env): Extractor | null {
  if (env.EXTRACTOR === "rules") {
    console.warn("[worker] EXTRACTOR=rules: TEST-ONLY regex extraction, no model is called.");
    return new RulesExtractor();
  }

  const provider = cleanEnv(env.LLM_PROVIDER)?.toLowerCase();
  const geminiKey = cleanEnv(env.GEMINI_API_KEY);
  const anthropicKey = cleanEnv(env.ANTHROPIC_API_KEY);
  const llmModel = cleanEnv(env.LLM_MODEL);

  if (provider === "anthropic") {
    if (!anthropicKey) {
      console.warn("[worker] LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.");
      return null;
    }
    const model = llmModel && !llmModel.startsWith("gemini-") ? llmModel : DEFAULT_ANTHROPIC_MODEL;
    return new AnthropicExtractor(anthropicKey, model);
  }

  if (provider === "gemini" || geminiKey) {
    if (!geminiKey) {
      console.warn("[worker] LLM_PROVIDER=gemini but GEMINI_API_KEY is not set.");
      return null;
    }
    const geminiModel =
      cleanEnv(env.GEMINI_MODEL) ||
      (llmModel && llmModel.startsWith("gemini-") ? llmModel : DEFAULT_GEMINI_MODEL);
    return new GeminiExtractor(geminiKey, geminiModel, {
      fallbackModel: cleanEnv(env.GEMINI_FALLBACK_MODEL) || undefined,
    });
  }

  if (anthropicKey) {
    const model = llmModel || DEFAULT_ANTHROPIC_MODEL;
    return new AnthropicExtractor(anthropicKey, model);
  }

  console.warn(
    "[worker] Neither GEMINI_API_KEY nor ANTHROPIC_API_KEY is set; extractions will fail until one is configured.",
  );
  return null;
}
