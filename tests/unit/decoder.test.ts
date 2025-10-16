import { describe, test, expect } from "bun:test";
import {
  extractLabelFromMessage,
  validateLabel,
  LabelEvent,
} from "../../src/firehose/decoder.js";

describe("Firehose Decoder", () => {
  describe("extractLabelFromMessage", () => {
    test("should extract label from valid message", () => {
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

      const label = extractLabelFromMessage(message);

      expect(label).not.toBeNull();
      expect(label?.val).toBe("spam");
      expect(label?.src).toBe("did:plc:labeler");
    });

    test("should return null for non-label messages", () => {
      const message = {
        op: 1,
        t: "#info",
      };

      const label = extractLabelFromMessage(message);

      expect(label).toBeNull();
    });

    test("should return null for messages with wrong op", () => {
      const message = {
        op: 0,
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

      const label = extractLabelFromMessage(message);

      expect(label).toBeNull();
    });

    test("should return null for messages with empty labels array", () => {
      const message = {
        op: 1,
        t: "#labels",
        labels: [],
      };

      const label = extractLabelFromMessage(message);

      expect(label).toBeNull();
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
