# Data and Storage

There is no server. Everything a user saves lives in their browser's `localStorage`, managed by `src/storage.ts`.

## `localStorage` keys

| Key | Contents |
|---|---|
| `mc-mapper:seeds:v1` | JSON array of saved seeds (current format) |
| `mc-mapper:seeds` | Legacy key from when seeds were mirrored from the old Cloudflare D1 API. Migrated to `:v1` on first read, then removed |
| `mc-mapper:changelog-seen` | `id` of the newest What's new entry this browser has seen |

## Saved seed format

This is also the Export file format (`mc-mapper-seeds.json`, a pretty-printed array):

```jsonc
[
  {
    "id": "b6f1…",              // crypto.randomUUID()
    "name": "Home",             // ≤ 100 chars; defaults to the seed
    "seed": "12345",            // the text as typed (≤ 100 chars), not the parsed number
    "edition": "java",          // "java" | "bedrock"
    "version": "1.21.3",        // a label from src/data/versions.ts
    "dimension": "overworld",   // "overworld" | "nether" | "end": the dimension it was saved in
    "notes": "Base at 120 64 -300",  // ≤ 5000 chars
    "visited": ["5:-168:56"],   // structure keys, see below
    "pins": [
      { "id": "…", "name": "Base", "x": 120, "z": -300, "dimension": "overworld", "created_at": 1760000000000 }
    ],
    "created_at": 1760000000000 // ms since epoch; the list is sorted newest first
  }
]
```

### Structure keys

Visited structures are stored as `` `${type}:${x}:${z}` `` (`structureKey()` in `src/storage.ts`), where `type` is the cubiomes `StructureType` and `x`/`z` the block position. Types are unique per dimension, so one list covers all three dimensions.

### Limits

| Limit | Value |
|---|---|
| Notes | 5,000 chars (`MAX_NOTES`) |
| Visited structures per seed | 5,000 (`MAX_VISITED`) |
| Pins per seed | 1,000 (`MAX_PINS`) |
| Pin name | 60 chars (`MAX_PIN_NAME`) |
| Pin coordinates | within the 30,000,000-block world border |

## Normalization

Every record read from storage or an import file goes through `normalize()`, which never trusts the input:
- missing or invalid `id`, `seed` or `version` → the record is dropped;
- strings are truncated to their limits; unknown `edition` → `java`; unknown `dimension` → `overworld`;
- old Bedrock version labels ending in ` (approx.)` are mapped to the current labels (`currentVersionLabel`);
- malformed visited keys are dropped and duplicates removed;
- pins with non-integer or out-of-border coordinates, or duplicate ids, are dropped; blank pin names become `Pin`.

Malformed JSON in storage reads as an empty list rather than crashing.

## Import

`importJson` merges: entries whose `id` already exists are skipped, the rest are added, and the list is re-sorted by `created_at`. It returns how many were added. A file that isn't JSON or isn't an array raises a `StorageError` with a user-facing message.

## Errors

Writes throw `StorageError` with a readable reason (storage unavailable, quota exceeded, or disabled/private mode). `main.ts` wraps writes in `attempt()` and shows the message in the sidebar rather than pretending the save worked. Reads never throw.

## URL parameters

The app writes the current world into the query string, and on load reads it back:

```
?seed=<text>&edition=java|bedrock&version=<label>&dimension=overworld|nether|end
```

With no `seed` parameter the app starts with the sidebar open and no map.
