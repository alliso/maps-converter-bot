import { createSerialQueue, QueueFullError } from "../rateLimit";

/** A clock that only moves when the queue sleeps, so tests are instant. */
function fakeClock() {
  let time = 1000;
  return {
    now: () => time,
    sleep: async (ms: number) => {
      time += ms;
    },
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("createSerialQueue", () => {
  it("runs tasks one at a time, in order", async () => {
    const clock = fakeClock();
    const enqueue = createSerialQueue(1000, clock);
    const order: string[] = [];
    let running = 0;

    const task = (name: string) => async () => {
      running += 1;
      expect(running).toBe(1);
      order.push(name);
      running -= 1;
      return name;
    };

    const results = await Promise.all([enqueue(task("a")), enqueue(task("b")), enqueue(task("c"))]);

    expect(order).toEqual(["a", "b", "c"]);
    expect(results).toEqual(["a", "b", "c"]);
  });

  it("keeps at least the minimum interval between starts", async () => {
    const clock = fakeClock();
    const enqueue = createSerialQueue(1000, clock);
    const startedAt: number[] = [];

    const stamp = async () => {
      startedAt.push(clock.now());
    };
    await Promise.all([enqueue(stamp), enqueue(stamp), enqueue(stamp)]);

    expect(startedAt).toEqual([1000, 2000, 3000]);
  });

  it("does not wait when the previous task is already old enough", async () => {
    const clock = fakeClock();
    const enqueue = createSerialQueue(1000, clock);

    await enqueue(async () => undefined);
    clock.advance(5000);
    const before = clock.now();
    await enqueue(async () => undefined);

    expect(clock.now()).toBe(before);
  });

  it("keeps draining after a task rejects", async () => {
    const clock = fakeClock();
    const enqueue = createSerialQueue(0, clock);

    const failed = enqueue(async () => {
      throw new Error("boom");
    });
    const after = enqueue(async () => "still here");

    await expect(failed).rejects.toThrow("boom");
    await expect(after).resolves.toBe("still here");
  });

  it("rejects with QueueFullError once the backlog is full", async () => {
    const clock = fakeClock();
    const enqueue = createSerialQueue(1000, { ...clock, maxPending: 2 });

    const first = enqueue(async () => "a");
    const second = enqueue(async () => "b");
    const third = enqueue(async () => "c");

    await expect(third).rejects.toBeInstanceOf(QueueFullError);
    await expect(Promise.all([first, second])).resolves.toEqual(["a", "b"]);
  });

  it("takes work again once the backlog drains", async () => {
    const clock = fakeClock();
    const enqueue = createSerialQueue(0, { ...clock, maxPending: 1 });

    await enqueue(async () => "a");
    await expect(enqueue(async () => "b")).resolves.toBe("b");
  });

  it("frees the slot even when the task throws", async () => {
    const clock = fakeClock();
    const enqueue = createSerialQueue(0, { ...clock, maxPending: 1 });

    await expect(
      enqueue(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(enqueue(async () => "ok")).resolves.toBe("ok");
  });

  it("sleeps for real when no clock is injected", async () => {
    const enqueue = createSerialQueue(5);
    const startedAt: number[] = [];

    await Promise.all([
      enqueue(async () => void startedAt.push(Date.now())),
      enqueue(async () => void startedAt.push(Date.now())),
    ]);

    expect(startedAt[1] - startedAt[0]).toBeGreaterThanOrEqual(4);
  });
});
