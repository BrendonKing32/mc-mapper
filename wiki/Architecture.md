# Architecture

MC Mapper is a static single-page app. Everything (generation, rendering, persistence) happens in the browser.

```
index.html ── src/main.ts (UI wiring, sidebar, popups, boot)
                 │
                 ├── src/map/map.ts  MapView: canvas, input, tiles, overlays
                 │        │  postMessage            ▲ tile / structures / ready
                 │        ▼                         │
                 │   ┌─ tile worker ───────┐  ┌─ structure worker ─┐
                 │   │ src/worker/gen.worker.ts (same file, two instances)
                 │   │   └── public/wasm/cubiomes.wasm  (wasm/wrapper.c + vendor/cubiomes)
                 │   └─────────────────────┘  └────────────────────┘
                 │
                 ├── src/storage.ts     saved seeds in localStorage
                 ├── src/changelog.ts   "What's new" seen tracking
                 ├── src/portal.ts      Overworld ↔ Nether math
                 ├── src/seed.ts        seed parsing
                 └── src/data/*         biomes, structures, versions, changelog entries
```

## Source map

| Path | Role |
|---|---|
| `index.html` | All markup: sidebar (`#side`), map canvas, HUD, zoom/pin buttons, popup (`#pick`), changelog `<dialog>` |
| `src/main.ts` | Wires the DOM to `MapView` and the stores: generate, saved seeds, notes/visited, pins, portal calculator, filters, drawer, What's new, boot from URL |
| `src/map/map.ts` | `MapView` class: canvas rendering, pointer/wheel/pinch input, tile requests, structure queries, markers and pins, hit-testing |
| `src/map/view.ts` | Pure viewport math: `zoomAt` (zoom around a point), `pinch` (two-finger pan+zoom), zoom clamped to `1/256 … 8` px per block |
| `src/map/tileCache.ts` | Generic LRU cache with an `onEvict` hook |
| `src/worker/gen.worker.ts` | Loads the WASM and answers `init`, `tile`, `structures`, `biomeAt` messages |
| `src/seed.ts` | `parseSeed` (64-bit numeric or Java `String.hashCode` text), `seedParts` (split into 32-bit lo/hi for WASM) |
| `src/portal.ts` | `toNether`, `toOverworld`, `parseCoord` |
| `src/storage.ts` | `createSeedStore`: CRUD for saved seeds, notes, visited, pins; normalization; Export/Import; legacy migration |
| `src/changelog.ts` | `createChangelogSeen`: which changelog entries this browser has seen |
| `src/data/biomes.ts` | Biome ids (cubiomes `BiomeID`), names, colors, dimension, `underground` flag; `COLOR_LUT` |
| `src/data/structures.ts` | Structure defs: cubiomes `StructureType`, key, name, emoji, color, dimension, `bedrockApprox` |
| `src/data/versions.ts` | Java/Bedrock version lists mapped to cubiomes `MCVersion` ids |
| `src/data/changelog.ts` | What's new entries, newest first |
| `src/style.css` | All styles, including the phone drawer layout |
| `wasm/wrapper.c` | C API exported to JS; Bedrock structure placement ([[WASM Generator]], [[Bedrock Support]]) |
| `vendor/cubiomes/` | Vendored cubiomes (MIT) |
| `public/wasm/cubiomes.wasm` | Compiled generator (committed, so `npm run build` needs no C toolchain) |
| `scripts/build-wasm.sh` | Rebuilds the `.wasm` with wasi-sdk |
| `tests/` | Vitest suites |

## Generation flow

1. `main.ts` `generate()` resolves the version's cubiomes id, parses the seed into `lo`/`hi` 32-bit halves, and calls `MapView.setWorld(mc, lo, hi, large, dim, at, bedrock)`. It also writes the URL query string.
2. `setWorld` bumps a **generation counter** (`gen`), clears tiles/structures, and sends `init` to both workers. Every later message carries `gen`; replies with a stale `gen` are dropped, so switching seeds mid-flight never mixes worlds.
3. The tile worker replies `ready` with the spawn point (Overworld only). The map centres on spawn, or on `startAt` if one was given (e.g. jumping to a pin in another dimension).
4. Each frame, `draw()` works out which tiles are visible and requests missing ones, nearest-to-centre first, with at most 6 in flight.
5. Structure queries are debounced (150 ms after the view stops changing), cover the view plus 25% padding, and go to the **separate structure worker** so slow searches (strongholds especially) never stall tile generation.

### Why two workers

Both are instances of the same `gen.worker.ts` with their own WASM instance and generator state. The structure worker is initialized with `quiet: true` so only the tile worker reports `ready`.

## Rendering

- Tiles are **128×128 samples**. The sample scale is chosen from `[1, 4, 16, 64, 256]` blocks per sample: the largest scale where one sample is still ≥ ~1 screen pixel. Tile keys are `${scale}:${tx}:${tz}`.
- The worker returns biome ids as a `Uint8Array` (transferred, not copied). `MapView` turns them into a 128×128 canvas via `COLOR_LUT`, lazily, and re-colours only when the biome filter version changes (filtered-out biomes become dim greys).
- Tiles are drawn with smoothing off, so zoomed-in maps look blocky like the game's biome grid.
- Overlays drawn on top: origin cross, spawn dot, structure markers (coloured circle + emoji, faded with a green check if visited), then pins (teardrop with a label). Pins win hit-tests over structures.

## Memory

`TileCache` is an LRU with a budget of **512 tiles** (~80 KB each, so ~40 MB). After each frame it trims to `max(512, 1.5 × visible tiles)`, so visible tiles are never evicted. Evicted tiles have their canvas resized to 0×0 to release the backing store promptly.

## Input

`MapView.bindInput` uses Pointer Events: one pointer pans, two pinch-zoom. A "tap" is a single pointer that moved ≤ 3 px; taps select (hit radius 14 px for mouse, 26 px for touch), or place a pin in pin mode. Right-click (`contextmenu`) places a pin. The wheel zooms around the cursor.

## UI state in `main.ts`

- `generated`: the seed/edition/version currently on the map.
- `activeSeed()`: finds the saved seed for the map, matching seed + edition, preferring the same version, then the last-loaded one, then the newest. **Dimension is ignored**: one saved seed covers all dimensions.
- `notesOwner`: the saved seed whose notes are in the textarea, so text is never saved onto a different seed after switching. Notes save 500 ms after typing stops, on blur, and on `pagehide`.
- `attempt(fn)`: wraps every storage write and shows `StorageError` messages in the sidebar instead of failing silently.
