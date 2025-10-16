import { describe, test, expect, beforeEach } from "bun:test";
import { HydrationQueue, HydrationTask } from "../../src/hydration/queue.js";

describe("Hydration Queue", () => {
  let queue: HydrationQueue;

  beforeEach(() => {
    queue = new HydrationQueue();
  });

  test("should enqueue and process tasks", (done) => {
    const task: HydrationTask = {
      type: "post",
      identifier: "at://did:plc:user/app.bsky.feed.post/123",
    };

    queue.on("task", (processedTask) => {
      expect(processedTask).toEqual(task);
      done();
    });

    queue.enqueue(task);
  });

  test("should track queue size", () => {
    queue.enqueue({
      type: "post",
      identifier: "at://did:plc:user/app.bsky.feed.post/123",
    });

    queue.enqueue({
      type: "profile",
      identifier: "did:plc:user",
    });

    expect(queue.getQueueSize()).toBeGreaterThan(0);
  });

  test("should not enqueue duplicate tasks", () => {
    const task: HydrationTask = {
      type: "post",
      identifier: "at://did:plc:user/app.bsky.feed.post/123",
    };

    queue.enqueue(task);
    queue.enqueue(task);

    expect(queue.getQueueSize()).toBeLessThanOrEqual(1);
  });

  test("should clear queue", () => {
    queue.enqueue({
      type: "post",
      identifier: "at://did:plc:user/app.bsky.feed.post/123",
    });

    queue.clear();

    expect(queue.getQueueSize()).toBe(0);
  });
});
