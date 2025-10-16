import { AtpAgent } from "@atproto/api";
import { Database } from "duckdb";
import { ProfilesRepository } from "../database/profiles.repository.js";
import { logger } from "../logger/index.js";
import { config } from "../config/index.js";

export class ProfileHydrationService {
  private agent: AtpAgent;
  private profilesRepo: ProfilesRepository;

  constructor(db: Database) {
    this.agent = new AtpAgent({ service: `https://${config.bsky.pds}` });
    this.profilesRepo = new ProfilesRepository(db);
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

      const profileResponse = await this.agent.com.atproto.repo.getRecord({
        repo: did,
        collection: "app.bsky.actor.profile",
        rkey: "self",
      });

      let displayName: string | undefined;
      let description: string | undefined;

      if (profileResponse.success && profileResponse.data.value) {
        const record = profileResponse.data.value as any;
        displayName = record.displayName;
        description = record.description;
      }

      const profileLookup = await this.agent.getProfile({ actor: did });

      let handle: string | undefined;
      if (profileLookup.success) {
        handle = profileLookup.data.handle;
      }

      await this.profilesRepo.insert({
        did,
        handle,
        display_name: displayName,
        description,
      });

      logger.info({ did, handle }, "Profile hydrated successfully");
    } catch (error) {
      logger.error({ error, did }, "Failed to hydrate profile");
      throw error;
    }
  }
}
