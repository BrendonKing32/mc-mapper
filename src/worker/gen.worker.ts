/// <reference lib="webworker" />
const wasmUrl = '/wasm/cubiomes.wasm';

type Exports = {
  memory: WebAssembly.Memory;
  _initialize?: () => void;
  mc_init(mc: number, lo: number, hi: number, large: number, dim: number, bedrock: number): void;
  mc_biomes(x: number, z: number, w: number, h: number, scale: number): number;
  mc_biome_at(x: number, z: number): number;
  mc_structures(type: number, x0: number, z0: number, x1: number, z1: number, out: number, max: number): number;
  mc_spawn(out: number): void;
  mc_strongholds(out: number, count: number): number;
  mc_malloc(n: number): number;
  mc_free(p: number): void;
};

let ex: Exports;
let dim = 0; // 0 = Overworld, -1 = Nether (strongholds/spawn only exist in the Overworld)
const ready = (async () => {
  const wasi = new Proxy({}, { get: () => () => 0 });
  const { instance } = await WebAssembly.instantiateStreaming(fetch(wasmUrl), { wasi_snapshot_preview1: wasi });
  ex = instance.exports as unknown as Exports;
  ex._initialize?.();
})();

const MAX = 4096;
// Stronghold generation is slow (biome searches); compute lazily in growing batches and cache per world.
let strongholds: { count: number; pts: number[] } = { count: 0, pts: [] };
function strongholdsNear(out: number, x0: number, z0: number, x1: number, z1: number): number[] {
  if (dim !== 0) return [];
  const reach = Math.max(Math.abs(x0), Math.abs(x1), Math.abs(z0), Math.abs(z1));
  const want = reach < 3500 ? 3 : reach < 6500 ? 9 : 128; // ring sizes 3, 6, 10, 15, ...
  if (strongholds.count < want) {
    const n = ex.mc_strongholds(out, want);
    strongholds = { count: want, pts: readPairs(out, n) };
  }
  const res: number[] = [];
  for (let i = 0; i < strongholds.pts.length; i += 2) {
    const x = strongholds.pts[i], z = strongholds.pts[i + 1];
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) res.push(x, z);
  }
  return res;
}
const readPairs = (ptr: number, n: number) => Array.from(new Int32Array(ex.memory.buffer, ptr, n * 2));

self.onmessage = async (e: MessageEvent) => {
  const m = e.data;
  try {
    await ready;
    handle(m);
  } catch (err) {
    self.postMessage({ op: 'error', gen: m.gen, message: String(err) });
  }
};

function handle(m: any) {
  switch (m.op) {
    case 'init': {
      dim = m.dim ?? 0;
      ex.mc_init(m.mc, m.lo >>> 0, m.hi >>> 0, m.large ? 1 : 0, dim, m.bedrock ? 1 : 0);
      strongholds = { count: 0, pts: [] };
      let spawn: { x: number; z: number } | null = null;
      if (dim === 0) {
        const p = ex.mc_malloc(8);
        ex.mc_spawn(p);
        const [x, z] = readPairs(p, 1);
        ex.mc_free(p);
        spawn = { x, z };
      }
      if (!m.quiet) self.postMessage({ op: 'ready', gen: m.gen, spawn });
      break;
    }
    case 'tile': {
      const n = m.size * m.size;
      const p = ex.mc_biomes(m.x, m.z, m.size, m.size, m.scale);
      const ids = new Uint8Array(n);
      if (p) {
        const src = new Int32Array(ex.memory.buffer, p, n);
        for (let i = 0; i < n; i++) ids[i] = src[i];
        ex.mc_free(p);
      }
      self.postMessage({ op: 'tile', gen: m.gen, key: m.key, ids }, { transfer: [ids.buffer] });
      break;
    }
    case 'structures': {
      const out = ex.mc_malloc(MAX * 8);
      const result: Record<number, number[]> = {};
      for (const t of m.types as number[]) {
        if (t === 100) { result[t] = strongholdsNear(out, m.x0, m.z0, m.x1, m.z1); continue; }
        const n = ex.mc_structures(t, m.x0, m.z0, m.x1, m.z1, out, MAX);
        result[t] = n > 0 ? readPairs(out, n) : [];
      }
      ex.mc_free(out);
      self.postMessage({ op: 'structures', gen: m.gen, key: m.key, result });
      break;
    }
    case 'biomeAt': {
      self.postMessage({ op: 'biomeAt', gen: m.gen, id: ex.mc_biome_at(m.x, m.z), x: m.x, z: m.z });
      break;
    }
  }
}
