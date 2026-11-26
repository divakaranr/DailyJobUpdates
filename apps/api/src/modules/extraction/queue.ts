import { Queue, Worker, type ConnectionOptions } from 'bullmq';

export type ExtractionHandler = (extractionId: string) => Promise<void>;

export interface ExtractionQueue {
  readonly kind: 'bullmq' | 'in-process';
  enqueue(extractionId: string): Promise<void>;
  /** Starts consuming jobs in this process. */
  startWorker(handler: ExtractionHandler): void;
  close(): Promise<void>;
}

/** Simple bounded-concurrency queue used when Redis is not configured. */
export class InProcessQueue implements ExtractionQueue {
  readonly kind = 'in-process' as const;
  private pending: string[] = [];
  private running = 0;
  private handler: ExtractionHandler | null = null;
  private idleResolvers: (() => void)[] = [];

  constructor(private readonly concurrency = 2) {}

  async enqueue(id: string) {
    if (!this.pending.includes(id)) this.pending.push(id);
    this.drain();
  }

  startWorker(handler: ExtractionHandler) {
    this.handler = handler;
    this.drain();
  }

  private drain() {
    if (!this.handler) return;
    while (this.running < this.concurrency && this.pending.length) {
      const id = this.pending.shift()!;
      this.running++;
      this.handler(id)
        .catch(() => undefined)
        .finally(() => {
          this.running--;
          this.drain();
          if (this.running === 0 && this.pending.length === 0) {
            this.idleResolvers.splice(0).forEach((r) => r());
          }
        });
    }
  }

  /** Resolves once all queued work is finished (used by tests). */
  onIdle(): Promise<void> {
    if (this.running === 0 && this.pending.length === 0) return Promise.resolve();
    return new Promise((r) => this.idleResolvers.push(r));
  }

  async close() {
    this.pending = [];
  }
}

function redisConnection(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname && u.pathname !== '/' ? Number(u.pathname.slice(1)) : undefined,
    tls: u.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

/** Durable Redis-backed queue with retries — used when REDIS_URL is set. */
export class BullMqQueue implements ExtractionQueue {
  readonly kind = 'bullmq' as const;
  private readonly queue: Queue;
  private worker: Worker | null = null;
  private readonly connection: ConnectionOptions;

  constructor(redisUrl: string, private readonly concurrency = 2) {
    this.connection = redisConnection(redisUrl);
    this.queue = new Queue('extractions', {
      connection: this.connection,
      defaultJobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 5000 },
    });
  }

  async enqueue(id: string) {
    await this.queue.add('extract', { extractionId: id }, { jobId: `${id}-${Date.now()}` });
  }

  startWorker(handler: ExtractionHandler) {
    this.worker = new Worker('extractions', async (job) => handler(job.data.extractionId as string), {
      connection: this.connection,
      concurrency: this.concurrency,
    });
  }

  async close() {
    await this.worker?.close();
    await this.queue.close();
  }
}
