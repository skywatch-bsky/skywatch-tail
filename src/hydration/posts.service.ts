import { AtpAgent } from "@atproto/api";
import { Database } from "duckdb";
import { PostsRepository } from "../database/posts.repository.js";
import { BlobProcessor } from "../blobs/processor.js";
import { logger } from "../logger/index.js";
import { config } from "../config/index.js";

export class PostHydrationService {
  private agent: AtpAgent;
  private postsRepo: PostsRepository;
  private blobProcessor: BlobProcessor;

  constructor(db: Database) {
    this.agent = new AtpAgent({ service: `https://${config.bsky.pds}` });
    this.postsRepo = new PostsRepository(db);
    this.blobProcessor = new BlobProcessor(db, this.agent);
  }

  async initialize(): Promise<void> {
    try {
      await this.agent.login({
        identifier: config.bsky.handle,
        password: config.bsky.password,
      });
      logger.info("Post hydration service authenticated");
    } catch (error) {
      logger.error({ error }, "Failed to authenticate post hydration service");
      throw error;
    }
  }

  async hydratePost(uri: string): Promise<void> {
    try {
      const existingPost = await this.postsRepo.findByUri(uri);
      if (existingPost) {
        logger.debug({ uri }, "Post already hydrated, skipping");
        return;
      }

      const uriParts = uri.replace("at://", "").split("/");
      if (uriParts.length !== 3) {
        logger.warn({ uri }, "Invalid post URI format");
        return;
      }

      const [did, collection, rkey] = uriParts;

      const response = await this.agent.com.atproto.repo.getRecord({
        repo: did,
        collection,
        rkey,
      });

      if (!response.success || !response.data.value) {
        logger.warn({ uri }, "Failed to fetch post record");
        return;
      }

      const record = response.data.value as any;

      const isReply = !!record.reply;

      const embeds = record.embed ? [record.embed] : null;

      await this.postsRepo.insert({
        uri,
        did,
        text: record.text || "",
        facets: record.facets || null,
        embeds,
        langs: record.langs || null,
        tags: record.tags || null,
        created_at: record.createdAt,
        is_reply: isReply,
      });

      logger.info({ uri }, "Post hydrated successfully");

      if (embeds) {
        try {
          await this.blobProcessor.processBlobs(uri, embeds);
        } catch (error) {
          logger.warn({ error, uri }, "Failed to process blobs for post");
        }
      }
    } catch (error) {
      logger.error({ error, uri }, "Failed to hydrate post");
      throw error;
    }
  }
}
