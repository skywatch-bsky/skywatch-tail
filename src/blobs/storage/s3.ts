import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { BlobStorage } from "../processor.js";
import { logger } from "../../logger/index.js";

export class S3BlobStorage implements BlobStorage {
  private client: S3Client;
  private bucket: string;

  constructor(bucket: string, region: string) {
    this.bucket = bucket;
    this.client = new S3Client({ region });
  }

  async store(
    cid: string,
    data: Buffer,
    mimeType?: string
  ): Promise<string> {
    try {
      const key = `blobs/${cid.substring(0, 2)}/${cid.substring(2, 4)}/${cid}`;

      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: data,
          ContentType: mimeType,
        })
      );

      logger.debug({ cid, key }, "Blob stored in S3");

      return `s3://${this.bucket}/${key}`;
    } catch (error) {
      logger.error({ error, cid }, "Failed to store blob in S3");
      throw error;
    }
  }

  async retrieve(cid: string): Promise<Buffer | null> {
    try {
      const key = `blobs/${cid.substring(0, 2)}/${cid.substring(2, 4)}/${cid}`;

      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      if (!response.Body) {
        logger.warn({ cid }, "Blob not found in S3");
        return null;
      }

      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      logger.error({ error, cid }, "Failed to retrieve blob from S3");
      return null;
    }
  }
}
