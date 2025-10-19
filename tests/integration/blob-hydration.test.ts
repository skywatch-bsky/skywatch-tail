import { describe, test, expect, beforeAll } from "bun:test";
import { BlobProcessor } from "../../src/blobs/processor.js";

describe("Blob Hydration Integration", () => {
  let blobProcessor: BlobProcessor;

  beforeAll(() => {
    // Create minimal processor for testing extraction logic
    blobProcessor = new BlobProcessor(null as any, null as any);
  });

  test("should extract blobs from real post embed structure", async () => {
    // This is what a real post embed looks like when fetched via agent.com.atproto.repo.getRecord
    const mockCid = {
      code: 85,
      version: 1,
      hash: new Uint8Array([18, 32, 198, 220, 188, 245]),
      toString: () => "bafkreigg3s6plegjncmxubeufbohj3qasbm4r23q2x7zlivdhccfqfypve",
    };

    // Simulate what we get from record.embed
    const singleEmbed = {
      $type: "app.bsky.embed.images",
      images: [
        {
          alt: "Test image",
          image: {
            $type: "blob",
            ref: mockCid,
            mimeType: "image/jpeg",
            size: 101770,
          },
        },
      ],
    };

    // PostHydrationService wraps it in an array: [record.embed]
    const embedsArray = [singleEmbed];

    const refs = blobProcessor.extractBlobReferences(embedsArray);

    console.log("Extracted refs:", refs);
    expect(refs).toHaveLength(1);
    expect(refs[0].cid).toBe("bafkreigg3s6plegjncmxubeufbohj3qasbm4r23q2x7zlivdhccfqfypve");
  });

  test("should extract blobs from images#view structure", async () => {
    // Some embeds might come as #view format
    const mockCid = {
      code: 85,
      version: 1,
      hash: new Uint8Array([18, 32, 198, 220, 188, 245]),
      toString: () => "bafkreitest123",
    };

    const embedWithView = {
      $type: "app.bsky.embed.images#view",
      images: [
        {
          thumb: "https://cdn.bsky.app/...",
          fullsize: "https://cdn.bsky.app/...",
          alt: "Test",
          image: {
            ref: mockCid,
            mimeType: "image/jpeg",
          },
        },
      ],
    };

    const refs = blobProcessor.extractBlobReferences([embedWithView]);

    console.log("View format refs:", refs);
    expect(refs).toHaveLength(1);
    expect(refs[0].cid).toBe("bafkreitest123");
  });

  test("should handle recordWithMedia embeds", async () => {
    const mockCid = {
      code: 85,
      version: 1,
      hash: new Uint8Array([18, 32, 198, 220, 188, 245]),
      toString: () => "bafkreimedia456",
    };

    const recordWithMedia = {
      $type: "app.bsky.embed.recordWithMedia",
      media: {
        $type: "app.bsky.embed.images",
        images: [
          {
            image: {
              ref: mockCid,
              mimeType: "image/png",
            },
          },
        ],
      },
    };

    const refs = blobProcessor.extractBlobReferences([recordWithMedia]);

    console.log("RecordWithMedia refs:", refs);
    expect(refs).toHaveLength(1);
    expect(refs[0].cid).toBe("bafkreimedia456");
  });
});
