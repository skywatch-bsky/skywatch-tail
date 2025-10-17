import { AtpAgent } from "@atproto/api";
import { Database } from "duckdb";
import { ProfilesRepository } from "../database/profiles.repository.js";
import { ProfileBlobsRepository } from "../database/profile-blobs.repository.js";
import { computeBlobHashes } from "../blobs/hasher.js";
import { pRateLimit } from "p-ratelimit";
import { withRetry, isRateLimitError, isNetworkError, isServerError } from "../utils/retry.js";
import { logger } from "../logger/index.js";
import { config } from "../config/index.js";

export class ProfileHydrationService {
  private agent: AtpAgent;
  private profilesRepo: ProfilesRepository;
  private profileBlobsRepo: ProfileBlobsRepository;
  private limit: ReturnType<typeof pRateLimit>;

  constructor(db: Database) {
    this.agent = new AtpAgent({ service: `https://${config.bsky.pds}` });
    this.profilesRepo = new ProfilesRepository(db);
    this.profileBlobsRepo = new ProfileBlobsRepository(db);
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
      const needsRehydration = existingProfile && (existingProfile.avatar_cid === null || existingProfile.banner_cid === null);

      if (existingProfile && !needsRehydration) {
        logger.debug({ did }, "Profile already fully hydrated, skipping");
        return;
      }

      if (needsRehydration) {
        logger.debug({ did }, "Re-hydrating profile to fetch avatar/banner CIDs");
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

        if (record.avatar?.ref) {
          avatarCid = record.avatar.ref.toString();
        } else {
          avatarCid = "";
        }

        if (record.banner?.ref) {
          bannerCid = record.banner.ref.toString();
        } else {
          bannerCid = "";
        }

        logger.debug({ did, avatarCid, bannerCid, hasAvatar: !!record.avatar, hasBanner: !!record.banner }, "Extracted CIDs from profile record");
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

      if (avatarCid && avatarCid !== "") {
        try {
          await this.processProfileBlob(did, avatarCid, "avatar");
        } catch (error) {
          logger.warn({ error, did, avatarCid }, "Failed to process avatar blob");
        }
      }

      if (bannerCid && bannerCid !== "") {
        try {
          await this.processProfileBlob(did, bannerCid, "banner");
        } catch (error) {
          logger.warn({ error, did, bannerCid }, "Failed to process banner blob");
        }
      }

      logger.info({ did, handle, avatarCid, bannerCid }, "Profile hydrated successfully");
    } catch (error) {
      logger.error({ error, did }, "Failed to hydrate profile");
      throw error;
    }
  }

  private async resolvePds(did: string): Promise<string | null> {
    try {
      const didDocResponse = await fetch(`${config.plc.endpoint}/${did}`);
      if (!didDocResponse.ok) {
        logger.warn({ did, status: didDocResponse.status }, "Failed to fetch DID document");
        return null;
      }

      const didDoc = await didDocResponse.json();
      const pdsService = didDoc.service?.find((s: any) =>
        s.id === "#atproto_pds" && s.type === "AtprotoPersonalDataServer"
      );

      if (!pdsService?.serviceEndpoint) {
        logger.warn({ did }, "No PDS endpoint found in DID document");
        return null;
      }

      return pdsService.serviceEndpoint;
    } catch (error) {
      logger.error({ error, did }, "Failed to resolve PDS from DID");
      return null;
    }
  }

  private async processProfileBlob(
    did: string,
    cid: string,
    type: "avatar" | "banner"
  ): Promise<void> {
    const existing = await this.profileBlobsRepo.findByDid(did);
    const existingBlob = existing.find(b => b.blob_type === type && b.blob_cid === cid);

    if (existingBlob) {
      logger.debug({ did, cid, type }, "Blob already processed, skipping");
      return;
    }

    const pdsEndpoint = await this.resolvePds(did);
    if (!pdsEndpoint) {
      logger.warn({ did, cid, type }, "Cannot fetch blob without PDS endpoint");
      return;
    }

    const blobUrl = `${pdsEndpoint}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${cid}`;
    const blobResponse = await fetch(blobUrl);

    if (!blobResponse.ok) {
      logger.warn({ did, cid, type, pdsEndpoint, status: blobResponse.status }, "Failed to fetch blob from PDS");
      return;
    }

    const blobData = Buffer.from(await blobResponse.arrayBuffer());
    const hashes = await computeBlobHashes(blobData, "image/jpeg");

    await this.profileBlobsRepo.insert({
      did,
      blob_type: type,
      blob_cid: cid,
      sha256: hashes.sha256,
      phash: hashes.phash,
      mimetype: "image/jpeg",
    });

    logger.info({ did, cid, type, sha256: hashes.sha256, pdsEndpoint }, "Profile blob processed successfully");
  }
}
