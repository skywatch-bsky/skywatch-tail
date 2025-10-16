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
  description TEXT
);

-- Blobs table: stores information about image blobs found in posts
CREATE TABLE IF NOT EXISTS blobs (
  post_uri TEXT NOT NULL,
  blob_cid TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  phash TEXT,
  storage_path TEXT,
  mimetype TEXT,
  PRIMARY KEY (post_uri, blob_cid),
  FOREIGN KEY (post_uri) REFERENCES posts(uri)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_labels_uri ON labels(uri);
CREATE INDEX IF NOT EXISTS idx_labels_val ON labels(val);
CREATE INDEX IF NOT EXISTS idx_labels_cts ON labels(cts);
CREATE INDEX IF NOT EXISTS idx_posts_did ON posts(did);
CREATE INDEX IF NOT EXISTS idx_blobs_cid ON blobs(blob_cid);
CREATE INDEX IF NOT EXISTS idx_blobs_sha256 ON blobs(sha256);
CREATE INDEX IF NOT EXISTS idx_blobs_phash ON blobs(phash);
`;

export async function initializeSchema(): Promise<void> {
  const db = getDatabase();

  return new Promise((resolve, reject) => {
    db.exec(SCHEMA_SQL, (err) => {
      if (err) {
        logger.error({ err }, "Failed to initialize schema");
        reject(err);
        return;
      }
      logger.info("Database schema initialized");
      resolve();
    });
  });
}
