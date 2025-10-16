import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const configSchema = z.object({
  bsky: z.object({
    handle: z.string().min(1, "BSKY_HANDLE is required"),
    password: z.string().min(1, "BSKY_PASSWORD is required"),
    pds: z.string().default("bsky.social"),
  }),
  labeler: z.object({
    wssUrl: z.string().url("WSS_URL must be a valid URL"),
  }),
  blobs: z.object({
    hydrate: z.boolean().default(false),
    storageType: z.enum(["local", "s3"]).default("local"),
    storagePath: z.string().default("./data/blobs"),
  }),
  s3: z
    .object({
      bucket: z.string().optional(),
      region: z.string().optional(),
      accessKeyId: z.string().optional(),
      secretAccessKey: z.string().optional(),
    })
    .optional(),
  database: z.object({
    path: z.string().default("./data/skywatch.duckdb"),
  }),
  filtering: z.object({
    captureLabels: z.array(z.string()).optional(),
  }),
  logging: z.object({
    level: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
  }),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const rawConfig = {
    bsky: {
      handle: process.env.BSKY_HANDLE,
      password: process.env.BSKY_PASSWORD,
      pds: process.env.PDS,
    },
    labeler: {
      wssUrl: process.env.WSS_URL,
    },
    blobs: {
      hydrate: process.env.HYDRATE_BLOBS === "true",
      storageType: process.env.BLOB_STORAGE_TYPE,
      storagePath: process.env.BLOB_STORAGE_PATH,
    },
    s3:
      process.env.BLOB_STORAGE_TYPE === "s3"
        ? {
            bucket: process.env.S3_BUCKET,
            region: process.env.S3_REGION,
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
    database: {
      path: process.env.DB_PATH,
    },
    filtering: {
      captureLabels: process.env.CAPTURE_LABELS
        ? process.env.CAPTURE_LABELS.split(",").map((l) => l.trim())
        : undefined,
    },
    logging: {
      level: process.env.LOG_LEVEL,
    },
  };

  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    console.error("Configuration validation failed:");
    console.error(result.error.format());
    process.exit(1);
  }

  if (result.data.blobs.storageType === "s3") {
    if (
      !result.data.s3?.bucket ||
      !result.data.s3?.region ||
      !result.data.s3?.accessKeyId ||
      !result.data.s3?.secretAccessKey
    ) {
      console.error(
        "S3 configuration is incomplete. Required: S3_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
      );
      process.exit(1);
    }
  }

  return result.data;
}

export const config = loadConfig();
