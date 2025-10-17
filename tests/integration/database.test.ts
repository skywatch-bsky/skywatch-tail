import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "duckdb";
import { initializeSchema } from "../../src/database/schema.js";
import { LabelsRepository } from "../../src/database/labels.repository.js";
import { PostsRepository } from "../../src/database/posts.repository.js";
import { ProfilesRepository } from "../../src/database/profiles.repository.js";
import { BlobsRepository } from "../../src/database/blobs.repository.js";

describe("Database Integration Tests", () => {
  let db: Database;
  let labelsRepo: LabelsRepository;
  let postsRepo: PostsRepository;
  let profilesRepo: ProfilesRepository;
  let blobsRepo: BlobsRepository;

  beforeAll(async () => {
    db = new Database(":memory:");

    await new Promise<void>((resolve, reject) => {
      db.exec(
        `
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

        CREATE TABLE IF NOT EXISTS profiles (
          did TEXT PRIMARY KEY,
          handle TEXT,
          display_name TEXT,
          description TEXT,
          avatar_cid TEXT,
          banner_cid TEXT
        );

        CREATE TABLE IF NOT EXISTS blobs (
          post_uri TEXT NOT NULL,
          blob_cid TEXT NOT NULL,
          sha256 TEXT NOT NULL,
          phash TEXT,
          storage_path TEXT,
          mimetype TEXT,
          PRIMARY KEY (post_uri, blob_cid)
        );
      `,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    labelsRepo = new LabelsRepository(db);
    postsRepo = new PostsRepository(db);
    profilesRepo = new ProfilesRepository(db);
    blobsRepo = new BlobsRepository(db);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      db.close(() => resolve());
    });
  });

  describe("LabelsRepository", () => {
    test("should insert and retrieve a label", async () => {
      const label = {
        uri: "at://did:plc:test/app.bsky.feed.post/123",
        val: "spam",
        cts: "2025-01-15T12:00:00Z",
        src: "did:plc:labeler",
      };

      await labelsRepo.insert(label);
      const found = await labelsRepo.findByUri(label.uri);

      expect(found.length).toBe(1);
      expect(found[0].val).toBe("spam");
    });

    test("should find labels by value", async () => {
      const labels = await labelsRepo.findByValue("spam");
      expect(labels.length).toBeGreaterThan(0);
    });
  });

  describe("PostsRepository", () => {
    test("should insert and retrieve a post", async () => {
      const post = {
        uri: "at://did:plc:user/app.bsky.feed.post/abc123",
        did: "did:plc:user",
        text: "test post",
        created_at: "2025-01-15T12:00:00Z",
        is_reply: false,
      };

      await postsRepo.insert(post);
      const found = await postsRepo.findByUri(post.uri);

      expect(found).not.toBeNull();
      expect(found?.text).toBe("test post");
    });

    test("should find posts by DID", async () => {
      const posts = await postsRepo.findByDid("did:plc:user");
      expect(posts.length).toBeGreaterThan(0);
    });
  });

  describe("ProfilesRepository", () => {
    test("should insert and retrieve a profile", async () => {
      const profile = {
        did: "did:plc:testuser",
        handle: "testuser.bsky.social",
        display_name: "Test User",
        description: "A test user",
      };

      await profilesRepo.insert(profile);
      const found = await profilesRepo.findByDid(profile.did);

      expect(found).not.toBeNull();
      expect(found?.handle).toBe("testuser.bsky.social");
    });

    test("should find profile by handle", async () => {
      const found = await profilesRepo.findByHandle("testuser.bsky.social");
      expect(found).not.toBeNull();
      expect(found?.did).toBe("did:plc:testuser");
    });

    test("should insert and retrieve profile with avatar and banner", async () => {
      const profile = {
        did: "did:plc:testuser2",
        handle: "testuser2.bsky.social",
        display_name: "Test User 2",
        description: "A test user with avatar",
        avatar_cid: "bafyavatartest",
        banner_cid: "bafybannertest",
      };

      await profilesRepo.insert(profile);
      const found = await profilesRepo.findByDid(profile.did);

      expect(found).not.toBeNull();
      expect(found?.avatar_cid).toBe("bafyavatartest");
      expect(found?.banner_cid).toBe("bafybannertest");
    });
  });

  describe("BlobsRepository", () => {
    test("should insert and retrieve a blob", async () => {
      const blob = {
        post_uri: "at://did:plc:user/app.bsky.feed.post/abc123",
        blob_cid: "bafytest123",
        sha256: "abc123def456",
        phash: "deadbeef",
        mimetype: "image/jpeg",
      };

      await blobsRepo.insert(blob);
      const found = await blobsRepo.findByPostUri(blob.post_uri);

      expect(found.length).toBe(1);
      expect(found[0].sha256).toBe("abc123def456");
    });

    test("should find blob by SHA256", async () => {
      const found = await blobsRepo.findBySha256("abc123def456");
      expect(found).not.toBeNull();
      expect(found?.blob_cid).toBe("bafytest123");
    });

    test("should find blobs by pHash", async () => {
      const found = await blobsRepo.findByPhash("deadbeef");
      expect(found.length).toBeGreaterThan(0);
    });
  });
});
