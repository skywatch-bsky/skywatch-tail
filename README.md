# Skywatch Tail

A high-performance label capture and content hydration service for Bluesky moderation systems. Subscribe to a labeler's firehose, capture label events, and automatically hydrate associated content for machine learning training.

## Features

- **Real-time Label Capture**: Subscribe to any Bluesky labeler's firehose via WebSocket
- **Automatic Content Hydration**: Fetch full post records and user profiles for labeled content
- **Blob Processing**: SHA-256 and perceptual hashing for images/videos with optional download
- **Intelligent Filtering**: Optionally filter labels by type to capture only what you need
- **Rate Limiting**: Respects Bluesky API limits (3000 req/5min) with p-ratelimit
- **Retry Logic**: Automatic retry with exponential backoff for transient failures
- **Cursor Persistence**: Resume from where you left off after restarts
- **Automatic Reconnection**: Exponential backoff reconnection (1s-60s) for stability
- **DuckDB Storage**: Embedded analytics database optimized for ML pipelines
- **Docker Ready**: Containerized deployment with volume persistence
- **Type-Safe**: Full TypeScript implementation with Zod validation

## Architecture

```
Firehose → Label Event → Filter → Store Label → Hydration Queue
                                        ↓              ↓
                                   DuckDB ← [Post/Profile Fetch] → Blob Processing
                                                                         ↓
                                                                    Hash + Store
```

### Components

- **Firehose Subscriber**: WebSocket client with DAG-CBOR decoding
- **Label Filter**: Configurable allow-list for label types
- **Hydration Services**: Automatic post and profile data fetching with rate limiting
- **Blob Processor**: SHA-256 and perceptual hash computation with optional download
- **Hydration Queue**: Async queue with deduplication
- **Rate Limiter**: p-ratelimit enforcing 3000 requests per 5 minutes
- **Retry Logic**: Exponential backoff for transient failures
- **Repository Layer**: Clean database abstraction for all entities

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Bluesky account with app password
- Access to a labeler firehose endpoint

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd skywatch-tail
```

2. Copy the example environment file:
```bash
cp .env.example .env
```

3. Configure your `.env` file:
```env
# Bluesky Credentials
BSKY_HANDLE=your-handle.bsky.social
BSKY_PASSWORD=your-app-password

# Labeler Configuration
WSS_URL=wss://your-labeler.com/xrpc/com.atproto.label.subscribeLabels

# Optional: Filter specific labels
CAPTURE_LABELS=spam,hate-speech

# Logging
LOG_LEVEL=info
```

4. Start with Docker Compose:
```bash
docker-compose up -d
```

### Local Development

Install dependencies with Bun:
```bash
bun install
```

Run in development mode:
```bash
bun run dev
```

Run tests:
```bash
bun test
```

## Configuration

All configuration is managed via environment variables:

### Required

- `BSKY_HANDLE`: Your Bluesky handle
- `BSKY_PASSWORD`: App password (not your main password)
- `WSS_URL`: Labeler firehose WebSocket URL

### Optional

- `PDS`: Bluesky PDS host (default: `bsky.social`)
- `CAPTURE_LABELS`: Comma-separated list of label values to capture
- `DB_PATH`: Path to DuckDB database file (default: `./data/skywatch.duckdb`)
- `LOG_LEVEL`: Logging level (default: `info`)
- `HYDRATE_BLOBS`: Enable blob download (default: `false`)
- `BLOB_STORAGE_TYPE`: Storage backend for blobs (`local` or `s3`)
- `BLOB_STORAGE_PATH`: Local path for blob storage (default: `./data/blobs`)

### S3 Configuration (Optional)

- `S3_BUCKET`: S3 bucket name
- `S3_REGION`: AWS region
- `AWS_ACCESS_KEY_ID`: AWS access key
- `AWS_SECRET_ACCESS_KEY`: AWS secret key

## Database Schema

### Labels Table
Stores raw label events from the firehose.

- `id`: Auto-incrementing primary key
- `uri`: AT-URI or DID of labeled content
- `cid`: Content identifier (optional)
- `val`: Label value (e.g., "spam")
- `neg`: Negation flag
- `cts`: Created timestamp
- `exp`: Expiration timestamp (optional)
- `src`: Labeler DID

### Posts Table
Hydrated post data for labeled content.

- `uri`: AT-URI (primary key)
- `did`: Author DID
- `text`: Post content
- `facets`: Rich text annotations (JSON)
- `embeds`: Embedded content (JSON)
- `langs`: Language codes (JSON)
- `tags`: Hashtags (JSON)
- `created_at`: Post creation timestamp
- `is_reply`: Reply flag

### Profiles Table
Hydrated user profile data.

- `did`: User DID (primary key)
- `handle`: User handle
- `display_name`: Display name
- `description`: Bio/description

### Blobs Table
Image and video blob metadata.

- `post_uri`: Associated post URI
- `blob_cid`: Blob content identifier
- `sha256`: Cryptographic hash
- `phash`: Perceptual hash
- `storage_path`: Local or S3 path (if downloaded)
- `mimetype`: Content type

## Label Filtering

Filter labels by providing a comma-separated list in `CAPTURE_LABELS`:

```env
CAPTURE_LABELS=spam,hate-speech,scam
```

If not set, all labels are captured.

## Data Persistence

### Cursor Persistence
The application saves its position in the firehose to `data/cursor.txt`. On restart, it resumes from this cursor, preventing duplicate processing.

### Database Persistence
The DuckDB database is stored in the `data/` directory, which is mounted as a Docker volume. Your data persists across container restarts.

## Monitoring

Logs are output in structured JSON format (production) or pretty-printed (development).

Key log events:
- `Firehose connected`: Successfully connected to labeler
- `Firehose disconnected`: Connection lost, will auto-reconnect
- `Received label`: Label captured and stored
- `Post hydrated successfully`: Post data fetched
- `Profile hydrated successfully`: Profile data fetched
- `Blob processed`: Blob hashed and optionally stored

## Rate Limiting

The service implements p-ratelimit to respect Bluesky's API limits:
- **Limit**: 3000 requests per 5 minutes per IP address
- **Concurrency**: Up to 48 concurrent requests
- **Backoff**: Automatic delays when approaching limits
- **Retry Logic**: Exponential backoff for rate limit errors (1s-10s)

## Development

### Project Structure

```
skywatch-tail/
├── src/
│   ├── blobs/            # Blob processing and storage
│   ├── config/           # Environment validation
│   ├── database/         # Schema and repositories
│   ├── firehose/         # WebSocket subscriber
│   ├── hydration/        # Content hydration services
│   ├── logger/           # Pino logger setup
│   ├── utils/            # Retry logic and helpers
│   └── index.ts          # Main entry point
├── tests/
│   ├── integration/      # Database integration tests
│   └── unit/             # Unit tests
├── data/                 # Database and cursor storage
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

### Running Tests

```bash
# All tests
bun test

# Specific test file
bun test tests/unit/decoder.test.ts

# Watch mode
bun test --watch
```

### Database Access

Access the DuckDB database directly:

```bash
# Using DuckDB CLI
duckdb data/skywatch.duckdb

# Query labels
SELECT val, COUNT(*) FROM labels GROUP BY val;

# Query recent posts
SELECT uri, text FROM posts ORDER BY created_at DESC LIMIT 10;
```

## Roadmap

- [x] Phase 1: Core infrastructure (Docker, config, database, logging)
- [x] Phase 2: Firehose connection and label capture
- [x] Phase 3: Content hydration (posts and profiles)
- [x] Phase 4: Blob processing (image/video hashing and storage)
- [x] Phase 5: Rate limiting and optimization
- [ ] Phase 6: Comprehensive testing
- [ ] Phase 7: Documentation

## Safety Features

### Blob Hydration
By default, `HYDRATE_BLOBS` is `false`. This prevents accidental download of potentially harmful / and or unlawful content (CSAM, graphic violence, etc.) while still capturing cryptographic and perceptual hashes.

Only enable blob download if:
1. You understand the legal and safety implications
2. You have proper content storage policies in place
3. You're operating in a jurisdiction where possessing such content for moderation is legal

## License

See LICENSE file for details.

## Contributing

Contributions welcome. Please ensure all tests pass before submitting PRs.

## Support

For issues and feature requests, please use the GitHub issue tracker.
