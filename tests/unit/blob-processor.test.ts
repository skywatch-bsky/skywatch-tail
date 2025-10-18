import { describe, test, expect, beforeEach } from "bun:test";
import { BlobProcessor } from "../../src/blobs/processor.js";

describe("BlobProcessor", () => {
  let processor: BlobProcessor;

  beforeEach(() => {
    // Create a minimal processor instance for testing
    processor = new BlobProcessor(null as any, null as any);
  });

  describe("parseBlobUri (via reflection)", () => {
    test("should extract DID from at:// post URI", () => {
      const uri = "at://did:plc:35rwgycymvgupzg4iqgn5ykn/app.bsky.feed.post/3m3gm4uhp3k2b";
      // Access private method for testing
      const result = (processor as any).parseBlobUri(uri);

      expect(result.did).toBe("did:plc:35rwgycymvgupzg4iqgn5ykn");
      expect(result.type).toBe("post");
    });

    test("should extract DID from profile:// avatar URI", () => {
      const uri = "profile://did:plc:test123/avatar";
      const result = (processor as any).parseBlobUri(uri);

      expect(result.did).toBe("did:plc:test123");
      expect(result.type).toBe("avatar");
    });

    test("should extract DID from profile:// banner URI", () => {
      const uri = "profile://did:plc:test456/banner";
      const result = (processor as any).parseBlobUri(uri);

      expect(result.did).toBe("did:plc:test456");
      expect(result.type).toBe("banner");
    });
  });

  describe("extractBlobReferences", () => {

    test("should extract CID from plain $link reference", () => {
      const embedsJson = [
        {
          images: [
            {
              image: {
                ref: {
                  $link: "bafkreigg3s6plegjncmxubeufbohj3qasbm4r23q2x7zlivdhccfqfypve",
                },
                mimeType: "image/jpeg",
              },
            },
          ],
        },
      ];

      const refs = processor.extractBlobReferences(embedsJson);

      expect(refs).toHaveLength(1);
      expect(refs[0].cid).toBe("bafkreigg3s6plegjncmxubeufbohj3qasbm4r23q2x7zlivdhccfqfypve");
      expect(refs[0].mimeType).toBe("image/jpeg");
    });

    test("should extract CID from CID object with toString method", () => {
      const mockCid = {
        code: 85,
        version: 1,
        hash: new Uint8Array([1, 2, 3]),
        toString: () => "bafkreitest123",
      };

      const embedsJson = [
        {
          images: [
            {
              image: {
                ref: mockCid,
                mimeType: "image/png",
              },
            },
          ],
        },
      ];

      const refs = processor.extractBlobReferences(embedsJson);

      expect(refs).toHaveLength(1);
      expect(refs[0].cid).toBe("bafkreitest123");
      expect(refs[0].mimeType).toBe("image/png");
    });

    test("should extract multiple image references", () => {
      const embedsJson = [
        {
          images: [
            {
              image: {
                ref: { $link: "bafkreiabc123" },
                mimeType: "image/jpeg",
              },
            },
            {
              image: {
                ref: { $link: "bafkreixyz456" },
                mimeType: "image/png",
              },
            },
          ],
        },
      ];

      const refs = processor.extractBlobReferences(embedsJson);

      expect(refs).toHaveLength(2);
      expect(refs[0].cid).toBe("bafkreiabc123");
      expect(refs[1].cid).toBe("bafkreixyz456");
    });

    test("should extract from media.images property", () => {
      const embedsJson = [
        {
          media: {
            images: [
              {
                image: {
                  ref: { $link: "bafkreimedia123" },
                  mimeType: "image/jpeg",
                },
              },
            ],
          },
        },
      ];

      const refs = processor.extractBlobReferences(embedsJson);

      expect(refs).toHaveLength(1);
      expect(refs[0].cid).toBe("bafkreimedia123");
    });

    test("should extract video references", () => {
      const embedsJson = [
        {
          video: {
            ref: { $link: "bafkreivideo123" },
            mimeType: "video/mp4",
          },
        },
      ];

      const refs = processor.extractBlobReferences(embedsJson);

      expect(refs).toHaveLength(1);
      expect(refs[0].cid).toBe("bafkreivideo123");
      expect(refs[0].mimeType).toBe("video/mp4");
    });

    test("should handle empty embeds array", () => {
      const refs = processor.extractBlobReferences([]);
      expect(refs).toHaveLength(0);
    });

    test("should handle null embeds", () => {
      const refs = processor.extractBlobReferences(null);
      expect(refs).toHaveLength(0);
    });

    test("should handle embeds with no images", () => {
      const embedsJson = [
        {
          external: {
            uri: "https://example.com",
            title: "Example",
          },
        },
      ];

      const refs = processor.extractBlobReferences(embedsJson);
      expect(refs).toHaveLength(0);
    });

    test("should skip images with missing refs", () => {
      const embedsJson = [
        {
          images: [
            {
              image: {
                mimeType: "image/jpeg",
                // no ref
              },
            },
          ],
        },
      ];

      const refs = processor.extractBlobReferences(embedsJson);
      expect(refs).toHaveLength(0);
    });

    test("should extract mixed content types from single embed", () => {
      const embedsJson = [
        {
          images: [
            {
              image: {
                ref: { $link: "bafkreiimg1" },
                mimeType: "image/jpeg",
              },
            },
          ],
          media: {
            images: [
              {
                image: {
                  ref: { $link: "bafkreiimg2" },
                  mimeType: "image/png",
                },
              },
            ],
          },
          video: {
            ref: { $link: "bafkreivid1" },
            mimeType: "video/mp4",
          },
        },
      ];

      const refs = processor.extractBlobReferences(embedsJson);

      expect(refs).toHaveLength(3);
      expect(refs[0].cid).toBe("bafkreiimg1");
      expect(refs[1].cid).toBe("bafkreiimg2");
      expect(refs[2].cid).toBe("bafkreivid1");
    });

    test("should extract from multiple embeds", () => {
      const embedsJson = [
        {
          images: [
            {
              image: {
                ref: { $link: "bafkrei1" },
                mimeType: "image/jpeg",
              },
            },
          ],
        },
        {
          images: [
            {
              image: {
                ref: { $link: "bafkrei2" },
                mimeType: "image/png",
              },
            },
          ],
        },
      ];

      const refs = processor.extractBlobReferences(embedsJson);

      expect(refs).toHaveLength(2);
      expect(refs[0].cid).toBe("bafkrei1");
      expect(refs[1].cid).toBe("bafkrei2");
    });
  });
});
