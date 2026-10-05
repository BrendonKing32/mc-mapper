// Biome ids follow cubiomes' BiomeID enum. Colors are [r,g,b].
// `dim` is the dimension the biome generates in (0 = Overworld, -1 = Nether).
export type Biome = { id: number; name: string; color: [number, number, number]; dim: -1 | 0 };

const raw: [number, string, string][] = [
  [0, 'Ocean', '#000070'], [1, 'Plains', '#8db360'], [2, 'Desert', '#fa9418'], [3, 'Windswept Hills', '#606060'],
  [4, 'Forest', '#056621'], [5, 'Taiga', '#0b6659'], [6, 'Swamp', '#07f9b2'], [7, 'River', '#0000ff'],
  [10, 'Frozen Ocean', '#7070d6'], [11, 'Frozen River', '#a0a0ff'], [12, 'Snowy Plains', '#ffffff'],
  [13, 'Snowy Mountains', '#a0a0a0'], [14, 'Mushroom Fields', '#ff00ff'], [15, 'Mushroom Shore', '#a000ff'],
  [16, 'Beach', '#fade55'], [17, 'Desert Hills', '#d25f12'], [18, 'Wooded Hills', '#22551c'],
  [19, 'Taiga Hills', '#163933'], [20, 'Mountain Edge', '#72789a'], [21, 'Jungle', '#537b09'],
  [22, 'Jungle Hills', '#2c4205'], [23, 'Sparse Jungle', '#628b17'], [24, 'Deep Ocean', '#000030'],
  [25, 'Stony Shore', '#a2a284'], [26, 'Snowy Beach', '#faf0c0'], [27, 'Birch Forest', '#307444'],
  [28, 'Birch Forest Hills', '#1f5f32'], [29, 'Dark Forest', '#40511a'], [30, 'Snowy Taiga', '#31554a'],
  [31, 'Snowy Taiga Hills', '#243f36'], [32, 'Old Growth Pine Taiga', '#596651'], [33, 'Giant Tree Taiga Hills', '#454f3e'],
  [34, 'Windswept Forest', '#507050'], [35, 'Savanna', '#bdb25f'], [36, 'Savanna Plateau', '#a79d64'],
  [37, 'Badlands', '#d94515'], [38, 'Wooded Badlands', '#b09765'], [39, 'Badlands Plateau', '#ca8c65'],
  [44, 'Warm Ocean', '#0000ac'], [45, 'Lukewarm Ocean', '#000090'], [46, 'Cold Ocean', '#202070'],
  [47, 'Deep Warm Ocean', '#000050'], [48, 'Deep Lukewarm Ocean', '#000040'], [49, 'Deep Cold Ocean', '#202038'],
  [50, 'Deep Frozen Ocean', '#404090'],
  [129, 'Sunflower Plains', '#b5db88'], [130, 'Desert Lakes', '#ffbc40'], [131, 'Windswept Gravelly Hills', '#888888'],
  [132, 'Flower Forest', '#2d8e49'], [133, 'Taiga Mountains', '#339287'], [134, 'Swamp Hills', '#2fffda'],
  [140, 'Ice Spikes', '#b4dcdc'], [149, 'Modified Jungle', '#7ba331'], [151, 'Modified Jungle Edge', '#8ab33f'],
  [155, 'Old Growth Birch Forest', '#589c6c'], [156, 'Tall Birch Hills', '#47875a'], [157, 'Dark Forest Hills', '#687942'],
  [158, 'Snowy Taiga Mountains', '#597d72'], [160, 'Old Growth Spruce Taiga', '#818e79'],
  [161, 'Giant Spruce Taiga Hills', '#6d7766'], [162, 'Modified Gravelly Mountains', '#789878'],
  [163, 'Windswept Savanna', '#e5da87'], [164, 'Shattered Savanna Plateau', '#cfc58c'], [165, 'Eroded Badlands', '#ff6d3d'],
  [166, 'Modified Wooded Badlands', '#d8bf8d'], [167, 'Modified Badlands Plateau', '#f2b48d'],
  [168, 'Bamboo Jungle', '#768e14'], [169, 'Bamboo Jungle Hills', '#3b470a'],
  [174, 'Dripstone Caves', '#7a6a55'], [175, 'Lush Caves', '#8cd86a'],
  [177, 'Meadow', '#60a445'], [178, 'Grove', '#88bb67'], [179, 'Snowy Slopes', '#c4d8e8'],
  [180, 'Jagged Peaks', '#dcdcc8'], [181, 'Frozen Peaks', '#b0b3ce'], [182, 'Stony Peaks', '#7b8f74'],
  [183, 'Deep Dark', '#0a2230'], [184, 'Mangrove Swamp', '#67352b'], [185, 'Cherry Grove', '#f5a3c7'],
  [186, 'Pale Garden', '#b8bfb2'],
  // Nether
  [8, 'Nether Wastes', '#572526'], [170, 'Soul Sand Valley', '#4d3a2e'], [171, 'Crimson Forest', '#981a11'],
  [172, 'Warped Forest', '#49907b'], [173, 'Basalt Deltas', '#645f63'],
];

const hex = (h: string): [number, number, number] =>
  [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const NETHER_IDS = new Set([8, 170, 171, 172, 173]);
export const BIOMES: Biome[] = raw.map(([id, name, c]) => ({ id, name, color: hex(c), dim: NETHER_IDS.has(id) ? -1 : 0 }));
export const BIOME_BY_ID = new Map(BIOMES.map((b) => [b.id, b]));
export const biomeName = (id: number) => BIOME_BY_ID.get(id)?.name ?? `Biome ${id}`;

/** RGB lookup table indexed by biome id (0..255). Unknown ids are gray. */
export const COLOR_LUT = (() => {
  const lut = new Uint8Array(256 * 3).fill(128);
  for (const b of BIOMES) lut.set(b.color, b.id * 3);
  return lut;
})();
