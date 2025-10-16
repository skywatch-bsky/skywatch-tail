import * as fs from "fs/promises";
import * as path from "path";
import { BlobStorage } from "../processor.js";
import { logger } from "../../logger/index.js";

export class LocalBlobStorage implements BlobStorage {
  constructor(private basePath: string) {}

  async store(
    cid: string,
    data: Buffer,
    mimeType?: string
  ): Promise<string> {
    try {
      const extension = this.getExtensionFromMime(mimeType);
      const filename = `${cid}${extension}`;

      const dir = path.join(
        this.basePath,
        cid.substring(0, 2),
        cid.substring(2, 4)
      );

      await fs.mkdir(dir, { recursive: true });

      const fullPath = path.join(dir, filename);
      await fs.writeFile(fullPath, data);

      logger.debug({ cid, path: fullPath }, "Blob stored locally");

      return fullPath;
    } catch (error) {
      logger.error({ error, cid }, "Failed to store blob locally");
      throw error;
    }
  }

  async retrieve(cid: string): Promise<Buffer | null> {
    try {
      const possibleExtensions = ["", ".jpg", ".jpeg", ".png", ".webp", ".mp4"];

      for (const ext of possibleExtensions) {
        const filename = `${cid}${ext}`;
        const filePath = path.join(
          this.basePath,
          cid.substring(0, 2),
          cid.substring(2, 4),
          filename
        );

        try {
          const data = await fs.readFile(filePath);
          return data;
        } catch {
          continue;
        }
      }

      logger.warn({ cid }, "Blob not found in local storage");
      return null;
    } catch (error) {
      logger.error({ error, cid }, "Failed to retrieve blob from local storage");
      throw error;
    }
  }

  private getExtensionFromMime(mimeType?: string): string {
    if (!mimeType) return "";

    const mimeMap: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "video/mp4": ".mp4",
      "video/webm": ".webm",
    };

    return mimeMap[mimeType.toLowerCase()] || "";
  }
}
