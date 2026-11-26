import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createExtractionQueue, enqueueExtraction } from "@app/queue";

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queue = createExtractionQueue();

  /**
   * Fire and forget: the HTTP response never waits for Redis. If the enqueue
   * fails, the version is still queued in Postgres and the worker's reconciler
   * picks it up within seconds.
   */
  requestExtraction(versionId: string): void {
    void enqueueExtraction(this.queue, versionId);
  }

  async onModuleDestroy() {
    await this.queue.close().catch(() => undefined);
  }
}
