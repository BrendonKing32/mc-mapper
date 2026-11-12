import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { JAVA_VERSIONS, LATEST_GENERATOR } from '../src/data/versions';

type GeneratorExports = {
  memory: WebAssembly.Memory;
  _initialize?: () => void;
  mc_init(mc: number, lo: number, hi: number, large: number, dim: number, bedrock: number): void;
  mc_biomes(x: number, z: number, w: number, h: number, scale: number): number;
  mc_biome_at(x: number, z: number): number;
  mc_structures(type: number, x0: number, z0: number, x1: number, z1: number, out: number, max: number): number;
  mc_malloc(n: number): number;
  mc_free(p: number): void;
};
const { instance } = await WebAssembly.instantiate(readFileSync(new URL('../public/wasm/cubiomes.wasm', import.meta.url)), {
  wasi_snapshot_preview1: new Proxy({}, { get: () => () => 0 }),
});
const ex = instance.exports as GeneratorExports;
ex._initialize?.();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

describe('updated biome generator', () => {
  it('matches the independently game-report-derived 1.21.5+ climate entries', () => {
    // Reference: Zes-MinKey-Young/cubiomes@ca9fcb4, tables/btree215.h (Cubitect/cubiomes#162).
    // Compare all leaf entries, independent of how each implementation orders the search tree.
    const text = readFileSync(new URL('../vendor/cubiomes/tables/btree21_5.h', import.meta.url), 'utf8')
      .replace(/\/\/[^\n]*/g, '');
    const params = [...text.matchAll(/\{\s*(-?\d+)\s*,\s*(-?\d+)\s*\}/g)]
      .map((m) => [Number(m[1]), Number(m[2])]);
    const leaves = [...text.matchAll(/0x([\dA-Fa-f]{16})/g)]
      .map((m) => BigInt(`0x${m[1]}`))
      .filter((node) => node >> 56n === 255n)
      .map((node) => JSON.stringify([
        Number(node >> 48n & 255n),
        ...Array.from({ length: 6 }, (_, i) => params[Number(node >> BigInt(8 * i) & 255n)]),
      ])).sort();
    expect(leaves).toHaveLength(7593);
    expect(hash(leaves.join('\n'))).toBe('9ba492712120ed28af19a48477b1ed7d997551bf405d32e217322b0510e9c081');
  });

  it.each(JAVA_VERSIONS.filter((v) => v.mc >= 29))('uses the expanded Pale Gardens for $label', ({ mc }) => {
    ex.mc_init(28, 1, 0, 0, 0, 0);
    expect(ex.mc_biome_at(-3200, -3520)).toBe(29); // Dark Forest before 1.21.5
    ex.mc_init(mc, 1, 0, 0, 0, 0);
    expect(ex.mc_biome_at(-3200, -3520)).toBe(186); // Pale Garden
  });

  it.each([29, LATEST_GENERATOR.mc])('allows mansions in existing Pale Gardens with generator %i', (mc) => {
    const out = ex.mc_malloc(8);
    try {
      ex.mc_init(28, 0, 0, 0, 0, 0);
      expect(ex.mc_biome_at(19607, -35417)).toBe(186);
      expect(ex.mc_structures(9, 19600, -35424, 19600, -35424, out, 1)).toBe(0);
      ex.mc_init(mc, 0, 0, 0, 0, 0);
      expect(ex.mc_biome_at(19607, -35417)).toBe(186);
      expect(ex.mc_structures(9, 19600, -35424, 19600, -35424, out, 1)).toBe(1);
      expect([...new Int32Array(ex.memory.buffer, out, 2)]).toEqual([19600, -35424]);
    } finally {
      ex.mc_free(out);
    }
  });

  it.each([0, 1])('renders the new tile data consistently with point sampling (large=%i)', (large) => {
    ex.mc_init(LATEST_GENERATOR.mc, 0x89abcdef, 0xfedcba98, large, 0, 0);
    const ptr = ex.mc_biomes(-3200, -3520, 8, 8, 1);
    expect(ptr).not.toBe(0);
    try {
      const tile = [...new Int32Array(ex.memory.buffer, ptr, 64)];
      const sampled = Array.from({ length: 64 }, (_, i) => ex.mc_biome_at(-3200 + i % 8, -3520 + Math.floor(i / 8)));
      expect(tile).toEqual(sampled);
    } finally {
      ex.mc_free(ptr);
    }
  });
});

describe('legacy generation', () => {
  // Captured from the pre-upgrade committed WASM with the same full 64-bit seed and tile range.
  it.each([
    [10, 0, 'cf2a7f2ce4da3a053b143fa302a3d546322eb7e9745e02654648c08a19e38ea5'],
    [10, -1, '710468d5807e336c489a1e2739b42a69db19c87429e7d3060d0002ad4c97bc89'],
    [10, 1, '5f8eb77757b844a2310754d483d41d5f05150dbff2bc00504e11c437efe3b2cc'],
    ...[22, 25, 26, 27, 28].map((mc) => [mc, 0, 'f6a1544b77e64069593a46f8029c5d8f8d62dacf8831aa89324a036e21f2850d']),
    [28, -1, 'b47fe7ff489610c69814f3b71b8881011832bf8f742ac9052c2ba8a4d236df6a'],
    [28, 1, '8cefd42c2068eaea2a854459ac7b8119eded60b1a124840b9a17cb782d9ce9b2'],
  ] as [number, number, string][])('preserves generator %i, dimension %i', (mc, dim, expected) => {
    ex.mc_init(mc, 0x89abcdef, 0xfedcba98, 0, dim, 0);
    const ptr = ex.mc_biomes(-1024, -1024, 16, 16, 4);
    expect(ptr).not.toBe(0);
    try {
      expect(hash(JSON.stringify([...new Int32Array(ex.memory.buffer, ptr, 256)]))).toBe(expected);
    } finally {
      ex.mc_free(ptr);
    }
  });
});
