// Thin WASM-facing wrapper around cubiomes (see vendor/cubiomes).
#include <stdint.h>
#include <stdlib.h>
#include "generator.h"
#include "finders.h"

static Generator g;
static int g_mc;
static uint64_t g_seed;
static int g_dim;
static int g_bedrock;

// dim: 0 = Overworld, -1 = Nether, +1 = End (see biomes.h DIM_*).
// bedrock: Overworld biomes match Java for the full 64-bit seed (1.18+ seed parity), but Bedrock's
// Nether and End still only use the low 32 bits of the seed, and its structures are placed by
// bedrock_structure_pos() below.
void mc_init(int mc, uint32_t seed_lo, uint32_t seed_hi, int large, int dim, int bedrock)
{
    g_mc = mc;
    g_seed = ((uint64_t)seed_hi << 32) | seed_lo;
    g_dim = dim;
    g_bedrock = bedrock;
    setupGenerator(&g, mc, large ? LARGE_BIOMES : 0);
    uint64_t gen_seed = (bedrock && dim != DIM_OVERWORLD) ? (uint64_t)(int64_t)(int32_t)seed_lo : g_seed;
    applySeed(&g, dim, gen_seed);
}

// Block height biomes are sampled at. Since 1.18 the Overworld picks cave biomes (lush caves,
// dripstone, deep dark) by depth below the terrain, so sampling at sea level returns caves
// under any land above y=63. Sampling above the build limit always yields the surface biome.
// Older versions and the other dimensions ignore y; keep sea level there.
static int sample_y(void)
{
    return (g_dim == DIM_OVERWORLD && g_mc >= MC_1_18) ? 320 : 63;
}

// Generates w*h biome ids at 1:scale; returns malloc'd int buffer (free with mc_free).
int *mc_biomes(int x, int z, int w, int h, int scale)
{
    Range r = { scale, x, z, w, h, sample_y() / (scale == 1 ? 1 : 4), 1 };
    int *cache = allocCache(&g, r);
    if (!cache) return 0;
    if (genBiomes(&g, cache, r) != 0) { free(cache); return 0; }
    return cache;
}

int mc_biome_at(int x, int z)
{
    return getBiomeAt(&g, 1, x, sample_y(), z);
}

// --- Bedrock structure placement ---
// Bedrock seeds a Mersenne Twister per region from the low 32 bits of
// regX*341873128712 + regZ*132897987541 + seed + salt and draws the chunk offset from it: one draw
// per axis (uniform) or the average of two (triangular, for the large structures). Constants and
// rules follow the open-source Bedrock finders SeedFinder (github.com/zebedelu/SeedFinder, zlib,
// itself a port of Chunkbase's behavior) and MCBE-seedcracker, which agree on every value here.

// MT19937, generating only the first few outputs: output i needs state words i, i+1 and i+397.
typedef struct { uint32_t s[624]; int i; } MT;
static void mt_seed(MT *mt, uint32_t seed, int n)
{
    mt->s[0] = seed;
    for (int k = 1; k < n + 397; k++)
        mt->s[k] = 1812433253u * (mt->s[k - 1] ^ (mt->s[k - 1] >> 30)) + k;
    mt->i = 0;
}
static uint32_t mt_next(MT *mt)
{
    int k = mt->i++;
    uint32_t y = (mt->s[k] & 0x80000000u) | (mt->s[k + 1] & 0x7fffffffu);
    y = mt->s[k + 397] ^ (y >> 1) ^ ((y & 1) ? 0x9908b0dfu : 0);
    y ^= y >> 11;
    y ^= (y << 7) & 0x9d2c5680u;
    y ^= (y << 15) & 0xefc60000u;
    return y ^ (y >> 18);
}
static int mt_int(MT *mt, int n) { return (int)(mt_next(mt) % (uint32_t)n); }
static float mt_float(MT *mt) { return mt_next(mt) * (1.0f / 4294967296.0f); }

enum { BE_UNIFORM, BE_TRIANGULAR, BE_JAVA, BE_MINESHAFT };
typedef struct { int salt, spacing, range, spread, dim, min_mc; } BedrockConfig;

// spacing = region size and range = spacing - separation, both in chunks.
static int bedrock_config(int type, int mc, BedrockConfig *c)
{
    const int old = mc <= MC_1_17; // 1.18 spread out villages, shipwrecks and ocean ruins
    switch (type) {
    case Village:        *c = old ? (BedrockConfig){ 10387312, 27, 17, BE_TRIANGULAR, 0, MC_1_14 }
                                  : (BedrockConfig){ 10387312, 34, 26, BE_TRIANGULAR, 0, MC_1_14 }; break;
    case Shipwreck:      *c = old ? (BedrockConfig){ 165745295, 10, 5, BE_TRIANGULAR, 0, MC_1_14 }
                                  : (BedrockConfig){ 165745295, 24, 20, BE_UNIFORM, 0, MC_1_14 }; break;
    case Ocean_Ruin:     *c = old ? (BedrockConfig){ 14357621, 12, 5, BE_TRIANGULAR, 0, MC_1_16 }
                                  : (BedrockConfig){ 14357621, 20, 12, BE_UNIFORM, 0, MC_1_16 }; break;
    case Desert_Pyramid:
    case Jungle_Pyramid:
    case Swamp_Hut:
    case Igloo:          *c = (BedrockConfig){ 14357617, 32, 24, BE_UNIFORM, 0, MC_1_14 }; break;
    case Ruined_Portal:  *c = (BedrockConfig){ 40552231, 40, 25, BE_UNIFORM, 0, MC_1_14 }; break;
    case Outpost:        *c = (BedrockConfig){ 165745296, 80, 56, BE_TRIANGULAR, 0, MC_1_14 }; break;
    case Mansion:        *c = (BedrockConfig){ 10387319, 80, 60, BE_TRIANGULAR, 0, MC_1_14 }; break;
    case Monument:       *c = (BedrockConfig){ 10387313, 32, 27, BE_TRIANGULAR, 0, MC_1_14 }; break;
    case Treasure:       *c = (BedrockConfig){ 16842397, 4, 2, BE_TRIANGULAR, 0, MC_1_14 }; break;
    case Ancient_City:   *c = (BedrockConfig){ 20083232, 24, 16, BE_TRIANGULAR, 0, MC_1_19_2 }; break;
    // Newer structures use Java's placement (and so the full 64-bit seed).
    case Trail_Ruins:    *c = (BedrockConfig){ 0, 0, 0, BE_JAVA, 0, MC_1_20 }; break;
    case Trial_Chambers: *c = (BedrockConfig){ 0, 0, 0, BE_JAVA, 0, MC_1_21_1 }; break;
    case Mineshaft:      *c = (BedrockConfig){ 0, 1, 1, BE_MINESHAFT, 0, MC_1_14 }; break;
    case Fortress:
    case Bastion:        *c = (BedrockConfig){ 30084232, 30, 26, BE_UNIFORM, DIM_NETHER, MC_1_14 }; break;
    case Ruined_Portal_N:*c = (BedrockConfig){ 40552231, 25, 15, BE_UNIFORM, DIM_NETHER, MC_1_14 }; break;
    case End_City:       *c = (BedrockConfig){ 10387313, 20, 9, BE_TRIANGULAR, DIM_END, MC_1_14 }; break;
    default: return 0;
    }
    return mc >= c->min_mc;
}

// Block position of the region's generation attempt; 0 if the region has none.
static int bedrock_structure_pos(int type, const BedrockConfig *c, int rx, int rz, Pos *p)
{
    if (c->spread == BE_JAVA)
        return getStructurePos(type, g_mc, g_seed, rx, rz, p);
    MT mt;
    if (c->spread == BE_MINESHAFT) {
        // Per chunk (rx, rz are chunk coords): reseeded from the world seed and the chunk.
        mt_seed(&mt, (uint32_t)g_seed, 2);
        uint32_t a = mt_next(&mt) >> 1, b = mt_next(&mt) >> 1;
        mt_seed(&mt, (uint32_t)(a * (uint32_t)rx) ^ (uint32_t)(b * (uint32_t)rz) ^ (uint32_t)g_seed, 3);
        mt_next(&mt);
        p->x = rx * 16; p->z = rz * 16;
        int far = abs(rx) > abs(rz) ? abs(rx) : abs(rz);
        return mt_float(&mt) < 0.004f && mt_int(&mt, 80) < far;
    }
    uint64_t rs = (uint64_t)(int64_t)rx * 341873128712ull + (uint64_t)(int64_t)rz * 132897987541ull
        + g_seed + (uint64_t)c->salt;
    int nether_complex = type == Fortress || type == Bastion;
    mt_seed(&mt, (uint32_t)rs, c->spread == BE_TRIANGULAR ? 4 : nether_complex ? 3 : 2);
    int cx, cz;
    if (c->spread == BE_TRIANGULAR) {
        int x1 = mt_int(&mt, c->range), x2 = mt_int(&mt, c->range);
        int z1 = mt_int(&mt, c->range), z2 = mt_int(&mt, c->range);
        cx = (x1 + x2) / 2; cz = (z1 + z2) / 2;
    } else {
        cx = mt_int(&mt, c->range); cz = mt_int(&mt, c->range);
    }
    p->x = (rx * c->spacing + cx) * 16 + 8;
    p->z = (rz * c->spacing + cz) * 16 + 8;
    // Each Nether region holds a fortress (1/3) or a bastion (2/3). The draw that picks which is
    // inferred from those odds and not yet verified in-game.
    if (nether_complex && (mt_int(&mt, 6) >= 2) != (type == Bastion)) return 0;
    if (type == End_City) return (int64_t)p->x * p->x + (int64_t)p->z * p->z >= 1008 * 1008;
    return 1;
}

// Bedrock checks the biome at the structure's own (chunk-centre) position. Overworld structures must
// also pass Java's checks: SeedFinder found that gate, together with this one, matches villages in-game
// (either alone lets through villages that aren't there).
static int bedrock_viable(int type, int x, int z)
{
    if (type == Trail_Ruins || type == Trial_Chambers || type == End_City)
        return isViableStructurePos(type, &g, x, z, 0);
    if (type == Fortress || type == Ruined_Portal_N) return 1;
    if (g_dim == DIM_OVERWORLD && !isViableStructurePos(type, &g, x, z, 0)) return 0;
    if (type == Mineshaft) return 1;
    int id = getBiomeAt(&g, 4, x >> 2, sample_y() >> 2, z >> 2);
    switch (type) {
    case Village:
        return id == plains || id == sunflower_plains || id == desert || id == savanna || id == taiga
            || id == snowy_tundra || id == snowy_taiga || id == meadow;
    case Shipwreck: return id == beach || id == snowy_beach || isOceanic(id);
    case Ocean_Ruin: return isOceanic(id);
    case Monument: return isDeepOcean(id);
    case Bastion: return id != basalt_deltas;
    default: return isViableFeatureBiome(g_mc, type, id);
    }
}

static int bedrock_structures(int type, int x0, int z0, int x1, int z1, int *out, int max)
{
    BedrockConfig c;
    if (!bedrock_config(type, g_mc, &c) || c.dim != g_dim) return -1;
    if (c.spread == BE_JAVA) return -2; // caller falls back to the Java path
    int regBlocks = c.spacing * 16;
    int rx0 = floordiv(x0, regBlocks) - 1, rz0 = floordiv(z0, regBlocks) - 1;
    int rx1 = floordiv(x1, regBlocks) + 1, rz1 = floordiv(z1, regBlocks) + 1;
    int n = 0;
    for (int rz = rz0; rz <= rz1; rz++)
        for (int rx = rx0; rx <= rx1; rx++) {
            Pos p;
            if (!bedrock_structure_pos(type, &c, rx, rz, &p)) continue;
            if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1) continue;
            if (!bedrock_viable(type, p.x, p.z)) continue;
            if (n >= max) return n;
            out[2 * n] = p.x; out[2 * n + 1] = p.z; n++;
        }
    return n;
}

// Writes up to max (x,z) int pairs of viable structures in block rect; returns count.
// On Bedrock, structures it has no placement data for (desert wells, End gateways/islands) use
// Java's placement, so are approximate.
int mc_structures(int type, int x0, int z0, int x1, int z1, int *out, int max)
{
    if (g_bedrock) {
        int n = bedrock_structures(type, x0, z0, x1, z1, out, max);
        if (n != -2 && (n >= 0 || type != Desert_Well && type != End_Gateway && type != End_Island)) return n;
    }
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
