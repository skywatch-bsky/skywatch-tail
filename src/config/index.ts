import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const configSchema = z.object({
  bsky: z.object({
    handle: z.string().min(1, "BSKY_HANDLE is required"),
    password: z.string().min(1, "BSKY_PASSWORD is required"),
    pds: z.string().default("bsky.social"),
  }),
  plc: z.object({
    endpoint: z.string().url().default("https://plc.wtf"),
  }),
  labeler: z.object({
    wssUrl: z.string().url("WSS_URL must be a valid URL"),
  }),
  blobs: z.object({
    hydrateBlobs: z.boolean().default(false),
    storage: z.object({
      type: z.enum(["local", "s3"]).default("local"),
      localPath: z.string().default("./data/blobs"),
      s3Bucket: z.string().optional(),
      s3Region: z.string().optional(),
    }),
  }),
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
    plc: {
      endpoint: process.env.PLC_ENDPOINT,
    },
    labeler: {
      wssUrl: process.env.WSS_URL,
    },
    blobs: {
      hydrateBlobs: process.env.HYDRATE_BLOBS === "true",
      storage: {
        type: process.env.BLOB_STORAGE_TYPE,
        localPath: process.env.BLOB_STORAGE_PATH,
        s3Bucket: process.env.S3_BUCKET,
        s3Region: process.env.S3_REGION,
      },
    },
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

  if (result.data.blobs.storage.type === "s3") {
    if (
      !result.data.blobs.storage.s3Bucket ||
      !result.data.blobs.storage.s3Region
    ) {
      console.error(
        "S3 configuration is incomplete. Required: S3_BUCKET, S3_REGION"
      );
      process.exit(1);
    }
  }

  return result.data;
}

export const config = loadConfig();
