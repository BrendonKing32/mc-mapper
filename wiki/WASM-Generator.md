# WASM Generator

The generator is cubiomes plus `wasm/wrapper.c`, compiled to a single `public/wasm/cubiomes.wasm` with **wasi-sdk** (no Emscripten). The `.wasm` is committed so a normal build or deploy needs no C toolchain.

## Rebuilding

```sh
npm run wasm   # runs scripts/build-wasm.sh
```

The script downloads wasi-sdk 25 (x86_64 Linux) into `.cache/` unless `WASI_SDK_PATH` points at an existing install, then compiles `wasm/wrapper.c` with the cubiomes sources at `-O3` as a WASI *reactor* (no `main`), with 32 MB initial / 1 GB max memory. Only the `mc_*` functions below are exported.

Rebuild whenever you change `wasm/wrapper.c` or update `vendor/cubiomes`, and commit the new `.wasm`. `tests/bedrock.test.ts` runs against the committed binary, so it catches a stale build.

The JS side supplies a dummy WASI import (`new Proxy({}, { get: () => () => 0 })`), since the generator never does I/O.

## Exported API

All state is global in the wrapper (one generator per WASM instance; each worker has its own).

| Function | Purpose |
|---|---|
| `mc_init(mc, seed_lo, seed_hi, large, dim, bedrock)` | Sets up the generator for a cubiomes `MCVersion`, 64-bit seed (as two `uint32`s), Large Biomes flag, dimension (`0` Overworld, `-1` Nether, `1` End) and edition |
| `mc_biomes(x, z, w, h, scale)` | Generates `w×h` biome ids at `1:scale`; returns a malloc'd `int*` (free with `mc_free`) or 0 on failure |
| `mc_biome_at(x, z)` | Biome id at one block |
| `mc_structures(type, x0, z0, x1, z1, out, max)` | Writes up to `max` `(x, z)` int pairs of viable structures of a cubiomes `StructureType` inside the block rectangle; returns the count, or `-1` if the type doesn't exist in this version/dimension |
| `mc_spawn(out)` | Writes the spawn `(x, z)` |
| `mc_strongholds(out, count)` | Writes the first `count` strongholds as `(x, z)` pairs; returns the count found |
| `mc_is_slime(cx, cz)` | Slime chunk test (exported, not used by the UI yet) |
| `mc_malloc(n)` / `mc_free(p)` | Allocate/free in WASM memory, for output buffers |

### Calling convention from the worker

```ts
const out = ex.mc_malloc(MAX * 8);                  // MAX pairs of int32
const n = ex.mc_structures(type, x0, z0, x1, z1, out, MAX);
const pts = new Int32Array(ex.memory.buffer, out, n * 2);
ex.mc_free(out);
```

Always re-create typed-array views after a call that may allocate: WASM memory can grow, which detaches old `ArrayBuffer`s.

## Biome sampling height

Since 1.18 the Overworld picks cave biomes by depth below the terrain, so sampling at sea level returns Lush Caves etc. under any land. `sample_y()` returns **y = 320** (above the build limit, so always the surface biome) for Overworld 1.18+, and y = 63 otherwise (older versions and other dimensions ignore y).

## Structure search

`mc_structures` walks every region overlapping the rectangle (plus one region of padding), asks for the region's generation attempt (`getStructurePos`), keeps positions inside the rectangle, and filters them with `isViableStructurePos` (the biome check). On Bedrock it first tries `bedrock_structures()`; see [[Bedrock Support]].

Strongholds (type `100` in `src/data/structures.ts`) aren't region-based. The worker handles them separately via `mc_strongholds`, computing 3 / 9 / 128 of them depending on how far from the origin the view reaches, and caching the result per world.
