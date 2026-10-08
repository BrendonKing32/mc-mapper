# Accuracy and Limitations

## Java Edition

Java maps are as accurate as [cubiomes](https://github.com/Cubitect/cubiomes), which is the library most seed-map tools are built on. A few things to know:

- **Structure markers show generation *attempts* that pass biome checks.** cubiomes checks the biome at the structure's position, but not everything the game checks (e.g. terrain height for some structures). Rarely a marker may have no structure at the spot, or a structure may be slightly offset from the marker.
- **Surface biomes only.** Since 1.18 the game picks cave biomes (Lush Caves, Dripstone Caves, Deep Dark) by depth. The map samples above the build limit so you always see what's on the surface. Ancient cities still appear as structures.
- **Strongholds** are computed lazily: 3 within ~3,500 blocks of the origin, 9 within ~6,500, and the full 128 beyond that (stronghold search is slow because each one does a biome search).
- **Supported versions:** 1.7 through 1.21 (Winter Drop). Pick the version the world was created in; chunks generated in older versions keep their old terrain after an upgrade.

## Bedrock Edition

Bedrock is not implemented in cubiomes. MC Mapper adds it on top; see [[Bedrock Support]] for how.

| What | Status on Bedrock |
|---|---|
| Overworld biomes | **Exact** (same as Java for the same 64-bit seed since 1.18) |
| Villages, outposts, mansions, monuments, temples, igloos, swamp huts, ruined portals, shipwrecks, ocean ruins, buried treasure, ancient cities, mineshafts, End cities | **Bedrock's own placement**; villages verified against a real world |
| Nether fortress / bastion split | Bedrock's 1-in-3 / 2-in-3 split, but the random draw that decides which is **inferred, not verified** |
| Trail ruins, trial chambers | Java's placement, which Bedrock also uses |
| Spawn, strongholds, desert wells, End gateways, End islands | **Approximate**: shown at Java's positions (marked ≈) |
| Nether and End biomes | **Approximate**: generated from the low 32 bits of the seed like Bedrock, but with Java's generator |
| Versions | 1.18, 1.20, 1.21+ only |

## General

- Coordinates are block coordinates; structure positions are the chunk position the game uses (usually chunk-centre, `+8`).
- Saved data is per browser; see [[Data and Storage]].
- The map needs WebAssembly, Web Workers and `localStorage` (the map works without storage, but seeds can't be saved).
