import { Queue } from "bullmq";
import { Redis, type RedisOptions } from "ioredis";

// Redis only carries "extract version X" messages. Losing them (a FLUSHALL, a
// failed enqueue) is harmless: the worker's reconciler rebuilds them from
// Postgres. So enqueueing is best effort and never blocks a caller.

export const EXTRACTION_QUEUE = "extraction";

export interface ExtractionJob {
  versionId: string;
}

export function redisUrl(): string {
  return process.env.REDIS_URL ?? "redis://localhost:6380";
}

export function createRedis(options: RedisOptions = {}): Redis {
  return new Redis(redisUrl(), options);
}

/** A producer that fails fast when Redis is down instead of buffering commands. */
export function createExtractionQueue(): Queue<ExtractionJob> {
  const queue = new Queue<ExtractionJob>(EXTRACTION_QUEUE, {
    connection: createRedis({ enableOfflineQueue: false, maxRetriesPerRequest: 1 }),
    defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: true },
  });
  queue.on("error", (err) => console.warn(`[queue] ${err.message}`));
  return queue;
}

/**
 * Asks a worker to extract a version. The job id makes repeated requests for
 * the same version collapse into one job while it is waiting.
 */
export async function enqueueExtraction(queue: Queue<ExtractionJob>, versionId: string): Promise<boolean> {
  try {
    await queue.add("extract", { versionId }, { jobId: `v-${versionId}` });
    return true;
  } catch (err) {
    console.warn(`[queue] could not enqueue ${versionId}; the reconciler will pick it up: ${(err as Error).message}`);
    return false;
  }
}
