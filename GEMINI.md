# Project Overview

This project, Skywatch Capture, is a TypeScript-based application designed to monitor and process moderation labels from a Bluesky PDI labeler service. It connects to a firehose endpoint via WebSockets, listens for label events, and automatically adds or removes users from specified Bluesky lists based on these events. The primary goal is to automate moderation list management.

## Key Technologies

*   **Language:** TypeScript
*   **Runtime:** Node.js (or Bun, as specified in the PRD)
*   **Core Libraries:**
    *   `@atproto/api`: For Bluesky API interactions (authentication, list management).
    *   `@atcute/cbor`: For decoding the DAG-CBOR data from the firehose.
    *   `pino`: For structured logging.
    *   `p-ratelimit`: To manage and respect Bluesky API rate limits.
    *   `undici`: As the HTTP client.
    *   `dotenv`: For managing environment variables.

## Architecture

The application is structured as follows:

1.  **Firehose Connector (`src/firehose.ts`):** Establishes and maintains a WebSocket connection to the labeler's firehose URL. It includes logic for handling reconnects and persisting the stream position (`cursor`) to a local file (`cursor.txt`).
2.  **Event Processor (`src/firehose.ts`):** Parses incoming messages, extracts label events, and determines the appropriate action (add or remove from a list).
3.  **List Manager (`src/listmanager.ts`):** (Inferred) Contains the logic to add or remove a user (`did`) from a specific Bluesky list.
4.  **ATProto Agent (`src/agent.ts`):** Manages authentication with the Bluesky network using credentials provided via environment variables.
5.  **Rate Limiter (`src/limits.ts`):** Implements a rate limit to ensure the application does not exceed the Bluesky API's request limits.
6.  **Configuration:** The application is configured through a `.env` file.

# Building and Running

While a `package.json` was not present for analysis, the following steps can be inferred from the source code and PRD.

## 1. Installation

```bash
# Using npm
npm install

# Or using Bun
bun install
```

## 2. Configuration

Create a `.env` file in the root of the project with the following variables:

```env
# Bluesky Credentials
BSKY_HANDLE=your-bluesky-handle.bsky.social
BSKY_PASSWORD=your-app-password

# Bluesky PDS and Labeler URL
PDS=bsky.social
WSS_URL=wss://your-labeler-service.com/xrpc/com.atproto.label.subscribeLabels

# Optional: Logging Level
LOG_LEVEL=info
```

## 3. Running the Application

The entry point of the application calls `startFirehose()` from `src/firehose.ts`. A typical run command would be defined in `package.json`'s `scripts` section.

```bash
# Example run command (if defined in package.json)
npm run start

# Or using Bun
bun run start
```

## 4. Running with Docker

The PRD specifies the use of Docker and Docker Compose. A `docker-compose.yml` file would orchestrate the application and any database services.

```bash
# Build and start the services
docker-compose up --build -d
```

# Development Conventions

*   **Modularity:** The code is organized into distinct modules based on functionality (e.g., `agent`, `firehose`, `logger`).
*   **Error Handling:** The firehose client includes robust error handling and a reconnect strategy with exponential backoff.
*   **State Persistence:** The firehose stream position is saved to `cursor.txt` to allow the application to resume from where it left off after a restart.
*   **Idempotency:** A Redis cache is used (inferred from `src/redis.ts`) to track processed events, preventing duplicate actions for the same label event.
*   **Logging:** Structured logging is implemented using `pino`, with `pino-pretty` for development environments to improve readability.
