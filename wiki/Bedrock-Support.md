# Bedrock Support

cubiomes only implements **Java** generation. `wasm/wrapper.c` adds Bedrock on top of it. For a summary of what is exact vs approximate, see [[Accuracy and Limitations]].

## Seeds

Since 1.18 Bedrock seeds are 64-bit, like Java's. `src/seed.ts` parses numeric input as a signed 64-bit `BigInt` for both editions and passes it to WASM as two 32-bit halves. Bedrock's structures and Nether/End only use the **low 32 bits**; the wrapper handles that, so the UI never truncates.

## Biomes

- **Overworld**: since 1.18 both editions generate the same biomes for the same seed, so Bedrock uses the matching Java generator with the full 64-bit seed. This is why only Bedrock 1.18+ versions are offered (`BEDROCK_VERSIONS` in `src/data/versions.ts`: 1.18, 1.20, 1.21+).
- **Nether and End**: generated from the low 32 bits of the seed (sign-extended), which is what Bedrock uses, but the editions' generators differ there, so these are approximate.

## Structure placement

Bedrock divides the world into regions (`spacing` chunks square). For each region it seeds a **Mersenne Twister (MT19937)** with the low 32 bits of

```
regX * 341873128712 + regZ * 132897987541 + worldSeed + salt
```

and draws the chunk offset inside the region:
- **uniform**: one draw per axis, `mt() % range`;
- **triangular** (larger structures): the average of two draws per axis, which clusters them towards the middle of the region.

The block position is `(region * spacing + offset) * 16 + 8`. The wrapper's MT implementation only generates the first few outputs it needs (output *i* needs state words *i*, *i*+1 and *i*+397), which keeps per-region seeding cheap.

### Constants

From `bedrock_config()` in `wasm/wrapper.c` (`spacing` = region size in chunks, `range` = spacing − separation):

| Structure | Salt | Spacing | Range | Spread | Notes |
|---|---|---|---|---|---|
| Village | 10387312 | 34 (27 before 1.18) | 26 (17) | triangular | |
| Shipwreck | 165745295 | 24 (10) | 20 (5) | uniform (triangular before 1.18) | |
| Ocean ruin | 14357621 | 20 (12) | 12 (5) | uniform (triangular before 1.18) | |
| Desert pyramid, jungle temple, swamp hut, igloo | 14357617 | 32 | 24 | uniform | |
| Ruined portal (Overworld) | 40552231 | 40 | 25 | uniform | |
| Pillager outpost | 165745296 | 80 | 56 | triangular | |
| Woodland mansion | 10387319 | 80 | 60 | triangular | |
| Ocean monument | 10387313 | 32 | 27 | triangular | |
| Buried treasure | 16842397 | 4 | 2 | triangular | |
| Ancient city | 20083232 | 24 | 16 | triangular | 1.19.2+ |
| Fortress / bastion | 30084232 | 30 | 26 | uniform | Nether; shared regions |
| Ruined portal (Nether) | 40552231 | 25 | 15 | uniform | Nether |
| End city | 10387313 | 20 | 9 | triangular | End; ≥ 1008 blocks from origin |
| Trail ruins | – | – | – | Java placement | 1.20+ |
| Trial chambers | – | – | – | Java placement | 1.21.1+ |
| Mineshaft | – | per chunk | – | special | see below |

The pre-1.18 values in brackets are kept for completeness; the UI only offers Bedrock 1.18+, so they aren't reachable today.

Constants follow the open-source Bedrock finders [SeedFinder](https://github.com/zebedelu/SeedFinder) and [MCBE-seedcracker](https://github.com/Alist2930/MCBE-seedcracker), which agree on every value.

### Special cases

- **Nether fortress vs bastion**: each Nether region holds one or the other. After the position draws, the wrapper draws `mt() % 6` and treats `>= 2` as a bastion (2/3) and otherwise a fortress (1/3). The odds match Bedrock, but which draw decides it is **inferred, not verified in-game**.
- **Mineshafts** are per chunk: the MT is seeded from the world seed to get two multipliers, reseeded with `(a·chunkX) ^ (b·chunkZ) ^ seed`, one output is discarded, and a mineshaft spawns if `float < 0.004` and `int(80) < max(|chunkX|, |chunkZ|)`.
- **End cities** are skipped within 1008 blocks of the origin (the main island).
- **Trail ruins and trial chambers** use Java's placement (and so the full 64-bit seed), as Bedrock does.

### Biome checks (`bedrock_viable`)

Bedrock checks the biome at the structure's own chunk-centre position. Overworld structures must **also** pass Java's `isViableStructurePos` check: SeedFinder found that the two gates together match villages in-game, while either alone lets through villages that aren't there. Specific rules:
- Villages: plains, sunflower plains, desert, savanna, taiga, snowy plains, snowy taiga, meadow.
- Shipwrecks: beach, snowy beach or any ocean. Ocean ruins: any ocean. Monuments: deep ocean.
- Bastions: anything but basalt deltas. Fortresses and Nether ruined portals: anywhere.
- Others: cubiomes' `isViableFeatureBiome`.

### Fallbacks

If a structure has no Bedrock data (desert wells, End gateways, End islands), `mc_structures` falls back to Java placement; these are flagged `bedrockApprox: true` in `src/data/structures.ts` and shown with **≈** in the filters. Spawn and strongholds also use Java's algorithms.

## Verification

`tests/bedrock.test.ts` loads the real `.wasm` and checks, for Bedrock seed **6666**, that the villages within 1,600 blocks are exactly the eight confirmed in a real Bedrock world (taken from SeedFinder's ground-truth regression test), and that three attempts that land in rivers are rejected. It also checks that Bedrock and Java placement differ, that fortress and bastion positions never overlap (with more bastions than fortresses), and that Java fallbacks still return results.

## Improving accuracy

Good next steps, if you have in-game ground truth:
- Verify the fortress/bastion draw against a real Bedrock world and add a test.
- Add Bedrock stronghold and spawn algorithms.
- Add more ground-truth tests for other structure types, following the village test's pattern.
