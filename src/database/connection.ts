import { Database } from "duckdb";
import { config } from "../config/index.js";
import { logger } from "../logger/index.js";

let db: Database | null = null;

export function getDatabase(): Database {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return db;
}

export async function initializeDatabase(): Promise<Database> {
  return new Promise((resolve, reject) => {
    db = new Database(config.database.path, (err) => {
      if (err) {
        logger.error({ err }, "Failed to initialize database");
        reject(err);
        return;
      }
      logger.info({ path: config.database.path }, "Database initialized");
      resolve(db!);
    });
  });
}

export async function closeDatabase(): Promise<void> {
  if (!db) return;

  return new Promise((resolve, reject) => {
    db!.close((err) => {
      if (err) {
        logger.error({ err }, "Failed to close database");
        reject(err);
        return;
      }
      logger.info("Database closed");
      db = null;
      resolve();
    });
  });
}
