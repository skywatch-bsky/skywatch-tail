import crypto from "crypto";
import sharp from "sharp";
import { logger } from "../logger/index.js";

export async function computeSha256(buffer: Buffer): Promise<string> {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function computePerceptualHash(buffer: Buffer): Promise<string> {
  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("Invalid image metadata");
    }

    const resized = await image
      .resize(8, 8, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer();

    const pixels = new Uint8Array(resized);
    const avg =
      pixels.reduce((sum, val) => sum + val, 0) / pixels.length;

    let hash = "";
    for (let i = 0; i < pixels.length; i++) {
      hash += pixels[i] > avg ? "1" : "0";
    }

    return BigInt("0b" + hash).toString(16).padStart(16, "0");
  } catch (error) {
    logger.error({ error }, "Failed to compute perceptual hash");
    throw error;
  }
}

export interface BlobHashes {
  sha256: string;
  phash?: string;
}

export async function computeBlobHashes(
  buffer: Buffer,
  mimetype?: string
): Promise<BlobHashes> {
  const sha256 = await computeSha256(buffer);

  if (
    mimetype?.startsWith("image/") &&
    !mimetype.includes("svg")
  ) {
    try {
      const phash = await computePerceptualHash(buffer);
      return { sha256, phash };
    } catch (error) {
      logger.warn(
        { error, mimetype },
        "Failed to compute pHash, returning SHA256 only"
      );
      return { sha256 };
    }
  }

  return { sha256 };
}
