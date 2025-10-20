#!/usr/bin/env bun

import { BlobProcessor } from "../src/blobs/processor.js";

async function main() {
  console.log("Testing blob hydration with mock data...\n");

  const blobProcessor = new BlobProcessor(null as any, null as any);

  // Create a mock CID object (what @atproto/api returns)
  const mockCid = {
    code: 85,
    version: 1,
    hash: new Uint8Array([18, 32, 198, 220, 188, 245, 144, 201, 104, 153]),
    toString: () => "bafkreigg3s6plegjncmxubeufbohj3qasbm4r23q2x7zlivdhccfqfypve",
  };

  // This is what a real post embed looks like from agent.com.atproto.repo.getRecord
  const mockEmbed = {
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

  // PostHydrationService wraps it in an array
  const embeds = [mockEmbed];

  console.log("Mock embed structure:");
  console.log(JSON.stringify({
    $type: mockEmbed.$type,
    images: [{
      alt: mockEmbed.images[0].alt,
      image: {
        ref: "CID object (has toString method)",
        mimeType: mockEmbed.images[0].image.mimeType,
      }
    }]
  }, null, 2));

  console.log("\nTesting blob extraction...");
  const blobRefs = blobProcessor.extractBlobReferences(embeds);

  console.log("\nExtracted blob references:");
  console.log(blobRefs);

  if (blobRefs.length > 0) {
    console.log("\n✓ Blob extraction working!");
    console.log(`Found ${blobRefs.length} blob(s)`);
    console.log(`CID: ${blobRefs[0].cid}`);
    console.log(`MimeType: ${blobRefs[0].mimeType}`);
  } else {
    console.log("\n✗ No blobs extracted - this is the problem!");
  }

  // Test URI parsing
  console.log("\n\nTesting URI parsing...");
  const testUri = "at://did:plc:35rwgycymvgupzg4iqgn5ykn/app.bsky.feed.post/3m3gm4uhp3k2b";
  const parsed = (blobProcessor as any).parseBlobUri(testUri);
  console.log(`URI: ${testUri}`);
  console.log(`Parsed DID: ${parsed.did}`);
  console.log(`Parsed type: ${parsed.type}`);

  if (parsed.did === "did:plc:35rwgycymvgupzg4iqgn5ykn") {
    console.log("✓ URI parsing correct!");
  } else {
    console.log("✗ URI parsing WRONG! Expected: did:plc:35rwgycymvgupzg4iqgn5ykn");
  }
}

main();
