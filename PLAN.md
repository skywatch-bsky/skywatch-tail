# Implementation Plan: Skywatch Tail

## Overview
Build a TypeScript/Bun application that subscribes to a Bluesky labeler firehose, captures label events, hydrates associated content (posts/profiles), and stores everything in DuckDB for ML training.

## Architecture

### Core Components

1. **Firehose Subscriber** (`src/firehose/`)
   - WebSocket connection to labeler service
   - DAG-CBOR/CAR decoding using `@atcute/cbor` and `@atcute/car`
   - Label filtering based on `CAPTURE_LABELS` config
   - Event queue management for hydration pipeline

2. **Hydration Service** (`src/hydration/`)
   - Post hydrator: Fetches `app.bsky.feed.post` records via `@atproto/api`
   - Profile hydrator: Fetches `app.bsky.actor.profile` records and resolves handles
   - Blob processor: Extracts blob references from embeds
   - Rate limiting and retry logic for API calls

3. **Blob Handler** (`src/blobs/`)
   - Conditional blob download based on `HYDRATE_BLOBS` flag
   - SHA-256 cryptographic hashing (always computed)
   - Perceptual hashing (pHash) for image similarity (always computed)
   - Storage abstraction: local filesystem or S3
   - Support for images and video blobs

4. **Database Layer** (`src/database/`)
   - DuckDB connection management
   - Schema initialization and migrations
   - **Repository Pattern**: CRUD operations for each entity (labels, posts, etc.) will be encapsulated in a dedicated repository module to isolate data access logic.
   - Transaction handling for atomic writes

5. **Configuration** (`src/config/`)
   - Environment variable parsing with validation (using **Zod**).
   - Creates a single, immutable, type-safe configuration object.
   - Defaults and optional parameters

6. **Logging** (`src/logger/`)
   - Pino logger setup with pretty printing in dev
   - Structured logging for debugging and monitoring

### Architectural Patterns

- **Repository/Data Access Layer (DAL)**: Database interactions will be abstracted into repository modules. Business logic will call these repositories instead of directly querying the database, improving separation of concerns.
- **Dependency Injection (DI)**: Services will receive their dependencies (like other services or database connections) via their constructor. This decouples components and makes unit testing significantly easier by allowing for mock dependencies.

## Data Flow

```
Firehose → Label Event → Filter Check → Hydration Queue
                                              ↓
                                    [Post OR Profile Hydration]
                                              ↓
                                    Extract Blob References
                                              ↓
                            [Compute Hashes / Optional Download]
                                              ↓
                                    Store in DuckDB
```

## Implementation Phases

*Testing will be conducted throughout each phase, not just at the end. Unit and integration tests should be written as components are built.*

*Commit changes after each phase passes testing to allow for easy rollback and debugging.*

### Phase 1: Foundation (Core Infrastructure)
**Goal**: Set up project structure, dependencies, and basic configuration.

- [x] Initialize TypeScript/Bun project
- [ ] Set up Docker and docker-compose.yml
- [ ] Implement type-safe configuration (`src/config`) using Zod.
- [ ] Initialize Pino logger (`src/logger`)
- [ ] Set up DuckDB connection and schema (`src/database`)
- [ ] **Test**: Write integration tests for database connection and schema validation.

**Deliverables**:
- Working Docker setup with volume mounts.
- Type-safe configuration loading and validation.
- Database schema initialized and tested.

### Phase 2: Firehose Connection
**Goal**: Connect to labeler firehose and parse label events.

- [ ] Implement WebSocket client for `com.atproto.label.subscribeLabels`.
- [ ] Implement DAG-CBOR decoding of label events.
- [ ] Implement label filtering logic.
- [ ] Store raw labels in the database using the Label Repository.
- [ ] Implement connection recovery and error handling.
- [ ] **Test**: Write unit tests for the decoder and filter. Write integration tests for firehose connection and data insertion.

**Deliverables**:
- Labels flowing from firehose into the database.
- Filter working correctly.
- Stable reconnection logic.

### Phase 3: Content Hydration
**Goal**: Fetch and store post and profile data.

- [ ] Implement post and profile hydration services (`src/hydration`).
- [ ] Use the Post and Profile Repositories to store data.
- [ ] Link hydrated content to labels via URI/DID.
- [ ] **Test**: Write unit tests for the data extraction and transformation logic.

**Deliverables**:
- Posts and profiles are automatically hydrated when labels are received.
- Data is correctly stored and linked in the database.

### Phase 4: Blob Processing
**Goal**: Handle image/video blobs with hashing and optional download.

- [ ] Implement blob processor to extract blob references.
- [ ] Implement hashing utilities (SHA-256, pHash).
- [ ] Implement conditional blob download and storage (local and S3).
- [ ] Use the Blob Repository to store metadata.
- [ ] **Test**: Write unit tests for hashing logic and integration tests for storage mechanisms.

**Deliverables**:
- Both hash types are captured for all blobs.
- Optional blob download works for both local and S3 storage.
- Blob metadata is linked to posts.

### Phase 5: Rate Limiting & Optimization
**Goal**: Ensure API compliance and performance.

- [ ] Implement a rate-limiting utility using a token bucket or similar algorithm.
- [ ] Integrate rate limiting into the hydration service.
- [ ] Implement a robust hydration queue.
- [ ] Add retry logic with exponential backoff for API calls.
- [ ] **Test**: Write unit tests for the rate limiter and retry logic.

**Deliverables**:
- No API rate limit violations under normal operation.
- Efficient resource usage and observable performance metrics.

### Phase 6: Final Testing & Validation
**Goal**: Ensure end-to-end reliability and expand test coverage.

- [ ] Implement end-to-end tests using a mock firehose.
- [ ] Conduct validation testing with a real labeler firehose.
- [ ] Review and improve test coverage, aiming for >80% on critical paths.
- [ ] Validate schema integrity and data relationships.
- [ ] Test and finalize Docker deployment.

**Deliverables**:
- High test coverage for critical paths.
- Docker deployment verified.
- End-to-end validation complete.

### Phase 7: Documentation & Portability
**Goal**: Make it easy for others to use.

- [ ] Write a comprehensive README with setup and deployment instructions.
- [ ] Create a fully commented `.env.example` file.
- [ ] Document the database schema.
- [ ] Provide a troubleshooting guide.

**Deliverables**:
- A new user can clone, configure, and run the application with minimal effort.

## Technical Decisions

### Why DuckDB?
- Embedded database (no separate server)
- Excellent analytics performance
- Easy to backup (single file)
- Great for ML pipelines
- JSON column support for complex fields

### Why Bun?
- Fast TypeScript runtime
- Native support for TypeScript, JSX, and Web APIs (like WebSocket).
- All-in-one toolchain (runtime, bundler, test runner).

### Blob Storage Strategy
- **Always compute hashes**: Even if not downloading, we need SHA-256 and pHash for data fingerprinting.
- **Conditional download**: A critical safety feature, especially when dealing with CSAM or other sensitive content labels.
- **Storage abstraction**: Allows for easy extension to other storage backends in the future.

### Rate Limiting Approach
- Track API calls per endpoint.
- Implement a token bucket algorithm to manage request rates.
- Queue hydration requests and process them according to rate limits.
- Prioritize queue based on label timestamp (FIFO).

## Risk Mitigation

### Firehose Disconnection
- Implement automatic reconnection with exponential backoff.
- **Persist last processed cursor to a local file (`cursor.txt`) to allow for seamless resume capability.**
- Log all disconnection and reconnection events for monitoring.

### API Rate Limits
- Implement conservative rate limiting to stay well under official limits.
- Graceful degradation: The hydration queue will grow if limits are hit, but the application will not crash.
- Monitor queue depth and API response headers.

### Blob Safety
- `HYDRATE_BLOBS=false` by default to prevent accidental download of sensitive material.
- Provide clear documentation about the risks of enabling blob hydration.
- Hashes are computed from metadata or partial reads where possible, without downloading the full blob unless required.

### Data Integrity
- Use atomic database transactions for related inserts (e.g., a label and its hydrated post).
- Enforce data integrity with foreign key constraints in the database schema.
- Perform validation before writing data to the database.

## Project Structure

```
skywatch-capture/
├── src/
│   ├── index.ts                 # Main entry point
│   ├── config/
│   │   └── index.ts            # Configuration object (with Zod validation)
│   ├── logger/
│   │   └── index.ts            # Pino logger setup
│   ├── database/
│   │   ├── connection.ts       # DuckDB connection
│   │   ├── schema.ts           # Table definitions
│   │   ├── labels.repository.ts # Label repository
│   │   ├── posts.repository.ts  # Post repository
│   │   ├── profiles.repository.ts# Profile repository
│   │   └── blobs.repository.ts  # Blob repository
│   ├── firehose/
│   │   ├── subscriber.ts       # WebSocket client
│   │   ├── decoder.ts          # CBOR decoding
│   │   └── filter.ts           # Label filtering
│   ├── hydration/
│   │   ├── posts.service.ts    # Post hydration service
│   │   ├── profiles.service.ts # Profile hydration service
│   │   └── queue.ts            # Hydration queue
│   ├── blobs/
│   │   ├── processor.ts        # Blob extraction
│   │   ├── hasher.ts           # SHA-256 & pHash
│   │   ├── downloader.ts       # Blob download
│   │   └── storage/
│   │       ├── local.ts        # Local filesystem storage
│   │       └── s3.ts           # S3 storage
│   └── utils/
│       ├── rate-limit.ts       # Rate limiting
│       └── retry.ts            # Retry logic
├── tests/
│   ├── unit/
│   └── integration/
├── data/                        # Volume mount point
│   ├── skywatch.duckdb         # Database file
│   ├── cursor.txt              # Last processed firehose cursor
│   └── blobs/                  # Local blob storage
├── .env.example
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

## Dependencies

### Core
- `bun` - Runtime & Test Runner
- `typescript` - Language
- `@atproto/api` - Bluesky API client
- `@atcute/cbor` - CBOR decoding
- `@atcute/car` - CAR file handling
- `duckdb` - Database
- `pino` & `pino-pretty` - Logging
- `dotenv` - Environment variables
- `zod` - Type-safe validation

### Blob Processing
- `crypto` (built-in) - SHA-256 hashing
- `sharp` or `jimp` - Image processing for pHash
- `@aws-sdk/client-s3` - S3 storage (optional)

### Testing
- `@types/*` - TypeScript definitions

## Success Criteria

1. ✅ Successfully connects to labeler firehose
2. ✅ Correctly parses and stores label events
3. ✅ Hydrates posts and profiles automatically
4. ✅ Computes both SHA-256 and pHash for all blobs
5. ✅ Conditionally downloads blobs based on config
6. ✅ Stores all data in DuckDB with proper relationships
7. ✅ Respects API rate limits
8. ✅ Handles disconnections gracefully
9. ✅ Runs in Docker with persistent storage
10. ✅ Configurable via environment variables
11. ✅ Documented and portable

## Timeline Estimate

- Phase 1: 1-2 days
- Phase 2: 2-3 days
- Phase 3: 2-3 days
- Phase 4: 3-4 days
- Phase 5: 2-3 days
- Phase 6: 2-3 days
- Phase 7: 1-2 days

**Total**: ~13-20 days for complete implementation

## Next Steps

1. Review and approve this plan
2. Set up development environment
3. Begin Phase 1 implementation
4. Iterate based on testing and feedback
