import { validateExtraction } from "@app/core";
import {
  claimVersion,
  commitExtraction,
  failVersion,
  finishRun,
  heartbeat,
  loadVersionForExtraction,
  saveParsedText,
  startRun,
  type Db,
  type Lease,
} from "@app/db";
import type { ExtractionResult, Extractor } from "./extractor.js";
import { parsePdf } from "./parse.js";

export interface WorkerDeps {
  db: Db;
  /** null when no model is configured; versions then fail with a clear reason. */
  extractor: Extractor | null;
  heartbeatMs?: number;
  /** Hard limit for one attempt, on top of the SDK's own request timeout. */
  deadlineMs?: number;
}

export type Outcome = "extracted" | "failed" | "lost_lease" | "skipped";

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

/**
 * Extracts one version end to end. Never throws for an expected failure: a
 * parse error, a model error or a timeout is recorded on the version as
 * `failed` with a reason. If the lease is lost (this worker was presumed dead
 * and another took over), it stops without writing anything.
 */
export async function processVersion(
  deps: WorkerDeps,
  versionId: string,
): Promise<Outcome> {
  const { db, heartbeatMs = 10_000, deadlineMs = 180_000 } = deps;
  const lease = await claimVersion(db, versionId);
  if (!lease) return "skipped";

  const controller = new AbortController();
  let leaseLost = false;
  const beat = setInterval(() => {
    heartbeat(db, lease).then(
      (held) => {
        if (!held && !leaseLost) {
          leaseLost = true;
          controller.abort(new Error("The lease was lost."));
        }
      },
      (err) =>
        console.warn(
          `[worker] heartbeat failed for ${versionId}: ${errorMessage(err)}`,
        ),
    );
  }, heartbeatMs);
  const deadline = setTimeout(
    () =>
      controller.abort(
        new Error(
          `Extraction timed out after ${Math.round(deadlineMs / 1000)} seconds.`,
        ),
      ),
    deadlineMs,
  );

  try {
    return await extractLeased(deps, lease, controller.signal, () => leaseLost);
  } finally {
    clearInterval(beat);
    clearTimeout(deadline);
  }
}

async function extractLeased(
  { db, extractor }: WorkerDeps,
  lease: Lease,
  signal: AbortSignal,
  leaseLost: () => boolean,
): Promise<Outcome> {
  const fail = async (reason: string): Promise<Outcome> =>
    (await failVersion(db, lease, reason)) ? "failed" : "lost_lease";

  const version = await loadVersionForExtraction(db, lease);
  if (!version) return "lost_lease";

  // Parsed text is stored before the model is called, so a retry reuses it and
  // evidence is always checked against this version's own text.
  let text = version.parsedText;
  if (text === null) {
    try {
      text = await parsePdf(version.pdf);
    } catch (err) {
      return fail(`Could not read the PDF: ${errorMessage(err)}`);
    }
    if (!(await saveParsedText(db, lease, text))) return "lost_lease";
  }
  if (text.trim() === "")
    return fail(
      "The PDF contains no extractable text (it may be a scanned image).",
    );

  if (!extractor) {
    return fail(
      "No extraction model is configured: GEMINI_API_KEY is not set. Set it in .env, restart, then retry.",
    );
  }

  const runId = await startRun(
    db,
    lease,
    extractor.model,
    extractor.prompt(version.type, text),
  );
  let result: ExtractionResult;
  try {
    result = await extractor.extract({ type: version.type, text, signal });
  } catch (err) {
    result = { ok: false, error: errorMessage(err), rawResponse: null };
  }
  if (signal.aborted && !result.ok)
    result = { ...result, error: errorMessage(signal.reason) };
  await finishRun(db, runId, {
    rawResponse: result.rawResponse,
    error: result.ok ? null : result.error,
    usage: result.usage,
  });

  if (leaseLost()) return "lost_lease";
  if (!result.ok) return fail(`Extraction failed: ${result.error}`);

  const values = validateExtraction(version.type, text, result.output);
  return (await commitExtraction(db, lease, values)) === "committed"
    ? "extracted"
    : "lost_lease";
}
