import { AtpAgent } from "@atproto/api";
import { Database } from "duckdb";
import { BlobsRepository } from "../database/blobs.repository.js";
import { computeBlobHashes } from "./hasher.js";
import { LocalBlobStorage } from "./storage/local.js";
import { S3BlobStorage } from "./storage/s3.js";
import { config } from "../config/index.js";
import { logger } from "../logger/index.js";

export interface BlobReference {
  cid: string;
  mimeType?: string;
}

export interface BlobStorage {
  store(cid: string, data: Buffer, mimeType?: string): Promise<string>;
  retrieve(cid: string): Promise<Buffer | null>;
}

export class BlobProcessor {
  private blobsRepo: BlobsRepository;
  private storage: BlobStorage | null = null;
  private agent: AtpAgent;

  constructor(db: Database, agent: AtpAgent) {
    this.blobsRepo = new BlobsRepository(db);
    this.agent = agent;

    if (config.blobs.hydrateBlobs) {
      if (config.blobs.storage.type === "s3") {
        this.storage = new S3BlobStorage(
          config.blobs.storage.s3Bucket!,
          config.blobs.storage.s3Region!
        );
      } else {
        this.storage = new LocalBlobStorage(
          config.blobs.storage.localPath
        );
      }
    }
  }

  extractBlobReferences(embedsJson: any): BlobReference[] {
    const refs: BlobReference[] = [];

    if (!embedsJson || !Array.isArray(embedsJson)) {
      return refs;
    }

    for (const embed of embedsJson) {
      if (embed.images && Array.isArray(embed.images)) {
        for (const img of embed.images) {
          if (img.image?.ref?.$link) {
            refs.push({
              cid: img.image.ref.$link,
              mimeType: img.image.mimeType,
            });
          }
        }
      }

      if (embed.media?.images && Array.isArray(embed.media.images)) {
        for (const img of embed.media.images) {
          if (img.image?.ref?.$link) {
            refs.push({
              cid: img.image.ref.$link,
              mimeType: img.image.mimeType,
            });
          }
        }
      }

      if (embed.video?.ref?.$link) {
        refs.push({
          cid: embed.video.ref.$link,
          mimeType: embed.video.mimeType,
        });
      }
    }

    return refs;
  }

  async processBlobs(postUri: string, embedsJson: any): Promise<void> {
    const blobRefs = this.extractBlobReferences(embedsJson);

    if (blobRefs.length === 0) {
      return;
    }

    for (const ref of blobRefs) {
      try {
        await this.processBlob(postUri, ref);
      } catch (error) {
        logger.error(
          { error, postUri, cid: ref.cid },
          "Failed to process blob"
        );
      }
    }
  }

  private parseBlobUri(uri: string): { did: string; type: 'post' | 'avatar' | 'banner' } {
    if (uri.startsWith("profile://")) {
      const match = uri.match(/^profile:\/\/([^/]+)\/(avatar|banner)$/);
      if (match) {
        return { did: match[1], type: match[2] as 'avatar' | 'banner' };
      }
    }

    const [, did] = uri.replace("at://", "").split("/");
    return { did, type: 'post' };
  }

  private async processBlob(
    postUri: string,
    ref: BlobReference
  ): Promise<void> {
    const existing = await this.blobsRepo.findByCid(ref.cid);
    if (existing) {
      await this.blobsRepo.insert({
        post_uri: postUri,
        blob_cid: ref.cid,
        sha256: existing.sha256,
        phash: existing.phash,
        storage_path: existing.storage_path,
        mimetype: existing.mimetype,
      });
      logger.debug(
        { postUri, cid: ref.cid },
        "Blob already processed, reusing hashes"
      );
      return;
    }

    const { did, type } = this.parseBlobUri(postUri);
    const pds = `https://${config.bsky.pds}`;
    const blobUrl = `${pds}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${ref.cid}`;

    try {
      const response = await fetch(blobUrl);

      if (!response.ok) {
        logger.warn(
          { postUri, cid: ref.cid, status: response.status, did },
          "Failed to fetch blob"
        );
        return;
      }

      const blobData = Buffer.from(await response.arrayBuffer());

      let storagePath: string | undefined;
      if (this.storage && config.blobs.hydrateBlobs) {
        storagePath = await this.storage.store(
          ref.cid,
          blobData,
          ref.mimeType
        );
      }

      const hashes = await computeBlobHashes(
        blobData,
        ref.mimeType
      );

      await this.blobsRepo.insert({
        post_uri: postUri,
        blob_cid: ref.cid,
        sha256: hashes.sha256,
        phash: hashes.phash,
        storage_path: storagePath,
        mimetype: ref.mimeType,
      });

      logger.info(
        { postUri, cid: ref.cid, sha256: hashes.sha256, type },
        "Blob processed successfully"
      );
    } catch (error) {
      logger.error(
        { error, postUri, cid: ref.cid },
        "Failed to download or hash blob"
      );
      throw error;
    }
  }
}
