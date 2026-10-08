# Development

## Setup

Requires a current Node.js LTS (the project targets Node 22) and npm.

```sh
npm install
npm run dev        # Vite dev server
npm test           # Vitest, all suites
npm run build      # tsc --noEmit type-check, then vite build → dist/
npm run preview    # serve dist/ locally
```

| Script | What it does |
|---|---|
| `dev` | Vite dev server with hot reload |
| `build` | Type-checks (`tsc --noEmit`) then builds to `dist/` |
| `preview` | Serves the production build |
| `test` | `vitest run` |
| `wasm` | Rebuilds `public/wasm/cubiomes.wasm` (see [[WASM Generator]]) |
| `deploy` | `wrangler deploy` (builds first; see [[Deployment]]) |

You only need a C toolchain if you change `wasm/wrapper.c` or cubiomes; `npm run wasm` downloads wasi-sdk for you (Linux x86_64; on other platforms set `WASI_SDK_PATH`).

## Tests

| File | Covers |
|---|---|
| `tests/seed.test.ts` | Java `String.hashCode`, 64-bit numeric parsing, lo/hi split |
| `tests/portal.test.ts` | ÷8 / ×8 conversion, rounding negatives down, coordinate parsing |
| `tests/view.test.ts` | Zoom around a point, zoom clamping, pinch gestures |
| `tests/tileCache.test.ts` | LRU eviction, `keep` floor, `onEvict`, staying bounded over a long pan |
| `tests/storage.test.ts` | Seed CRUD, notes, visited, pins, Export/Import round-trips, malformed data, legacy migration, write failures |
| `tests/changelog.test.ts` | Changelog ids unique and newest first; seen tracking for new and returning users |
| `tests/bedrock.test.ts` | Runs the real `.wasm`: Bedrock villages vs in-game ground truth, fortress/bastion split, Java fallbacks |

Tests that touch storage use an in-memory `Storage` implementation (see the top of `tests/storage.test.ts`), so they run in Node without a DOM.

## Code conventions

- TypeScript `strict`, ES2022, plain DOM APIs; no UI framework or runtime dependencies.
- Pure logic lives in small modules (`seed.ts`, `portal.ts`, `map/view.ts`, `storage.ts`, `changelog.ts`) so it can be unit-tested; `main.ts` and `map/map.ts` hold the DOM/canvas glue.
- Storage functions take an injectable `Storage` (default `localStorage`), and treat access errors as "no storage" rather than crashing.
- User-facing failures are `StorageError`s with a readable message.
- Comments explain *why* (game behaviour, edge cases), not *what*.

## Recipes

### Ship a user-visible change
Add an entry at the **top** of `CHANGELOG` in `src/data/changelog.ts` with a new, unique `id` (convention: `YYYY-MM-DD-slug`). Never change or reuse an existing `id`: it's how each browser remembers what it has seen. `tests/changelog.test.ts` enforces unique ids in newest-first order. Also update `README.md` and this wiki if behaviour changed.

### Add a Minecraft version
1. Check that vendored cubiomes supports it (`MCVersion` enum in `vendor/cubiomes/biomes.h`); update cubiomes and rebuild the WASM if not.
2. Add `{ label, mc }` to `JAVA_VERSIONS` (and `BEDROCK_VERSIONS` if relevant) in `src/data/versions.ts`, newest first.
3. Add any new biomes or structures (below).

Labels are stored in saved seeds and URLs, so don't rename existing ones. If you must, map old labels to new ones in `currentVersionLabel`.

### Add a biome
Add `[id, name, '#rrggbb']` to `raw` in `src/data/biomes.ts`, using the cubiomes `BiomeID`. Add the id to `NETHER_IDS` / `END_IDS` if needed, or `UNDERGROUND_IDS` for cave biomes (hidden from the filter). Ids must be < 256 (`COLOR_LUT` and the `Uint8Array` tile buffers).

### Add a structure
1. Add a `StructureDef` to `STRUCTURES` in `src/data/structures.ts` with the cubiomes `StructureType`, a unique `key`, name, emoji, colour and `dim`.
2. For Bedrock, add its placement to `bedrock_config()` (and any biome rule to `bedrock_viable()`) in `wasm/wrapper.c` and rebuild; otherwise mark it `bedrockApprox: true`.
3. To have it on by default, add its `key` to `DEFAULT_ON_KEYS` in `src/main.ts`.

### Expose a new WASM function
Add it to `wasm/wrapper.c`, add `-Wl,--export=<name>` in `scripts/build-wasm.sh`, rebuild, add it to the `Exports` type and a message handler in `src/worker/gen.worker.ts`, then call it from `MapView`.

### Change the saved-seed format
Keep old data loading: extend `normalize()` with defaults for missing fields (as was done for `visited` and `pins`). Only bump the storage key (`mc-mapper:seeds:v1`) for incompatible changes, and migrate from the old key the way `LEGACY_KEY` is handled. Add tests in `tests/storage.test.ts`, including Export/Import round-trips.

## Project history

- **2026-10-05**: first version on Cloudflare Pages, with saved seeds in a Cloudflare D1 database; Nether and End support added.
- **2026-10-07**: saved seeds moved to browser `localStorage` only (D1 dropped); LRU tile cache.
- **2026-10-08**: notes and visited structures; moved to Cloudflare Workers static assets; phone layout; surface biomes on 1.18+; Nether portal calculator; What's new; real Bedrock structure placement and 64-bit Bedrock seeds; favicon; pins.
