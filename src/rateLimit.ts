export type Enqueue = <T>(task: () => Promise<T>) => Promise<T>;

export type QueueOptions = {
  /** Refuse work once this many tasks are already waiting. */
  maxPending?: number;
  /** Injectable for tests. */
  now?: () => number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
};

/** Thrown by the queue when the backlog is longer than `maxPending`. */
export class QueueFullError extends Error {
  constructor() {
    super("queue is full");
    this.name = "QueueFullError";
  }
}

/**
 * Runs tasks one at a time, never starting one sooner than `minIntervalMs`
 * after the previous one started.
 *
 * On a phone one person shares one link at a time and a rate limit is academic;
 * a bot serving a crowd is the opposite, and Nominatim's usage policy caps us at
 * one request per second for the whole process.
 */
export function createSerialQueue(minIntervalMs: number, options: QueueOptions = {}): Enqueue {
  const { maxPending = Number.POSITIVE_INFINITY, now = Date.now, sleep = delay } = options;

  let lastStartedAt = Number.NEGATIVE_INFINITY;
  let pending = 0;
  let tail: Promise<unknown> = Promise.resolve();

  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    // A backlog that outlives the user's patience is worse than not queueing at
    // all: better to say no now and let the caller take its fallback.
    if (pending >= maxPending) return Promise.reject(new QueueFullError());

    pending += 1;
    const run = async (): Promise<T> => {
      const wait = lastStartedAt + minIntervalMs - now();
      if (wait > 0) await sleep(wait);
      lastStartedAt = now();
      try {
        return await task();
      } finally {
        pending -= 1;
      }
    };

    const result = tail.then(run, run);
    // The chain must survive a failed task, or one rejection stalls every
    // request behind it.
    tail = result.then(ignore, ignore);
    return result;
  };
}

const ignore = () => undefined;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
