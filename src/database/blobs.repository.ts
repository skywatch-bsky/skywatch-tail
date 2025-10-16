import { Database } from "duckdb";
import { logger } from "../logger/index.js";

export interface Blob {
  post_uri: string;
  blob_cid: string;
  sha256: string;
  phash?: string;
  storage_path?: string;
  mimetype?: string;
}

export class BlobsRepository {
  constructor(private db: Database) {}

  async insert(blob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.prepare(
        `
        INSERT INTO blobs (post_uri, blob_cid, sha256, phash, storage_path, mimetype)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (post_uri, blob_cid) DO UPDATE SET
          sha256 = EXCLUDED.sha256,
          phash = EXCLUDED.phash,
          storage_path = EXCLUDED.storage_path,
          mimetype = EXCLUDED.mimetype
      `,
        (err, stmt) => {
          if (err) {
            logger.error({ err }, "Failed to prepare blob insert statement");
            reject(err);
            return;
          }

          stmt.run(
            blob.post_uri,
            blob.blob_cid,
            blob.sha256,
            blob.phash || null,
            blob.storage_path || null,
            blob.mimetype || null,
            (err) => {
              if (err) {
                logger.error({ err, blob }, "Failed to insert blob");
                reject(err);
                return;
              }
              resolve();
            }
          );
        }
      );
    });
  }

  async findByPostUri(postUri: string): Promise<Blob[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM blobs WHERE post_uri = $1`,
        postUri,
        (err, rows: Blob[]) => {
          if (err) {
            logger.error({ err, postUri }, "Failed to find blobs by post URI");
            reject(err);
            return;
          }
          resolve(rows || []);
        }
      );
    });
  }

  async findBySha256(sha256: string): Promise<Blob | null> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM blobs WHERE sha256 = $1 LIMIT 1`,
        sha256,
        (err, rows: Blob[]) => {
          if (err) {
            logger.error({ err, sha256 }, "Failed to find blob by SHA256");
            reject(err);
            return;
          }
          resolve(rows?.[0] || null);
        }
      );
    });
  }

  async findByPhash(phash: string): Promise<Blob[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM blobs WHERE phash = $1`,
        phash,
        (err, rows: Blob[]) => {
          if (err) {
            logger.error({ err, phash }, "Failed to find blobs by pHash");
            reject(err);
            return;
          }
          resolve(rows || []);
        }
      );
    });
  }

  async findByCid(cid: string): Promise<Blob | null> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM blobs WHERE blob_cid = $1 LIMIT 1`,
        cid,
        (err, rows: Blob[]) => {
          if (err) {
            logger.error({ err, cid }, "Failed to find blob by CID");
            reject(err);
            return;
          }
          resolve(rows?.[0] || null);
        }
      );
    });
  }
}
