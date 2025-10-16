import { describe, test, expect } from "bun:test";
import {
  extractLabelsFromMessage,
  validateLabel,
  LabelEvent,
} from "../../src/firehose/decoder.js";

describe("Firehose Decoder", () => {
  describe("extractLabelsFromMessage", () => {
    test("should extract labels from valid message", () => {
      const message = {
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
      };

      const labels = extractLabelsFromMessage(message);

      expect(labels).toHaveLength(1);
      expect(labels[0].val).toBe("spam");
      expect(labels[0].src).toBe("did:plc:labeler");
    });

    test("should return empty array for non-label messages", () => {
      const message = {
        op: 1,
        t: "#info",
      };

      const labels = extractLabelsFromMessage(message);

      expect(labels).toHaveLength(0);
    });

    test("should extract all labels from message with multiple labels", () => {
      const message = {
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
            uri: "at://did:plc:user/app.bsky.feed.post/456",
            val: "csam",
            cts: "2025-01-15T12:01:00Z",
          },
        ],
      };

      const labels = extractLabelsFromMessage(message);

      expect(labels).toHaveLength(2);
      expect(labels[0].val).toBe("spam");
      expect(labels[1].val).toBe("csam");
    });

    test("should return empty array for messages with empty labels array", () => {
      const message = {
        op: 1,
        t: "#labels",
        labels: [],
      };

      const labels = extractLabelsFromMessage(message);

      expect(labels).toHaveLength(0);
    });
  });

  describe("validateLabel", () => {
    test("should validate label with all required fields", () => {
      const label: LabelEvent = {
        src: "did:plc:labeler",
        uri: "at://did:plc:user/app.bsky.feed.post/123",
        val: "spam",
        cts: "2025-01-15T12:00:00Z",
      };

      expect(validateLabel(label)).toBe(true);
    });

    test("should reject label missing src", () => {
      const label = {
        uri: "at://did:plc:user/app.bsky.feed.post/123",
        val: "spam",
        cts: "2025-01-15T12:00:00Z",
      } as LabelEvent;

      expect(validateLabel(label)).toBe(false);
    });

    test("should reject label missing uri", () => {
      const label = {
        src: "did:plc:labeler",
        val: "spam",
        cts: "2025-01-15T12:00:00Z",
      } as LabelEvent;

      expect(validateLabel(label)).toBe(false);
    });

    test("should reject label missing val", () => {
      const label = {
        src: "did:plc:labeler",
        uri: "at://did:plc:user/app.bsky.feed.post/123",
        cts: "2025-01-15T12:00:00Z",
      } as LabelEvent;

      expect(validateLabel(label)).toBe(false);
    });

    test("should reject label missing cts", () => {
      const label = {
        src: "did:plc:labeler",
        uri: "at://did:plc:user/app.bsky.feed.post/123",
        val: "spam",
      } as LabelEvent;

      expect(validateLabel(label)).toBe(false);
    });
  });
});
