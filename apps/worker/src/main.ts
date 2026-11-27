import { createPrismaClient, reconcile } from "@app/db";
import {
  EXTRACTION_QUEUE,
  createExtractionQueue,
  createRedis,
  enqueueExtraction,
  type ExtractionJob,
} from "@app/queue";
import { Worker } from "bullmq";
import { chooseExtractor } from "./choose-extractor.js";
import { warmupPdfParser } from "./parse.js";
import { processVersion } from "./process.js";

const RECONCILE_EVERY_MS = 10_000;
const WORKER_CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY) || 5);

const db = createPrismaClient();
const extractor = chooseExtractor();
void warmupPdfParser();

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
  { connection: createRedis({ maxRetriesPerRequest: null }), concurrency: WORKER_CONCURRENCY },
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
