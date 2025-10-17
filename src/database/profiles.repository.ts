import { Database } from "duckdb";
import { logger } from "../logger/index.js";

export interface Profile {
  did: string;
  handle?: string;
  display_name?: string;
  description?: string;
  avatar_cid?: string;
  banner_cid?: string;
}

export class ProfilesRepository {
  constructor(private db: Database) {}

  async insert(profile: Profile): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.prepare(
        `
        INSERT INTO profiles (did, handle, display_name, description, avatar_cid, banner_cid)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (did) DO UPDATE SET
          handle = EXCLUDED.handle,
          display_name = EXCLUDED.display_name,
          description = EXCLUDED.description,
          avatar_cid = EXCLUDED.avatar_cid,
          banner_cid = EXCLUDED.banner_cid
      `,
        (err, stmt) => {
          if (err) {
            logger.error({ err }, "Failed to prepare profile insert statement");
            reject(err);
            return;
          }

          stmt.run(
            profile.did,
            profile.handle || null,
            profile.display_name || null,
            profile.description || null,
            profile.avatar_cid || null,
            profile.banner_cid || null,
            (err) => {
              if (err) {
                logger.error({ err, profile }, "Failed to insert profile");
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

  async findByDid(did: string): Promise<Profile | null> {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM profiles WHERE did = $1`, did, (err, rows: Profile[]) => {
        if (err) {
          logger.error({ err, did }, "Failed to find profile by DID");
          reject(err);
          return;
        }
        resolve(rows?.[0] || null);
      });
    });
  }

  async findByHandle(handle: string): Promise<Profile | null> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM profiles WHERE handle = $1`,
        handle,
        (err, rows: Profile[]) => {
          if (err) {
            logger.error({ err, handle }, "Failed to find profile by handle");
            reject(err);
            return;
          }
          resolve(rows?.[0] || null);
        }
      );
    });
  }
}
