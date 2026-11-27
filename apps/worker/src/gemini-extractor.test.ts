import { describe, expect, it, vi } from "vitest";
import { chooseExtractor, DEFAULT_GEMINI_MODEL } from "./choose-extractor.js";
import { GeminiExtractor, retryDelayMs } from "./gemini-extractor.js";

const validInvoicePayload = {
  invoice_number: { value: "INV-2025-0847", evidence: "Invoice Number: INV-2025-0847", missing_reason: null },
  issue_date: { value: "2025-09-14", evidence: "Issue Date: 2025-09-14", missing_reason: null },
  due_date: { value: "2025-10-14", evidence: "Due Date: 2025-10-14", missing_reason: null },
  vendor_name: { value: "MERIDIAN OFFICE SUPPLIES LLC", evidence: "MERIDIAN OFFICE SUPPLIES LLC", missing_reason: null },
  total_amount: { value: "5230.29", evidence: "Total Due: $5,230.29", missing_reason: null },
};

describe("GeminiExtractor", () => {
  it("extracts structured JSON and ignores thinking parts", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  { text: "Internal reasoning...", thought: true },
                  { text: JSON.stringify(validInvoicePayload) },
                ],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 85 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const extractor = new GeminiExtractor("test-gemini-key", "gemini-3-flash-preview", { fetch: mockFetch });
    const res = await extractor.extract({
      type: "invoice",
      text: "Invoice Number: INV-2025-0847",
      signal: new AbortController().signal,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.output.invoice_number?.value).toBe("INV-2025-0847");
      expect(res.usage).toEqual({ promptTokenCount: 120, candidatesTokenCount: 85 });
    }

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = mockFetch.mock.calls[0]!;
    expect(String(calledUrl)).toContain("gemini-3-flash-preview:generateContent");
    expect(String(calledInit?.body)).toContain('"thinkingBudget":0');
    expect(String(calledUrl)).not.toContain("test-gemini-key");
    expect((calledInit?.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-gemini-key");
  });

  it("retries transient 503 responses and succeeds", async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Model overloaded" } }), { status: 503 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(validInvoicePayload) }] } }],
          }),
          { status: 200 },
        ),
      );

    const extractor = new GeminiExtractor("key", "gemini-2.5-flash", { fetch: mockFetch, maxRetries: 1, retryBaseMs: 1 });
    const res = await extractor.extract({
      type: "invoice",
      text: "Invoice Number: INV-2025-0847",
      signal: new AbortController().signal,
    });

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("instantly fails over to a fallback model on 503 or 429", async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "High demand" } }), { status: 503 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(validInvoicePayload) }] } }],
          }),
          { status: 200 },
        ),
      );

    const extractor = new GeminiExtractor("key", "gemini-3.8-flash", {
      fetch: mockFetch,
      fallbackModels: ["gemini-3-flash-preview"],
    });
    const res = await extractor.extract({
      type: "invoice",
      text: "Invoice Number: INV-2025-0847",
      signal: new AbortController().signal,
    });

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(String(mockFetch.mock.calls[0]![0])).toContain("gemini-3.8-flash");
    expect(String(mockFetch.mock.calls[1]![0])).toContain("gemini-3-flash-preview");
  });

  it("keeps retrying through a longer overload spike", async () => {
    const overloaded = () =>
      new Response(JSON.stringify({ error: { message: "This model is currently experiencing high demand." } }), {
        status: 503,
      });
    const ok = new Response(
      JSON.stringify({
        candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(validInvoicePayload) }] } }],
      }),
      { status: 200 },
    );
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(overloaded())
      .mockResolvedValueOnce(overloaded())
      .mockResolvedValueOnce(overloaded())
      .mockResolvedValueOnce(overloaded())
      .mockResolvedValueOnce(ok);

    // Default retry count (5), with tiny delays for the test.
    const extractor = new GeminiExtractor("key", "gemini-3.8-flash", { fetch: mockFetch, retryBaseMs: 1 });
    const res = await extractor.extract({ type: "invoice", text: "x", signal: new AbortController().signal });
    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it("falls back to another model when the primary stays overloaded", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockImplementation(async (url) =>
      String(url).includes("primary-model")
        ? new Response(JSON.stringify({ error: { message: "high demand" } }), { status: 503 })
        : new Response(
            JSON.stringify({
              candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(validInvoicePayload) }] } }],
            }),
            { status: 200 },
          ),
    );
    const extractor = new GeminiExtractor("key", "primary-model", {
      fetch: mockFetch,
      maxRetries: 2,
      retryBaseMs: 1,
      fallbackModel: "backup-model",
    });
    const res = await extractor.extract({ type: "invoice", text: "x", signal: new AbortController().signal });
    expect(res).toMatchObject({ ok: true, usage: { model: "backup-model" } });
    expect(mockFetch.mock.calls.map(([u]) => String(u).includes("backup-model"))).toEqual([false, false, false, true]);
  });

  it("falls back when the primary keeps failing at the network level or hanging", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).includes("primary-model")) throw new TypeError("fetch failed");
      return new Response(
        JSON.stringify({
          candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(validInvoicePayload) }] } }],
        }),
        { status: 200 },
      );
    });
    const extractor = new GeminiExtractor("key", "primary-model", {
      fetch: mockFetch,
      maxRetries: 2,
      retryBaseMs: 1,
      fallbackModel: "backup-model",
    });
    const res = await extractor.extract({ type: "invoice", text: "x", signal: new AbortController().signal });
    expect(res).toMatchObject({ ok: true, usage: { model: "backup-model" } });
  });

  it("explains a persistent overload as temporary and retryable", async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(JSON.stringify({ error: { message: "high demand." } }), { status: 503 }));
    const extractor = new GeminiExtractor("key", "gemini-3.8-flash", { fetch: mockFetch, maxRetries: 2, retryBaseMs: 1 });
    const res = await extractor.extract({ type: "invoice", text: "x", signal: new AbortController().signal });
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/temporarily overloaded.*after 3 attempts.*Retry/) });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("stops retrying when its time budget runs out, even with retries left", async () => {
    // Overloaded Gemini holds each request for a while before answering 503.
    const mockFetch = vi.fn<typeof fetch>().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 60));
      return new Response(JSON.stringify({ error: { message: "high demand." } }), { status: 503 });
    });
    const extractor = new GeminiExtractor("key", "gemini-3.8-flash", {
      fetch: mockFetch,
      maxRetries: 20,
      retryBaseMs: 1,
      retryBudgetMs: 200,
    });
    const started = Date.now();
    const res = await extractor.extract({ type: "invoice", text: "x", signal: new AbortController().signal });
    expect(Date.now() - started).toBeLessThan(600);
    expect(mockFetch.mock.calls.length).toBeLessThan(6);
    expect(res).toMatchObject({ ok: false, error: expect.stringContaining("temporarily overloaded") });
  });

  it("does not retry an error that will not go away", async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(JSON.stringify({ error: { message: "API key not valid." } }), { status: 400 }));
    await new GeminiExtractor("key", "m", { fetch: mockFetch, retryBaseMs: 1 }).extract({
      type: "invoice",
      text: "x",
      signal: new AbortController().signal,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("retryDelayMs", () => {
  const opts = { baseMs: 2_000, maxMs: 30_000 };

  it("backs off exponentially with jitter, capped", () => {
    expect(retryDelayMs(0, null, opts, () => 0)).toBe(1_000);
    expect(retryDelayMs(0, null, opts, () => 1)).toBe(2_000);
    expect(retryDelayMs(3, null, opts, () => 1)).toBe(16_000);
    expect(retryDelayMs(10, null, opts, () => 1)).toBe(30_000);
  });

  it("honors Retry-After, within the cap", () => {
    expect(retryDelayMs(0, "7", opts)).toBe(7_000);
    expect(retryDelayMs(0, "120", opts)).toBe(30_000);
    expect(retryDelayMs(0, "soon", opts, () => 1)).toBe(2_000);
  });

  it("returns a clean failure value on API errors or safety blocks", async () => {
    const errorFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "API key not valid." } }), { status: 400 }),
    );
    const extractor = new GeminiExtractor("bad-key", "gemini-2.5-flash", { fetch: errorFetch, maxRetries: 0 });
    const res = await extractor.extract({
      type: "invoice",
      text: "text",
      signal: new AbortController().signal,
    });
    expect(res).toMatchObject({
      ok: false,
      error: "Gemini API error 400: API key not valid.",
    });

    const safetyFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ finishReason: "SAFETY" }] }), { status: 200 }),
    );
    const safetyRes = await new GeminiExtractor("key", "gemini-2.5-flash", { fetch: safetyFetch }).extract({
      type: "invoice",
      text: "text",
      signal: new AbortController().signal,
    });
    expect(safetyRes).toMatchObject({
      ok: false,
      error: expect.stringContaining("SAFETY"),
    });
  });
});

describe("chooseExtractor", () => {
  it("uses Gemini with the default model when only the key is set", () => {
    const ext = chooseExtractor({ GEMINI_API_KEY: "gem-key" });
    expect(ext).toBeInstanceOf(GeminiExtractor);
    expect(ext?.model).toBe(DEFAULT_GEMINI_MODEL);
  });

  it("takes the model from GEMINI_MODEL, ignoring quotes around values", () => {
    const ext = chooseExtractor({ GEMINI_API_KEY: '"gem-key"', GEMINI_MODEL: '"gemini-3.1-flash-lite"' });
    expect(ext?.model).toBe("gemini-3.1-flash-lite");
  });

  it("uses the test-only rule extractor when EXTRACTOR=rules, even without a key", () => {
    expect(chooseExtractor({ EXTRACTOR: "rules" })?.model).toBe("rules (test only)");
  });

  it("returns null when no API key is configured", () => {
    expect(chooseExtractor({})).toBeNull();
  });
});
