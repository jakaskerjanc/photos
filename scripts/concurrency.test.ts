import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { describe, it } from "node:test";
import { mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency", () => {
  it("returns results in input order even when later items finish first", async () => {
    const results = await mapWithConcurrency([30, 10, 20], 3, async (delay) => {
      await setTimeout(delay);
      return delay * 2;
    });

    assert.deepEqual(results, [60, 20, 40]);
  });

  it("never runs more than the limit at once", async () => {
    let running = 0;
    let maxRunning = 0;

    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await setTimeout(5);
      running--;
    });

    assert.equal(maxRunning, 3);
  });

  it("handles an empty list", async () => {
    assert.deepEqual(await mapWithConcurrency([], 4, async () => 1), []);
  });

  it("rejects when any item fails", async () => {
    await assert.rejects(
      mapWithConcurrency([1, 2], 2, async (item) => {
        if (item === 2) throw new Error("boom");
      }),
      { message: "boom" },
    );
  });
});
