import { Database } from "duckdb";
import { logger } from "../logger/index.js";

export interface ProfileBlob {
  did: string;
  blob_type: "avatar" | "banner";
  blob_cid: string;
  sha256: string;
  phash?: string;
  storage_path?: string;
  mimetype?: string;
}

export class ProfileBlobsRepository {
  constructor(private db: Database) {}

  async insert(blob: ProfileBlob): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.prepare(
        `
        INSERT INTO profile_blobs (did, blob_type, blob_cid, sha256, phash, storage_path, mimetype)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (did, blob_type) DO UPDATE SET
          blob_cid = EXCLUDED.blob_cid,
          sha256 = EXCLUDED.sha256,
          phash = EXCLUDED.phash,
          storage_path = EXCLUDED.storage_path,
          mimetype = EXCLUDED.mimetype
      `,
        (err, stmt) => {
          if (err) {
            logger.error({ err }, "Failed to prepare profile blob insert statement");
            reject(err);
            return;
          }

          stmt.run(
            blob.did,
            blob.blob_type,
            blob.blob_cid,
            blob.sha256,
            blob.phash || null,
            blob.storage_path || null,
            blob.mimetype || null,
            (err) => {
              if (err) {
                logger.error({ err, blob }, "Failed to insert profile blob");
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

  async findByDid(did: string): Promise<ProfileBlob[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM profile_blobs WHERE did = $1`,
        did,
        (err, rows: ProfileBlob[]) => {
          if (err) {
            logger.error({ err, did }, "Failed to find profile blobs by DID");
            reject(err);
            return;
          }
          resolve(rows || []);
        }
      );
    });
  }

  async findBySha256(sha256: string): Promise<ProfileBlob | null> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM profile_blobs WHERE sha256 = $1 LIMIT 1`,
        sha256,
        (err, rows: ProfileBlob[]) => {
          if (err) {
            logger.error({ err, sha256 }, "Failed to find profile blob by SHA256");
            reject(err);
            return;
          }
          resolve(rows?.[0] || null);
        }
      );
    });
  }

  async findByPhash(phash: string): Promise<ProfileBlob[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM profile_blobs WHERE phash = $1`,
        phash,
        (err, rows: ProfileBlob[]) => {
          if (err) {
            logger.error({ err, phash }, "Failed to find profile blobs by pHash");
            reject(err);
            return;
          }
          resolve(rows || []);
        }
      );
    });
  }
}
