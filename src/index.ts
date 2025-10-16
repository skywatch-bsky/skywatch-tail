import { config } from "./config/index.js";
import { logger } from "./logger/index.js";
import { initializeDatabase, closeDatabase, getDatabase } from "./database/connection.js";
import { initializeSchema } from "./database/schema.js";
import { LabelsRepository } from "./database/labels.repository.js";
import { FirehoseSubscriber } from "./firehose/subscriber.js";

async function main() {
  logger.info("Starting Skywatch Tail...");

  try {
    await initializeDatabase();
    await initializeSchema();

    const db = getDatabase();
    const labelsRepo = new LabelsRepository(db);

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
      } catch (error) {
        logger.error({ error, label }, "Failed to store label");
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
      await closeDatabase();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      logger.info("Shutting down gracefully...");
      subscriber.stop();
      await closeDatabase();
      process.exit(0);
    });
  } catch (error) {
    logger.error({ error }, "Failed to start application");
    process.exit(1);
  }
}

main();
