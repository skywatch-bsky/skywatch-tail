# Blob Hydration - Implementation Notes

## Overview

This document captures key learnings from implementing blob hydration for Bluesky profiles and posts, including avatars, banners, and post images/videos.

## Key Discoveries

### 1. CID Deserialization in @atproto/api

The `@atproto/api` library deserializes blob references from their JSON `$link` representation into CID class objects.

**Raw JSON from API:**
```json
{
  "avatar": {
    "$type": "blob",
    "ref": {
      "$link": "bafkreigg3s6plegjncmxubeufbohj3qasbm4r23q2x7zlivdhccfqfypve"
    },
    "mimeType": "image/jpeg",
    "size": 101770
  }
}
```

**What you get in TypeScript:**
```typescript
record.avatar.ref // CID object with { code, version, hash, ... }
```

**Solution:**
```typescript
const cid = record.avatar.ref.toString(); // "bafkrei..."
```

**For post embeds**, you need to handle both formats:
```typescript
const extractCid = (ref: any): string | null => {
  if (!ref) return null;
  // Handle CID object (from @atproto/api deserialization)
  if (typeof ref.toString === 'function' && ref.code !== undefined) {
    return ref.toString();
  }
  // Handle plain $link string (from raw JSON)
  if (ref.$link) {
    return ref.$link;
  }
  return null;
};
```

### 2. PDS Endpoint Resolution

Users can be on different Personal Data Servers (PDS), not just `bsky.social`. Blobs must be fetched from the user's actual PDS.

**Process:**
1. Query PLC directory for DID document: `https://plc.wtf/${did}`
2. Find service with `id: "#atproto_pds"` and `type: "AtprotoPersonalDataServer"`
3. Extract `serviceEndpoint` URL
4. Use that endpoint for `com.atproto.sync.getBlob`

**Example:**
```typescript
const didDoc = await fetch(`https://plc.wtf/${did}`).then(r => r.json());
const pdsService = didDoc.service?.find(s =>
  s.id === "#atproto_pds" && s.type === "AtprotoPersonalDataServer"
);
const pdsEndpoint = pdsService.serviceEndpoint; // e.g., "https://waxcap.us-west.host.bsky.network"
```

### 3. Correct Blob Fetching

**Don't use CDN paths** - they don't work reliably for all blobs and require authentication context.

**Use the AT Protocol API:**
```typescript
const blobUrl = `${pdsEndpoint}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${cid}`;
const response = await fetch(blobUrl);
const blobData = Buffer.from(await response.arrayBuffer());
```

### 4. Database Schema Design

**Separate tables for different blob types:**

- `blobs` table: Post images with FK to `posts(uri)`
- `profile_blobs` table: Avatars/banners with FK to `profiles(did)`

This allows proper relational queries and analysis.

**Profile blobs schema:**
```sql
CREATE TABLE profile_blobs (
  did TEXT NOT NULL,
  blob_type TEXT NOT NULL CHECK (blob_type IN ('avatar', 'banner')),
  blob_cid TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  phash TEXT,
  storage_path TEXT,
  mimetype TEXT,
  captured_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (did, blob_type, captured_at),
  FOREIGN KEY (did) REFERENCES profiles(did)
);
```

### 5. Change Tracking

Including `captured_at` in the primary key allows tracking when users change their avatars/banners.

**Query latest state:**
```sql
SELECT * FROM profile_blobs
WHERE did = ? AND blob_type = ?
ORDER BY captured_at DESC
LIMIT 1
```

**Only insert if changed:**
```typescript
const latest = await findLatestByDidAndType(did, type);
if (latest && latest.blob_cid === cid) {
  return; // No change, skip
}
// Insert new row with current timestamp
```

### 6. Sentinel Values for Missing Data

Use empty string (`""`) to distinguish "we checked, user has no avatar" from NULL "we haven't checked yet".

```typescript
if (record.avatar?.ref) {
  avatarCid = record.avatar.ref.toString();
} else {
  avatarCid = ""; // Explicitly checked, not present
}
```

This prevents infinite re-hydration loops for profiles without avatars.

### 7. Profile Re-hydration Logic

```typescript
const existingProfile = await findByDid(did);
const needsRehydration = existingProfile &&
  (existingProfile.avatar_cid === null || existingProfile.banner_cid === null);

if (existingProfile && !needsRehydration) {
  return; // Skip
}
```

## Configuration

- `PLC_ENDPOINT`: DID resolution endpoint (default: `https://plc.wtf`)
  - Can be changed to `https://plc.directory` or custom instance
  - plc.wtf is faster but unofficial

## Common Errors

### "RepoNotFound"
- **Cause:** Querying wrong PDS endpoint
- **Solution:** Resolve correct PDS from DID document

### Foreign Key Constraint Violation
- **Cause:** Trying to insert profile blobs into `blobs` table
- **Solution:** Use separate `profile_blobs` table

### Missing CIDs Despite API Returning Them
- **Cause:** Trying to access `ref.$link` when ref is a CID object
- **Solution:** Call `.toString()` on the CID object

## Related Files

### Profile Blobs
- `src/hydration/profiles.service.ts` - Profile avatar/banner hydration
- `src/database/profile-blobs.repository.ts` - Profile blob persistence

### Post Blobs
- `src/blobs/processor.ts` - Post image/video blob processing
- `src/database/blobs.repository.ts` - Post blob persistence
- `tests/unit/blob-processor.test.ts` - Unit tests for blob extraction

### Common
- `src/database/schema.ts` - Table definitions for both blob types
- `src/config/index.ts` - PLC endpoint configuration
