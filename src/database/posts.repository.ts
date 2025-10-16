import { Database } from "duckdb";
import { logger } from "../logger/index.js";

export interface Post {
  uri: string;
  did: string;
  text?: string;
  facets?: any;
  embeds?: any;
  langs?: string[];
  tags?: string[];
  created_at: string;
  is_reply?: boolean;
}

export class PostsRepository {
  constructor(private db: Database) {}

  async insert(post: Post): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.prepare(
        `
        INSERT INTO posts (uri, did, text, facets, embeds, langs, tags, created_at, is_reply)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (uri) DO UPDATE SET
          text = EXCLUDED.text,
          facets = EXCLUDED.facets,
          embeds = EXCLUDED.embeds,
          langs = EXCLUDED.langs,
          tags = EXCLUDED.tags
      `,
        (err, stmt) => {
          if (err) {
            logger.error({ err }, "Failed to prepare post insert statement");
            reject(err);
            return;
          }

          stmt.run(
            post.uri,
            post.did,
            post.text || null,
            post.facets ? JSON.stringify(post.facets) : null,
            post.embeds ? JSON.stringify(post.embeds) : null,
            post.langs ? JSON.stringify(post.langs) : null,
            post.tags ? JSON.stringify(post.tags) : null,
            post.created_at,
            post.is_reply || false,
            (err) => {
              if (err) {
                logger.error({ err, post }, "Failed to insert post");
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

  async findByUri(uri: string): Promise<Post | null> {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM posts WHERE uri = $1`, uri, (err, rows: Post[]) => {
        if (err) {
          logger.error({ err, uri }, "Failed to find post by URI");
          reject(err);
          return;
        }
        resolve(rows?.[0] || null);
      });
    });
  }

  async findByDid(did: string, limit = 100): Promise<Post[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM posts WHERE did = $1 ORDER BY created_at DESC LIMIT $2`,
        did,
        limit,
        (err, rows: Post[]) => {
          if (err) {
            logger.error({ err, did }, "Failed to find posts by DID");
            reject(err);
            return;
          }
          resolve(rows || []);
        }
      );
    });
  }
}
