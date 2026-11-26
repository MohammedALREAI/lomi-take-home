import { createPrismaClient, reconcile } from "@app/db";
import {
  EXTRACTION_QUEUE,
  createExtractionQueue,
  createRedis,
  enqueueExtraction,
  type ExtractionJob,
} from "@app/queue";
import { Worker } from "bullmq";
import { AnthropicExtractor } from "./anthropic-extractor.js";
import type { Extractor } from "./extractor.js";
import { processVersion } from "./process.js";
import { RulesExtractor } from "./rules-extractor.js";

const RECONCILE_EVERY_MS = 10_000;

const db = createPrismaClient();

function chooseExtractor(): Extractor | null {
  if (process.env.EXTRACTOR === "rules") {
    console.warn("[worker] EXTRACTOR=rules: TEST-ONLY regex extraction, no model is called.");
    return new RulesExtractor();
  }
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[worker] ANTHROPIC_API_KEY is not set; extractions will fail until it is.");
    return null;
  }
  return new AnthropicExtractor(apiKey, process.env.LLM_MODEL?.trim() || "claude-opus-5-5");
}
const extractor = chooseExtractor();

const queue = createExtractionQueue();

/**
 * Rebuilds the queue from Postgres: expired leases go back to queued (or fail
 * after too many attempts) and every runnable version is enqueued. Runs at
 * startup, on a timer, and after each job, so a Redis flush or a killed worker
 * only delays work by a few seconds.
 */
async function reconcileOnce() {
  try {
    const result = await reconcile(db);
    for (const id of result.requeued) console.log(`[worker] lease expired, requeued ${id}`);
    for (const id of result.failed) console.log(`[worker] gave up on ${id} after repeated worker loss`);
    for (const id of result.runnable) await enqueueExtraction(queue, id);
  } catch (err) {
    console.warn(`[worker] reconcile failed: ${(err as Error).message}`);
  }
}

const worker = new Worker<ExtractionJob>(
  EXTRACTION_QUEUE,
  async (job) => {
    const outcome = await processVersion({ db, extractor }, job.data.versionId);
    console.log(`[worker] ${job.data.versionId}: ${outcome}`);
    // A finished version may unblock the next version of the same document.
    if (outcome !== "skipped") void reconcileOnce();
  },
  { connection: createRedis({ maxRetriesPerRequest: null }), concurrency: 2 },
);
worker.on("error", (err) => console.warn(`[worker] redis: ${err.message}`));
worker.on("failed", (job, err) => console.warn(`[worker] job ${job?.id} crashed: ${err.message}`));

await reconcileOnce();
const timer = setInterval(() => void reconcileOnce(), RECONCILE_EVERY_MS);
console.log(`[worker] started with model ${extractor?.model ?? "(none)"}`);

async function shutdown(signal: string) {
  console.log(`[worker] ${signal}, shutting down`);
  clearInterval(timer);
  // An in-flight extraction is abandoned; its lease expires and the reconciler requeues it.
  await Promise.allSettled([worker.close(true), queue.close()]);
  await db.$disconnect();
  process.exit(0);
}
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
