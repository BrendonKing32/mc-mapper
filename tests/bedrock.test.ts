/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Runs the real WASM generator (public/wasm/cubiomes.wasm).
const { instance } = await WebAssembly.instantiate(readFileSync(new URL('../public/wasm/cubiomes.wasm', import.meta.url)), {
  wasi_snapshot_preview1: new Proxy({}, { get: () => () => 0 }),
});
const ex = instance.exports as any;
ex._initialize?.();

function structures(type: number, seed: number, bedrock: boolean, r: number, dim = 0): string[] {
  ex.mc_init(28, seed >>> 0, seed < 0 ? 0xffffffff : 0, 0, dim, bedrock ? 1 : 0);
  const out = ex.mc_malloc(4096 * 8);
  const n = ex.mc_structures(type, -r, -r, r, r, out, 4096);
  const xs = n > 0 ? Array.from(new Int32Array(ex.memory.buffer, out, n * 2)) : [];
  ex.mc_free(out);
  const res: string[] = [];
  for (let i = 0; i < xs.length; i += 2) res.push(`${xs[i]},${xs[i + 1]}`);
  return res;
}

describe('Bedrock structure placement', () => {
  // Bedrock seed 6666, villages within 100 chunks of 0,0 checked in-game (from SeedFinder's regression test,
  // github.com/zebedelu/SeedFinder server/tests/test_scan_village_groundtruth.py).
  const VILLAGE = 5;
  const real = ['-168,56', '744,-344', '-312,-1000', '744,-872', '248,1144', '-312,1208', '1256,-328', '56,-1480'];
  const notThere = ['264,-296', '-776,-872', '776,-1368']; // attempts that land in rivers

  it('finds exactly the villages that exist in-game', () => {
    const got = structures(VILLAGE, 6666, true, 1600).filter((p) => Math.hypot(...p.split(',').map(Number)) <= 1600);
    expect(got.sort()).toEqual([...real].sort());
    for (const v of notThere) expect(got).not.toContain(v);
  });

  it('differs from Java placement', () => {
    expect(structures(VILLAGE, 6666, false, 1600)).not.toEqual(structures(VILLAGE, 6666, true, 1600));
  });

  it('splits Nether regions between fortresses and bastions', () => {
    const fortress = structures(18, 6666, true, 20000, -1);
    const bastion = structures(19, 6666, true, 20000, -1);
    expect(fortress.length).toBeGreaterThan(0);
    expect(bastion.length).toBeGreaterThan(fortress.length);
    expect(fortress.filter((p) => bastion.includes(p))).toEqual([]);
  });

  it('keeps Java fallbacks for structures without Bedrock data', () => {
    expect(structures(16, 6666, true, 3000).length).toBeGreaterThan(0); // desert well
  });
});
