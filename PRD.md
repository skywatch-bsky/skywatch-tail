# Product Requirements Document (PRD)

This document outlines the requirements for the Skywatch Capture application. It serves as a reference for developers, designers, and stakeholders to ensure that the product meets the needs of its users.

`labels.uri` is the URI against which the label is applied. It can take two forms, a reference to a post in the form of an at-uri: `at://did:plc:7i7s4avtaolnrgc3ubcoqrq3/app.bsky.feed.post/3lf5u32pxwk2f` or a reference to a user in the form of a did: `did:plc:piwuaowuiykzaare644i5fre`.

`labels.val` is the label value being emitted.
`labels.neg` is a boolean indicating whether this label is a negation label, overwriting a previous label.

## Core Use Case

The primary purpose of this application is to subscribe to a Bluesky labeler's firehose, capture all emitted label events, hydrate the associated data (posts and user profiles), and store this comprehensive dataset in a local database. This data is intended for future use in training machine learning classifiers for content moderation.

## Functional Requirements

- **Firehose Subscription:** Connect to and process a DAG-CBOR encoded firehose from a specified Bluesky labeler service.
- **Data Hydration:** For each label received, fetch the full context of the labeled content.
  - **Post Hydration:** If the label URI is an `at-uri` (post), fetch the full `app.bsky.feed.post` record and store the following fields: `did`, `text`, `facets`, `embeds`, `langs`, `tags`, `createdAt`, and reply status.
  - **Profile Hydration:** If the label URI is a `did` (user), fetch the full `app.bsky.actor.profile` record and store the `displayName` and `description`. Additionally, resolve and store the user's `handle`.
- **Image & Blob Handling:**
  - An option (`HYDRATE_BLOBS`) must be provided to control whether to download image/video blobs. This is a safety feature for users labeling sensitive content.
  - In all cases, both a **SHA-256 (cryptographic) hash** and a **perceptual hash (pHash)** of any referenced image blobs must be captured to ensure compatibility with various moderation toolkits.
  - If `HYDRATE_BLOBS` is true, the application must support storing the downloaded blobs either on the local filesystem or in an AWS S3 bucket, configurable via environment variables.
- **Data Storage:**
  - All captured and hydrated data should be stored in a DuckDB database file.
  - The database schema should be structured to link labels to their hydrated content.
- **Filtering:** The user must be able to optionally provide a comma-separated list of labels to capture (`CAPTURE_LABELS`). If provided, any label not in this list will be ignored.

## Technical Requirements

- **Language/Runtime:** Use TypeScript with Bun.
- **Containerization:** The application must be containerized using Docker. The DuckDB database file must be stored on a volume outside the container to ensure data persistence. A `docker-compose.yml` file should be provided to manage services.
- **Key Libraries:**
  - `@atcute/cbor` and `@atcute/car` for parsing the firehose.
  - `@atproto/api` for all Bluesky API interactions.
  - `pino` and `pino-pretty` for logging.
  - `dotenv` for environment variable management.
- **Portability:** The application should be designed to be portable and easily configurable for use by other moderation services or researchers.
- **Rate Limits:** Be mindful of Bluesky API rate limits during hydration.

## Configuration

The application will be configured via a `.env` file with the following variables:

```env
# Bluesky Credentials
BSKY_HANDLE=your-bluesky-handle.bsky.social
BSKY_PASSWORD=your-app-password

# Bluesky PDS and Labeler URL
PDS=bsky.social
WSS_URL=wss://your-labeler-service.com/xrpc/com.atproto.label.subscribeLabels

# Blob & Image Handling
HYDRATE_BLOBS=false # Set to true to download images/videos
BLOB_STORAGE_TYPE=local # 'local' or 's3'
BLOB_STORAGE_PATH=./data/blobs # Path for local storage

# S3 Configuration (only required if BLOB_STORAGE_TYPE is 's3')
S3_BUCKET=your-s3-bucket-name
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key

# Database
DB_PATH=./data/skywatch.duckdb

# Filtering (Optional)
# Comma-separated list of labels to capture, e.g., "spam,hate-speech"
CAPTURE_LABELS=

# Logging
LOG_LEVEL=info
```

## Data Schema

The database will contain the following tables:

#### `labels`
Stores the raw label event data.
- `id` (INTEGER, Primary Key, Auto-incrementing)
- `uri` (TEXT) - The `at-uri` or `did` of the labeled content.
- `cid` (TEXT) - The CID of the specific record version.
- `val` (TEXT) - The label value (e.g., "spam").
- `neg` (BOOLEAN) - If the label is a negation.
- `cts` (DATETIME) - Timestamp of label creation.
- `exp` (DATETIME, nullable) - Expiration timestamp of the label.
- `src` (TEXT) - The DID of the labeler.

#### `posts`
Stores hydrated data for labeled posts. Linked to `labels.uri`.
- `uri` (TEXT, Primary Key)
- `did` (TEXT) - Author of the post.
- `text` (TEXT)
- `facets` (JSON)
- `embeds` (JSON)
- `langs` (JSON)
- `tags` (JSON)
- `createdAt` (DATETIME)
- `is_reply` (BOOLEAN)

#### `profiles`
Stores hydrated data for labeled user accounts. Linked to `labels.uri`.
- `did` (TEXT, Primary Key)
- `handle` (TEXT)
- `displayName` (TEXT)
- `description` (TEXT)

#### `blobs`
Stores information about image blobs found in posts.
- `post_uri` (TEXT) - Foreign key to `posts.uri`.
- `blob_cid` (TEXT) - CID of the blob.
- `sha256` (TEXT) - Cryptographic hash for exact file matching.
- `phash` (TEXT) - Perceptual hash for finding visually similar images.
- `storage_path` (TEXT, nullable) - Local or S3 path if downloaded.
- `mimetype` (TEXT)
- PRIMARY KEY (`post_uri`, `blob_cid`)


## Lexicons
The following bluesky lexicons are necessary for this tool:

### `com.atproto.label.subscribeLabels`
Skywatch emits a DAG-CBOR encoded firehose of moderation decisions at `wss://ozone.skywatch.blue/xrpc/com.atproto.label.subscribeLabels
A label event looks like the following:

```json
"label": {
  "type": "object",
  "description": "Metadata tag on an atproto resource (eg, repo or record).",
  "required": ["src", "uri", "val", "cts"],
  "properties": {
    "ver": {
      "type": "integer",
      "description": "The AT Protocol version of the label object."
    },
    "src": {
      "type": "string",
      "format": "did",
      "description": "DID of the actor who created this label."
    },
    "uri": {
      "type": "string",
      "format": "uri",
      "description": "AT URI of the record, repository (account), or other resource that this label applies to."
    },
    "cid": {
      "type": "string",
      "format": "cid",
      "description": "Optionally, CID specifying the specific version of 'uri' resource this label applies to."
    },
    "val": {
      "type": "string",
      "maxLength": 128,
      "description": "The short string name of the value or type of this label."
    },
    "neg": {
      "type": "boolean",
      "description": "If true, this is a negation label, overwriting a previous label."
    },
    "cts": {
      "type": "string",
      "format": "datetime",
      "description": "Timestamp when this label was created."
    },
    "exp": {
      "type": "string",
      "format": "datetime",
      "description": "Timestamp at which this label expires (no longer applies)."
    },
    "sig": {
      "type": "bytes",
      "description": "Signature of dag-cbor encoded label."
    }
  }
},
```

### `app.bsky.feed.post`
Post are structured as the following:

```json
{
  "lexicon": 1,
  "id": "app.bsky.feed.post",
  "defs": {
    "main": {
      "type": "record",
      "description": "Record containing a Bluesky post.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["text", "createdAt"],
        "properties": {
          "text": {
            "type": "string",
            "maxLength": 3000,
            "maxGraphemes": 300,
            "description": "The primary post content. May be an empty string, if there are embeds."
          },
          "entities": {
            "type": "array",
            "description": "DEPRECATED: replaced by app.bsky.richtext.facet.",
            "items": { "type": "ref", "ref": "#entity" }
          },
          "facets": {
            "type": "array",
            "description": "Annotations of text (mentions, URLs, hashtags, etc)",
            "items": { "type": "ref", "ref": "app.bsky.richtext.facet" }
          },
          "reply": { "type": "ref", "ref": "#replyRef" },
          "embed": {
            "type": "union",
            "refs": [
              "app.bsky.embed.images",
              "app.bsky.embed.video",
              "app.bsky.embed.external",
              "app.bsky.embed.record",
              "app.bsky.embed.recordWithMedia"
            ]
          },
          "langs": {
            "type": "array",
            "description": "Indicates human language of post primary text content.",
            "maxLength": 3,
            "items": { "type": "string", "format": "language" }
          },
          "labels": {
            "type": "union",
            "description": "Self-label values for this post. Effectively content warnings.",
            "refs": ["com.atproto.label.defs#selfLabels"]
          },
          "tags": {
            "type": "array",
            "description": "Additional hashtags, in addition to any included in post text and facets.",
            "maxLength": 8,
            "items": { "type": "string", "maxLength": 640, "maxGraphemes": 64 }
          },
          "createdAt": {
            "type": "string",
            "format": "datetime",
            "description": "Client-declared timestamp when this post was originally created."
          }
        }
      }
    },
    "replyRef": {
      "type": "object",
      "required": ["root", "parent"],
      "properties": {
        "root": { "type": "ref", "ref": "com.atproto.repo.strongRef" },
        "parent": { "type": "ref", "ref": "com.atproto.repo.strongRef" }
      }
    },
    "entity": {
      "type": "object",
      "description": "Deprecated: use facets instead.",
      "required": ["index", "type", "value"],
      "properties": {
        "index": { "type": "ref", "ref": "#textSlice" },
        "type": {
          "type": "string",
          "description": "Expected values are 'mention' and 'link'."
        },
        "value": { "type": "string" }
      }
    },
    "textSlice": {
      "type": "object",
      "description": "Deprecated. Use app.bsky.richtext instead -- A text segment. Start is inclusive, end is exclusive. Indices are for utf16-encoded strings.",
      "required": ["start", "end"],
      "properties": {
        "start": { "type": "integer", "minimum": 0 },
        "end": { "type": "integer", "minimum": 0 }
      }
    }
  }
}
```

With posts we are interested in the `app.bsky.embeds.images` lexicon in particular. The blob reference can be used to retriexe the image from the PDS and then saved to local storage or hashed.

```json
{
  "lexicon": 1,
  "id": "app.bsky.embed.images",
  "description": "A set of images embedded in a Bluesky record (eg, a post).",
  "defs": {
    "main": {
      "type": "object",
      "required": ["images"],
      "properties": {
        "images": {
          "type": "array",
          "items": { "type": "ref", "ref": "#image" },
          "maxLength": 4
        }
      }
    },
    "image": {
      "type": "object",
      "required": ["image", "alt"],
      "properties": {
        "image": {
          "type": "blob",
          "accept": ["image/*"],
          "maxSize": 1000000
        },
        "alt": {
          "type": "string",
          "description": "Alt text description of the image, for accessibility."
        },
        "aspectRatio": {
          "type": "ref",
          "ref": "app.bsky.embed.defs#aspectRatio"
        }
      }
    },
    "view": {
      "type": "object",
      "required": ["images"],
      "properties": {
        "images": {
          "type": "array",
          "items": { "type": "ref", "ref": "#viewImage" },
          "maxLength": 4
        }
      }
    },
    "viewImage": {
      "type": "object",
      "required": ["thumb", "fullsize", "alt"],
      "properties": {
        "thumb": {
          "type": "string",
          "format": "uri",
          "description": "Fully-qualified URL where a thumbnail of the image can be fetched. For example, CDN location provided by the App View."
        },
        "fullsize": {
          "type": "string",
          "format": "uri",
          "description": "Fully-qualified URL where a large version of the image can be fetched. May or may not be the exact original blob. For example, CDN location provided by the App View."
        },
        "alt": {
          "type": "string",
          "description": "Alt text description of the image, for accessibility."
        },
        "aspectRatio": {
          "type": "ref",
          "ref": "app.bsky.embed.defs#aspectRatio"
        }
      }
    }
  }
}
```

### `app.bsky.actor.profile`

```json
{
  "lexicon": 1,
  "id": "app.bsky.actor.profile",
  "defs": {
    "main": {
      "type": "record",
      "description": "A declaration of a Bluesky account profile.",
      "key": "literal:self",
      "record": {
        "type": "object",
        "properties": {
          "displayName": {
            "type": "string",
            "maxGraphemes": 64,
            "maxLength": 640
          },
          "description": {
            "type": "string",
            "description": "Free-form profile description text.",
            "maxGraphemes": 256,
            "maxLength": 2560
          },
          "pronouns": {
            "type": "string",
            "description": "Free-form pronouns text.",
            "maxGraphemes": 20,
            "maxLength": 200
          },
          "website": { "type": "string", "format": "uri" },
          "avatar": {
            "type": "blob",
            "description": "Small image to be displayed next to posts from account. AKA, 'profile picture'",
            "accept": ["image/png", "image/jpeg"],
            "maxSize": 1000000
          },
          "banner": {
            "type": "blob",
            "description": "Larger horizontal image to display behind profile view.",
            "accept": ["image/png", "image/jpeg"],
            "maxSize": 1000000
          },
          "labels": {
            "type": "union",
            "description": "Self-label values, specific to the Bluesky application, on the overall account.",
            "refs": ["com.atproto.label.defs#selfLabels"]
          },
          "joinedViaStarterPack": {
            "type": "ref",
            "ref": "com.atproto.repo.strongRef"
          },
          "pinnedPost": {
            "type": "ref",
            "ref": "com.atproto.repo.strongRef"
          },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```
