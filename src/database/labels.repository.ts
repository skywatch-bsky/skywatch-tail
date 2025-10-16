import { Database } from "duckdb";
import { logger } from "../logger/index.js";

export interface Label {
  id?: number;
  uri: string;
  cid?: string;
  val: string;
  neg?: boolean;
  cts: string;
  exp?: string;
  src: string;
}

export class LabelsRepository {
  constructor(private db: Database) {}

  async insert(label: Label): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.prepare(
        `
        INSERT INTO labels (uri, cid, val, neg, cts, exp, src)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (uri, val, cts) DO NOTHING
      `,
        (err, stmt) => {
          if (err) {
            logger.error({ err }, "Failed to prepare label insert statement");
            reject(err);
            return;
          }

          stmt.run(
            label.uri,
            label.cid || null,
            label.val,
            label.neg || false,
            label.cts,
            label.exp || null,
            label.src,
            (err) => {
              if (err) {
                logger.error({ err, label }, "Failed to insert label");
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

  async findByUri(uri: string): Promise<Label[]> {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM labels WHERE uri = $1`, uri, (err, rows: Label[]) => {
        if (err) {
          logger.error({ err, uri }, "Failed to find labels by URI");
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }

  async findByValue(val: string): Promise<Label[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM labels WHERE val = $1 ORDER BY cts DESC`,
        val,
        (err, rows: Label[]) => {
          if (err) {
            logger.error({ err, val }, "Failed to find labels by value");
            reject(err);
            return;
          }
          resolve(rows || []);
        }
      );
    });
  }
}
