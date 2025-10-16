import { config } from "./config/index.js";
import { logger } from "./logger/index.js";
import { initializeDatabase, closeDatabase } from "./database/connection.js";
import { initializeSchema } from "./database/schema.js";

async function main() {
  logger.info("Starting Skywatch Tail...");

  try {
    await initializeDatabase();
    await initializeSchema();

    logger.info("Initialization complete. Application ready.");

    process.on("SIGINT", async () => {
      logger.info("Shutting down gracefully...");
      await closeDatabase();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      logger.info("Shutting down gracefully...");
      await closeDatabase();
      process.exit(0);
    });
  } catch (error) {
    logger.error({ error }, "Failed to start application");
    process.exit(1);
  }
}

main();
