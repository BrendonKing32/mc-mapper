/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NEUTRAL, SEA_LEVEL, shadeTile } from '../src/map/terrain';

const { instance } = await WebAssembly.instantiate(readFileSync(new URL('../public/wasm/cubiomes.wasm', import.meta.url)), {
  wasi_snapshot_preview1: new Proxy({}, { get: () => () => 0 }),
});
const ex = instance.exports as any;
ex._initialize?.();

function heights(mc: number, dim: number, x: number, z: number, w: number, h: number, scale: number): Float32Array | null {
  ex.mc_init(mc, 12345, 0, 0, dim, 0);
  const p = ex.mc_heights(x, z, w, h, scale);
  if (!p) return null;
  const a = new Float32Array(ex.memory.buffer, p, w * h).slice();
  ex.mc_free(p);
  return a;
}
/** A (size+2)² grid from a height function of the sample position (border included). */
const grid = (size: number, f: (i: number, j: number) => number) =>
  Float32Array.from({ length: (size + 2) ** 2 }, (_, k) => f((k % (size + 2)) - 1, Math.floor(k / (size + 2)) - 1));

describe('mc_heights', () => {
  it('gives plausible Overworld heights at every zoom, for old and new versions', () => {
    for (const mc of [28, 21])
      for (const scale of [1, 4, 16, 64, 256]) {
        const h = heights(mc, 0, 0, 0, 34, 34, scale)!;
        expect(h).not.toBeNull();
        for (const y of h) expect(y).toBeGreaterThan(-64), expect(y).toBeLessThan(320);
      }
  });

  it('interpolates 1:1 between the 1:4 cells, matching them at cell centres', () => {
    const quarter = heights(28, 0, 0, 0, 8, 8, 4)!;
    const block = heights(28, 0, 0, 0, 32, 32, 1)!;
    // 1:4 cell (i, j) is centred on block (4i+2, 4j+2)
    for (const [i, j] of [[1, 1], [3, 5], [6, 2]]) expect(block[(4 * j + 2) * 32 + 4 * i + 2]).toBeCloseTo(quarter[j * 8 + i], 3);
  });

  it('agrees with itself across tile edges and zoom-level sampling', () => {
    const whole = heights(28, 0, 0, 0, 20, 4, 16)!;
    const right = heights(28, 0, 10, 0, 10, 4, 16)!;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 10; i++) expect(right[j * 10 + i]).toBeCloseTo(whole[j * 20 + 10 + i], 3);
  });

  it('has the End void at 0 next to the main island, and no Nether height map', () => {
    const end = heights(28, 1, -50, -50, 100, 100, 4)!; // ±200 blocks: island, and the void ring beyond it
    expect(Math.max(...end)).toBeGreaterThan(40);
    expect(Math.min(...end)).toBe(0);
    expect(heights(28, -1, 0, 0, 8, 8, 4)).toBeNull();
  });
});

describe('shadeTile', () => {
  it('leaves flat land at sea level alone and keeps rounded heights', () => {
    const { shade, height } = shadeTile(grid(4, () => SEA_LEVEL + 0.4), 4, 4, 0);
    expect([...shade].every((s) => Math.abs(s - NEUTRAL * 0.92) <= 1)).toBe(true);
    expect([...height]).toEqual(Array(16).fill(SEA_LEVEL));
  });

  it('lights slopes facing north-west and shadows ones facing south-east', () => {
    const rising = shadeTile(grid(4, (i) => 100 + 8 * i), 4, 4, 0).shade; // higher to the east: faces west, towards the light
    const falling = shadeTile(grid(4, (i) => 200 - 8 * i), 4, 4, 0).shade;
    expect(rising[5]).toBeGreaterThan(falling[5]);
  });

  it('shades edge pixels from the border, so tiles join up', () => {
    const { shade } = shadeTile(grid(4, (i) => 250 + 8 * i), 4, 4, 0); // high enough that height doesn't brighten it
    expect(shade[0]).toBe(shade[1]);
  });

  it('darkens deeper water and the End void', () => {
    const shallow = shadeTile(grid(2, () => SEA_LEVEL - 5), 2, 4, 0).shade[0];
    const deep = shadeTile(grid(2, () => SEA_LEVEL - 40), 2, 4, 0).shade[0];
    expect(deep).toBeLessThan(shallow);
    expect(shallow).toBeLessThan(NEUTRAL);
    expect(shadeTile(grid(2, () => 0), 2, 4, 1).shade[0]).toBeLessThan(NEUTRAL / 2);
    expect(shadeTile(grid(2, () => 0), 2, 4, 0).shade[0]).toBeGreaterThanOrEqual(NEUTRAL / 2); // Overworld 0 is water, not void
  });
});
