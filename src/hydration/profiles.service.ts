import { AtpAgent } from "@atproto/api";
import { Database } from "duckdb";
import { ProfilesRepository } from "../database/profiles.repository.js";
import { BlobProcessor } from "../blobs/processor.js";
import { pRateLimit } from "p-ratelimit";
import { withRetry, isRateLimitError, isNetworkError, isServerError } from "../utils/retry.js";
import { logger } from "../logger/index.js";
import { config } from "../config/index.js";

export class ProfileHydrationService {
  private agent: AtpAgent;
  private profilesRepo: ProfilesRepository;
  private blobProcessor: BlobProcessor;
  private limit: ReturnType<typeof pRateLimit>;

  constructor(db: Database) {
    this.agent = new AtpAgent({ service: `https://${config.bsky.pds}` });
    this.profilesRepo = new ProfilesRepository(db);
    this.blobProcessor = new BlobProcessor(db, this.agent);
    this.limit = pRateLimit({
      interval: 300000,
      rate: 3000,
      concurrency: 48,
      maxDelay: 60000,
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.agent.login({
        identifier: config.bsky.handle,
        password: config.bsky.password,
      });
      logger.info("Profile hydration service authenticated");
    } catch (error) {
      logger.error({ error }, "Failed to authenticate profile hydration service");
      throw error;
    }
  }

  async hydrateProfile(did: string): Promise<void> {
    try {
      const existingProfile = await this.profilesRepo.findByDid(did);
      if (existingProfile) {
        logger.debug({ did }, "Profile already hydrated, skipping");
        return;
      }

      const profileResponse = await this.limit(() =>
        withRetry(
          async () => {
            return await this.agent.com.atproto.repo.getRecord({
              repo: did,
              collection: "app.bsky.actor.profile",
              rkey: "self",
            });
          },
          {
            maxAttempts: 3,
            initialDelay: 1000,
            maxDelay: 10000,
            backoffMultiplier: 2,
            retryableErrors: [
              isRateLimitError,
              isNetworkError,
              isServerError,
            ],
          }
        )
      );

      let displayName: string | undefined;
      let description: string | undefined;
      let avatarCid: string | undefined;
      let bannerCid: string | undefined;

      if (profileResponse.success && profileResponse.data.value) {
        const record = profileResponse.data.value as any;
        displayName = record.displayName;
        description = record.description;

        if (record.avatar?.ref?.$link) {
          avatarCid = record.avatar.ref.$link;
        }
        if (record.banner?.ref?.$link) {
          bannerCid = record.banner.ref.$link;
        }
      }

      const profileLookup = await this.limit(() =>
        withRetry(
          async () => {
            return await this.agent.getProfile({ actor: did });
          },
          {
            maxAttempts: 3,
            initialDelay: 1000,
            maxDelay: 10000,
            backoffMultiplier: 2,
            retryableErrors: [
              isRateLimitError,
              isNetworkError,
              isServerError,
            ],
          }
        )
      );

      let handle: string | undefined;
      if (profileLookup.success) {
        handle = profileLookup.data.handle;
      }

      await this.profilesRepo.insert({
        did,
        handle,
        display_name: displayName,
        description,
        avatar_cid: avatarCid,
        banner_cid: bannerCid,
      });

      if (avatarCid) {
        try {
          await this.blobProcessor.processBlobs(`profile://${did}/avatar`, [
            {
              images: [
                {
                  image: {
                    ref: { $link: avatarCid },
                    mimeType: "image/jpeg",
                  },
                },
              ],
            },
          ]);
        } catch (error) {
          logger.warn({ error, did }, "Failed to process avatar blob");
        }
      }

      if (bannerCid) {
        try {
          await this.blobProcessor.processBlobs(`profile://${did}/banner`, [
            {
              images: [
                {
                  image: {
                    ref: { $link: bannerCid },
                    mimeType: "image/jpeg",
                  },
                },
              ],
            },
          ]);
        } catch (error) {
          logger.warn({ error, did }, "Failed to process banner blob");
        }
      }

      logger.info({ did, handle, avatarCid, bannerCid }, "Profile hydrated successfully");
    } catch (error) {
      logger.error({ error, did }, "Failed to hydrate profile");
      throw error;
    }
  }
}
