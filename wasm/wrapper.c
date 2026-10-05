// Thin WASM-facing wrapper around cubiomes (see vendor/cubiomes).
#include <stdint.h>
#include <stdlib.h>
#include "generator.h"
#include "finders.h"

static Generator g;
static int g_mc;
static uint64_t g_seed;
static int g_dim;

// dim: 0 = Overworld, -1 = Nether, +1 = End (see biomes.h DIM_*).
void mc_init(int mc, uint32_t seed_lo, uint32_t seed_hi, int large, int dim)
{
    g_mc = mc;
    g_seed = ((uint64_t)seed_hi << 32) | seed_lo;
    g_dim = dim;
    setupGenerator(&g, mc, large ? LARGE_BIOMES : 0);
    applySeed(&g, dim, g_seed);
}

// Generates w*h biome ids at 1:scale; returns malloc'd int buffer (free with mc_free).
int *mc_biomes(int x, int z, int w, int h, int scale)
{
    Range r = { scale, x, z, w, h, 63 / (scale == 1 ? 1 : 4), 1 };
    int *cache = allocCache(&g, r);
    if (!cache) return 0;
    if (genBiomes(&g, cache, r) != 0) { free(cache); return 0; }
    return cache;
}

int mc_biome_at(int x, int z)
{
    return getBiomeAt(&g, 1, x, 63, z);
}

// Writes up to max (x,z) int pairs of viable structures in block rect; returns count.
int mc_structures(int type, int x0, int z0, int x1, int z1, int *out, int max)
{
    StructureConfig sc;
    if (!getStructureConfig(type, g_mc, &sc) || sc.dim != g_dim) return -1;
    int regBlocks = sc.regionSize * 16;
    int rx0 = (int)((x0 < 0 ? x0 - regBlocks + 1 : x0) / regBlocks) - 1;
    int rz0 = (int)((z0 < 0 ? z0 - regBlocks + 1 : z0) / regBlocks) - 1;
    int rx1 = (int)((x1 < 0 ? x1 - regBlocks + 1 : x1) / regBlocks) + 1;
    int rz1 = (int)((z1 < 0 ? z1 - regBlocks + 1 : z1) / regBlocks) + 1;
    int n = 0;
    for (int rz = rz0; rz <= rz1; rz++)
        for (int rx = rx0; rx <= rx1; rx++) {
            Pos p;
            if (!getStructurePos(type, g_mc, g_seed, rx, rz, &p)) continue;
            if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1) continue;
            if (!isViableStructurePos(type, &g, p.x, p.z, 0)) continue;
            if (n >= max) return n;
            out[2 * n] = p.x; out[2 * n + 1] = p.z; n++;
        }
    return n;
}

void mc_spawn(int *out)
{
    Pos p = getSpawn(&g);
    out[0] = p.x; out[1] = p.z;
}

// Strongholds (first `count`), written as x,z pairs.
int mc_strongholds(int *out, int count)
{
    StrongholdIter sh;
    initFirstStronghold(&sh, g_mc, g_seed);
    int n = 0;
    while (n < count && nextStronghold(&sh, &g) > 0) {
        out[2 * n] = sh.pos.x; out[2 * n + 1] = sh.pos.z; n++;
    }
    return n;
}

int mc_is_slime(int cx, int cz) { return isSlimeChunk(g_seed, cx, cz); }
void *mc_malloc(int n) { return malloc(n); }
void mc_free(void *p) { free(p); }
