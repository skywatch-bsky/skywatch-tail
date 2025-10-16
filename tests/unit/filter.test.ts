import { describe, test, expect, beforeEach } from "bun:test";
import { LabelFilter } from "../../src/firehose/filter.js";
import { LabelEvent } from "../../src/firehose/decoder.js";

describe("Label Filter", () => {
  describe("with no filtering (capturing all labels)", () => {
    let filter: LabelFilter;

    beforeEach(() => {
      filter = new LabelFilter([]);
    });

    test("should capture any label", () => {
      const label: LabelEvent = {
        src: "did:plc:labeler",
        uri: "at://did:plc:user/app.bsky.feed.post/123",
        val: "spam",
        cts: "2025-01-15T12:00:00Z",
      };

      expect(filter.shouldCapture(label)).toBe(true);
    });

    test("should return null for filtered labels list", () => {
      expect(filter.getFilteredLabels()).toBeNull();
    });
  });

  describe("with label filtering enabled", () => {
    let filter: LabelFilter;

    beforeEach(() => {
      filter = new LabelFilter(["spam", "hate-speech", "csam"]);
    });

    test("should capture allowed labels", () => {
      const label: LabelEvent = {
        src: "did:plc:labeler",
        uri: "at://did:plc:user/app.bsky.feed.post/123",
        val: "spam",
        cts: "2025-01-15T12:00:00Z",
      };

      expect(filter.shouldCapture(label)).toBe(true);
    });

    test("should reject non-allowed labels", () => {
      const label: LabelEvent = {
        src: "did:plc:labeler",
        uri: "at://did:plc:user/app.bsky.feed.post/123",
        val: "misleading",
        cts: "2025-01-15T12:00:00Z",
      };

      expect(filter.shouldCapture(label)).toBe(false);
    });

    test("should return list of filtered labels", () => {
      const labels = filter.getFilteredLabels();

      expect(labels).not.toBeNull();
      expect(labels).toContain("spam");
      expect(labels).toContain("hate-speech");
      expect(labels).toContain("csam");
      expect(labels?.length).toBe(3);
    });
  });
});
