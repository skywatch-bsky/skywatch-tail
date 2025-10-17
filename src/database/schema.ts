import { getDatabase } from "./connection.js";
import { logger } from "../logger/index.js";

const SCHEMA_SQL = `
-- Labels table: stores raw label event data
CREATE SEQUENCE IF NOT EXISTS labels_id_seq;
CREATE TABLE IF NOT EXISTS labels (
  id INTEGER PRIMARY KEY DEFAULT nextval('labels_id_seq'),
  uri TEXT NOT NULL,
  cid TEXT,
  val TEXT NOT NULL,
  neg BOOLEAN DEFAULT FALSE,
  cts TIMESTAMP NOT NULL,
  exp TIMESTAMP,
  src TEXT NOT NULL,
  UNIQUE(uri, val, cts)
);

-- Posts table: stores hydrated data for labeled posts
CREATE TABLE IF NOT EXISTS posts (
  uri TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  text TEXT,
  facets JSON,
  embeds JSON,
  langs JSON,
  tags JSON,
  created_at TIMESTAMP NOT NULL,
  is_reply BOOLEAN DEFAULT FALSE
);

-- Profiles table: stores hydrated data for labeled user accounts
CREATE TABLE IF NOT EXISTS profiles (
  did TEXT PRIMARY KEY,
  handle TEXT,
  display_name TEXT,
  description TEXT,
  avatar_cid TEXT,
  banner_cid TEXT
);

-- Blobs table: stores information about image blobs found in posts and profiles
CREATE TABLE IF NOT EXISTS blobs (
  post_uri TEXT NOT NULL,
  blob_cid TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  phash TEXT,
  storage_path TEXT,
  mimetype TEXT,
  PRIMARY KEY (post_uri, blob_cid)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_labels_uri ON labels(uri);
CREATE INDEX IF NOT EXISTS idx_labels_val ON labels(val);
CREATE INDEX IF NOT EXISTS idx_labels_cts ON labels(cts);
CREATE INDEX IF NOT EXISTS idx_posts_did ON posts(did);
CREATE INDEX IF NOT EXISTS idx_blobs_sha256 ON blobs(sha256);
CREATE INDEX IF NOT EXISTS idx_blobs_phash ON blobs(phash);
`;

async function migrateProfilesTable(): Promise<void> {
  const db = getDatabase();

  return new Promise((resolve, reject) => {
    db.all(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles'",
      (err, rows: any[]) => {
        if (err) {
          logger.error({ err }, "Failed to check profiles table columns");
          reject(err);
          return;
        }

        const columnNames = rows.map((row) => row.column_name);
        const hasAvatarCid = columnNames.includes("avatar_cid");
        const hasBannerCid = columnNames.includes("banner_cid");

        if (!hasAvatarCid || !hasBannerCid) {
          logger.info("Migrating profiles table to add avatar_cid and banner_cid columns");

          const migrations: string[] = [];
          if (!hasAvatarCid) {
            migrations.push("ALTER TABLE profiles ADD COLUMN avatar_cid TEXT");
          }
          if (!hasBannerCid) {
            migrations.push("ALTER TABLE profiles ADD COLUMN banner_cid TEXT");
          }

          db.exec(migrations.join("; "), (err) => {
            if (err) {
              logger.error({ err }, "Failed to migrate profiles table");
              reject(err);
              return;
            }
            logger.info("Profiles table migration completed");
            resolve();
          });
        } else {
          logger.debug("Profiles table already has avatar_cid and banner_cid columns");
          resolve();
        }
      }
    );
  });
}

async function migrateBlobsTableConstraint(): Promise<void> {
  const db = getDatabase();

  return new Promise((resolve, reject) => {
    db.all(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_name = 'blobs' AND constraint_type = 'FOREIGN KEY'`,
      (err, rows: any[]) => {
        if (err) {
          logger.error({ err }, "Failed to check blobs table constraints");
          reject(err);
          return;
        }

        if (rows && rows.length > 0) {
          logger.info("Migrating blobs table to remove foreign key constraint");

          const migration = `
            CREATE TABLE blobs_new AS SELECT * FROM blobs;
            DROP TABLE blobs;
            ALTER TABLE blobs_new RENAME TO blobs;
            CREATE INDEX IF NOT EXISTS idx_blobs_sha256 ON blobs(sha256);
            CREATE INDEX IF NOT EXISTS idx_blobs_phash ON blobs(phash);
          `;

          db.exec(migration, (err) => {
            if (err) {
              logger.error({ err }, "Failed to migrate blobs table");
              reject(err);
              return;
            }
            logger.info("Blobs table migration completed");
            resolve();
          });
        } else {
          logger.debug("Blobs table already has no foreign key constraint");
          resolve();
        }
      }
    );
  });
}

export async function initializeSchema(): Promise<void> {
  const db = getDatabase();

  return new Promise((resolve, reject) => {
    db.exec(SCHEMA_SQL, async (err) => {
      if (err) {
        logger.error({ err }, "Failed to initialize schema");
        reject(err);
        return;
      }
      logger.info("Database schema initialized");

      try {
        await migrateProfilesTable();
        await migrateBlobsTableConstraint();
        resolve();
      } catch (migrationErr) {
        reject(migrationErr);
      }
    });
  });
}
