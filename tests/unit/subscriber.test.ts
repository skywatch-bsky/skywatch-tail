import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { FirehoseSubscriber } from "../../src/firehose/subscriber.js";
import { EventEmitter } from "events";
import WebSocket from "ws";

// Mock WebSocket class
class MockWebSocket extends EventEmitter {
  constructor(url: string) {
    super();
  }
  close() {}
}

// Mock the entire 'ws' module
mock.module("ws", () => ({
  default: MockWebSocket,
}));

describe("FirehoseSubscriber", () => {
  let subscriber: FirehoseSubscriber;
  let mockWsInstance: MockWebSocket;

  beforeEach(() => {
    subscriber = new FirehoseSubscriber();
    // Mock the connect method to control the WebSocket instance
    (subscriber as any).connect = () => {
      const url = new URL("ws://localhost:1234");
      if ((subscriber as any).cursor !== null) {
        url.searchParams.set("cursor", (subscriber as any).cursor.toString());
      }
      const ws = new WebSocket(url.toString());
      (subscriber as any).ws = ws;
      mockWsInstance = ws as any;

      ws.on("open", () => {
        subscriber.emit("connected");
      });
      ws.on("message", async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.seq) {
            await (subscriber as any).saveCursor(message.seq);
          }
          if (message.t === "#labels") {
            for (const label of message.labels) {
              subscriber.emit("label", label);
            }
          }
        } catch (error) {
          subscriber.emit("error", error);
        }
      });
      ws.on("close", () => {
        (subscriber as any).ws = null;
        subscriber.emit("disconnected");
        if ((subscriber as any).shouldReconnect) {
          (subscriber as any).scheduleReconnect();
        }
      });
      ws.on("error", (error) => {
        subscriber.emit("error", error);
      });
    };
  });

  afterEach(() => {
    subscriber.stop();
  });

  test("should attempt to connect on start", async (done) => {
    subscriber.on("connected", () => {
      done();
    });
    await subscriber.start();
    mockWsInstance.emit("open");
});

  test("should emit label event on label for post", async (done) => {
    subscriber.on("label", (label) => {
      expect(label.uri).toBe("at://did:plc:user/app.bsky.feed.post/123");
      done();
    });
    await subscriber.start();
    mockWsInstance.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          op: 1,
          t: "#labels",
          labels: [
            {
              src: "did:plc:labeler",
              uri: "at://did:plc:user/app.bsky.feed.post/123",
              val: "spam",
              cts: "2025-01-15T12:00:00Z",
            },
          ],
        })
      )
    );
  });

  test("should emit label event on label for profile", async (done) => {
    subscriber.on("label", (label) => {
      expect(label.uri).toBe("did:plc:user");
      done();
    });
    await subscriber.start();
    mockWsInstance.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          op: 1,
          t: "#labels",
          labels: [
            {
              src: "did:plc:labeler",
              uri: "did:plc:user",
              val: "spam",
              cts: "2025-01-15T12:00:00Z",
            },
          ],
        })
      )
    );
  });

  test("should handle multiple labels in one message", async () => {
    let labelCount = 0;
    subscriber.on("label", () => {
      labelCount++;
    });
    await subscriber.start();
    mockWsInstance.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          op: 1,
          t: "#labels",
          labels: [
            {
              src: "did:plc:labeler",
              uri: "at://did:plc:user/app.bsky.feed.post/123",
              val: "spam",
              cts: "2025-01-15T12:00:00Z",
            },
            {
              src: "did:plc:labeler",
              uri: "did:plc:user",
              val: "spam",
              cts: "2025-01-15T12:00:00Z",
            },
          ],
        })
      )
    );
    expect(labelCount).toBe(2);
  });

  test("should attempt to reconnect on close", (done) => {
    let connectAttempts = 0;
    (subscriber as any).connect = () => {
      connectAttempts++;
      if (connectAttempts > 1) {
        done();
      }
      const url = new URL("ws://localhost:1234");
      const ws = new WebSocket(url.toString());
      (subscriber as any).ws = ws;
      mockWsInstance = ws as any;
       ws.on("close", () => {
        (subscriber as any).ws = null;
        subscriber.emit("disconnected");
        if ((subscriber as any).shouldReconnect) {
          (subscriber as any).scheduleReconnect();
        }
      });
    };

    subscriber.start();
    mockWsInstance.emit("close");
  });

  test("should stop reconnecting after stop() is called", async (done) => {
    let connectAttempts = 0;
    (subscriber as any).connect = () => {
      connectAttempts++;
      const url = new URL("ws://localhost:1234");
      const ws = new WebSocket(url.toString());
      (subscriber as any).ws = ws;
      mockWsInstance = ws as any;
       ws.on("close", () => {
        (subscriber as any).ws = null;
        subscriber.emit("disconnected");
        if ((subscriber as any).shouldReconnect) {
          (subscriber as any).scheduleReconnect();
        }
      });
    };

    await subscriber.start();
    subscriber.stop();
    mockWsInstance.emit("close");

    setTimeout(() => {
      expect(connectAttempts).toBe(1);
      done();
    }, 2000);
  });

  test("should increase backoff delay on multiple reconnects", () => {
    subscriber.start();
    (subscriber as any).reconnectAttempts = 0;
    (subscriber as any).scheduleReconnect();
    const initialBackoff = (subscriber as any).reconnectAttempts;
    (subscriber as any).scheduleReconnect();
    const secondBackoff = (subscriber as any).reconnectAttempts;
    expect(secondBackoff).toBeGreaterThan(initialBackoff);
  });
});