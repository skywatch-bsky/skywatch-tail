import { config } from "./config/index.js";
import { logger } from "./logger/index.js";
import {
  initializeDatabase,
  closeDatabase,
  getDatabase,
} from "./database/connection.js";
import { initializeSchema } from "./database/schema.js";
import { LabelsRepository } from "./database/labels.repository.js";
import { FirehoseSubscriber } from "./firehose/subscriber.js";
import { PostHydrationService } from "./hydration/posts.service.js";
import { ProfileHydrationService } from "./hydration/profiles.service.js";
import { HydrationQueue } from "./hydration/queue.js";

async function main() {
  logger.info("Starting Skywatch Tail...");

  try {
    await initializeDatabase();
    await initializeSchema();

    const db = getDatabase();
    const labelsRepo = new LabelsRepository(db);

    const postHydration = new PostHydrationService(db);
    const profileHydration = new ProfileHydrationService(db);
    const hydrationQueue = new HydrationQueue();

    await postHydration.initialize();
    await profileHydration.initialize();

    hydrationQueue.on("task", async (task) => {
      try {
        if (task.type === "post") {
          await postHydration.hydratePost(task.identifier);
        } else if (task.type === "profile") {
          await profileHydration.hydrateProfile(task.identifier);
        }
      } catch (error) {
        logger.error({ error, task }, "Hydration task failed");
      }
    });

    const subscriber = new FirehoseSubscriber();

    subscriber.on("label", async (label) => {
      try {
        logger.info({ uri: label.uri, val: label.val }, "Received label");

        await labelsRepo.insert({
          uri: label.uri,
          cid: label.cid,
          val: label.val,
          neg: label.neg || false,
          cts: label.cts,
          exp: label.exp,
          src: label.src,
        });

        logger.debug({ uri: label.uri }, "Label stored");

        if (label.uri.startsWith("at://")) {
          const uriParts = label.uri.replace("at://", "").split("/");

          if (uriParts.length === 3) {
            hydrationQueue.enqueue({
              type: "post",
              identifier: label.uri,
            });
          } else if (uriParts.length === 1) {
            hydrationQueue.enqueue({
              type: "profile",
              identifier: label.uri.replace("at://", ""),
            });
          }
        } else if (label.uri.startsWith("did:")) {
          hydrationQueue.enqueue({
            type: "profile",
            identifier: label.uri,
          });
        }
      } catch (error) {
        logger.error({ error, label }, "Failed to process label");
      }
    });

    subscriber.on("error", (error) => {
      logger.error({ error }, "Firehose error");
    });

    subscriber.on("connected", () => {
      logger.info("Firehose connected");
    });

    subscriber.on("disconnected", () => {
      logger.warn("Firehose disconnected");
    });

    await subscriber.start();

    logger.info("Application ready and subscribed to firehose");

    process.on("SIGINT", async () => {
      logger.info("Shutting down gracefully...");
      subscriber.stop();
      hydrationQueue.clear();
      await closeDatabase();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      logger.info("Shutting down gracefully...");
      subscriber.stop();
      hydrationQueue.clear();
      await closeDatabase();
      process.exit(0);
    });
  } catch (error) {
    logger.error({ error }, "Failed to start application");
    process.exit(1);
  }
}

main();
