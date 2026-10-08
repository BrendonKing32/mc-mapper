import { COLOR_LUT, biomeName } from '../data/biomes';
import { STRUCTURES } from '../data/structures';
import { structureKey } from '../storage';
import { TileCache } from './tileCache';

const TILE = 128;
const SCALES = [1, 4, 16, 64, 256];
const MAX_INFLIGHT = 6;
// ~80 KB per tile (16 KB biome ids + 128x128 RGBA canvas), so ~40 MB. Visible tiles are always kept.
const TILE_BUDGET = 512;
const MAX_STRUCT_SPAN = 24000; // blocks; beyond this structure queries are skipped

type Tile = { ids: Uint8Array; canvas?: HTMLCanvasElement; filterVer: number };
type Found = { type: number; x: number; z: number };

export class MapView {
  private ctx: CanvasRenderingContext2D;
  // Separate workers so slow structure searches never stall tile generation (and vice versa).
  private worker = new Worker(new URL('../worker/gen.worker.ts', import.meta.url), { type: 'module' });
  private structWorker = new Worker(new URL('../worker/gen.worker.ts', import.meta.url), { type: 'module' });
  private tiles = new TileCache<Tile>(TILE_BUDGET, (t) => {
    if (t.canvas) t.canvas.width = t.canvas.height = 0; // release the backing store promptly
  });
  private pending = new Set<string>();
  private gen = 0;
  private cx = 0;
  private cz = 0;
  private zoom = 1 / 4; // screen px per block
  private biomeFilter = new Set<number>();
  private filterVer = 0;
  private enabled = new Set<number>(STRUCTURES.slice(0, 5).map((s) => s.type));
  private found: Found[] = [];
  private structKey = '';
  private structTimer = 0;
  private spawn: { x: number; z: number } | null = null;
  private ready = false; // true once the generator has initialized (spawn itself may be null, e.g. in the Nether)
  private raf = 0;
  private selected: Found | null = null;
  private visited = new Set<string>();
  private hideVisited = false;
  onHover: (x: number, z: number, biome: string) => void = () => {};
  onSelect: (f: Found | null) => void = () => {};
  onStatus: (msg: string) => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.worker.onmessage = (e) => this.onMessage(e.data);
    this.structWorker.onmessage = (e) => this.onMessage(e.data);
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    this.bindInput();
    this.resize();
  }

  setWorld(mc: number, lo: number, hi: number, large = false, dim = 0) {
    this.gen++;
    this.tiles.clear();
    this.pending.clear();
    this.found = [];
    this.structKey = '';
    this.spawn = null;
    this.ready = false;
    this.selected = null;
    this.onSelect(null);
    this.worker.postMessage({ op: 'init', gen: this.gen, mc, lo, hi, large, dim });
    this.structWorker.postMessage({ op: 'init', gen: this.gen, mc, lo, hi, large, dim, quiet: true });
    this.onStatus('Generating…');
    this.cx = 0; this.cz = 0;
  }

  setBiomeFilter(ids: Set<number>) {
    this.biomeFilter = ids;
    this.filterVer++;
    this.schedule();
  }

  setStructures(types: Set<number>) {
    this.enabled = types;
    this.structKey = '';
    this.queueStructures();
    this.schedule();
  }

  /** Structures to draw as visited (`structureKey()` strings); `hide` leaves them off the map entirely. */
  setVisited(keys: Set<string>, hide = this.hideVisited) {
    this.visited = keys;
    this.hideVisited = hide;
    if (hide && this.selected && !this.shown(this.selected)) { this.selected = null; this.onSelect(null); }
    this.schedule();
  }

  private isVisited(f: Found) { return this.visited.has(structureKey(f.type, f.x, f.z)); }
  private shown(f: Found) { return this.enabled.has(f.type) && !(this.hideVisited && this.isVisited(f)); }

  goTo(x: number, z: number, zoom?: number) {
    this.cx = x; this.cz = z;
    if (zoom) this.zoom = zoom;
    this.queueStructures();
    this.schedule();
  }

  goToSpawn() { if (this.spawn) this.goTo(this.spawn.x, this.spawn.z); }

  private onMessage(m: any) {
    if (m.gen !== this.gen) return;
    if (m.op === 'error') {
      console.error('worker:', m.message);
      this.onStatus('Generation failed: ' + m.message);
    } else if (m.op === 'ready') {
      this.spawn = m.spawn;
      this.ready = true;
      if (m.spawn) this.goTo(m.spawn.x, m.spawn.z);
      else { this.queueStructures(); this.schedule(); }
      this.onStatus('');
    } else if (m.op === 'tile') {
      this.pending.delete(m.key);
      this.tiles.set(m.key, { ids: m.ids, filterVer: -1 });
      this.schedule();
    } else if (m.op === 'structures') {
      if (m.key !== this.structKey) return;
      this.found = [];
      for (const [t, pts] of Object.entries(m.result as Record<string, number[]>))
        for (let i = 0; i < pts.length; i += 2) this.found.push({ type: +t, x: pts[i], z: pts[i + 1] });
      this.schedule();
    }
  }

  private resize() {
    const p = this.canvas.parentElement!;
    const dpr = devicePixelRatio || 1;
    this.canvas.width = p.clientWidth * dpr;
    this.canvas.height = p.clientHeight * dpr;
    this.canvas.style.width = p.clientWidth + 'px';
    this.canvas.style.height = p.clientHeight + 'px';
    this.queueStructures();
    this.schedule();
  }

  private get cssW() { return this.canvas.width / (devicePixelRatio || 1); }
  private get cssH() { return this.canvas.height / (devicePixelRatio || 1); }
  private toScreen(x: number, z: number) { return [(x - this.cx) * this.zoom + this.cssW / 2, (z - this.cz) * this.zoom + this.cssH / 2]; }
  private toWorld(sx: number, sz: number) { return [(sx - this.cssW / 2) / this.zoom + this.cx, (sz - this.cssH / 2) / this.zoom + this.cz]; }

  private schedule() {
    if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
  }

  private pickScale() {
    // largest scale whose tile pixels are still >= ~1 screen px per sample
    let s = SCALES[0];
    for (const c of SCALES) if (c * this.zoom <= 1.01) s = c;
    return s;
  }

  private tileCanvas(t: Tile) {
    if (t.canvas && t.filterVer === this.filterVer) return t.canvas;
    const c = t.canvas ?? document.createElement('canvas');
    c.width = c.height = TILE;
    const img = new ImageData(TILE, TILE);
    const f = this.biomeFilter;
    for (let i = 0; i < t.ids.length; i++) {
      const id = t.ids[i];
      let r = COLOR_LUT[id * 3], g = COLOR_LUT[id * 3 + 1], b = COLOR_LUT[id * 3 + 2];
      if (f.size && !f.has(id)) { const y = (r + g + b) / 3 * 0.35; r = g = b = y; }
      img.data.set([r, g, b, 255], i * 4);
    }
    c.getContext('2d')!.putImageData(img, 0, 0);
    t.canvas = c; t.filterVer = this.filterVer;
    return c;
  }

  private draw() {
    const { ctx } = this;
    const dpr = devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#10141a';
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    ctx.imageSmoothingEnabled = false;

    const scale = this.pickScale();
    const span = TILE * scale;
    const [wx0, wz0] = this.toWorld(0, 0);
    const [wx1, wz1] = this.toWorld(this.cssW, this.cssH);
    const tx0 = Math.floor(wx0 / span), tx1 = Math.floor(wx1 / span);
    const tz0 = Math.floor(wz0 / span), tz1 = Math.floor(wz1 / span);
    const wanted: { key: string; tx: number; tz: number }[] = [];
    const visible = (tx1 - tx0 + 1) * (tz1 - tz0 + 1);
    for (let tz = tz0; tz <= tz1; tz++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = `${scale}:${tx}:${tz}`;
        const t = this.tiles.get(key);
        if (t) {
          const [sx, sz] = this.toScreen(tx * span, tz * span);
          const sz2 = span * this.zoom;
          ctx.drawImage(this.tileCanvas(t), Math.floor(sx), Math.floor(sz), Math.ceil(sz2) + 1, Math.ceil(sz2) + 1);
        } else if (!this.pending.has(key)) wanted.push({ key, tx, tz });
      }
    // Visible tiles were just touched, so they are the most recent; keep some slack for panning back.
    this.tiles.trim(Math.ceil(visible * 1.5));
    // request nearest tiles first
    const ccx = (tx0 + tx1) / 2, ccz = (tz0 + tz1) / 2;
    wanted.sort((a, b) => Math.hypot(a.tx - ccx, a.tz - ccz) - Math.hypot(b.tx - ccx, b.tz - ccz));
    for (const w of wanted.slice(0, Math.max(0, MAX_INFLIGHT - this.pending.size))) {
      this.pending.add(w.key);
      this.worker.postMessage({ op: 'tile', gen: this.gen, key: w.key, x: w.tx * TILE, z: w.tz * TILE, size: TILE, scale });
    }
    this.drawOverlays(ctx);
  }

  private drawOverlays(ctx: CanvasRenderingContext2D) {
    // origin + spawn
    const [ox, oz] = this.toScreen(0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ox - 6, oz); ctx.lineTo(ox + 6, oz); ctx.moveTo(ox, oz - 6); ctx.lineTo(ox, oz + 6); ctx.stroke();
    if (this.spawn) {
      const [sx, sz] = this.toScreen(this.spawn.x, this.spawn.z);
      ctx.fillStyle = '#ff3b3b'; ctx.beginPath(); ctx.arc(sx, sz, 5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of this.found) {
      if (!this.shown(f)) continue;
      const def = STRUCTURES.find((s) => s.type === f.type)!;
      const [sx, sz] = this.toScreen(f.x, f.z);
      if (sx < -20 || sz < -20 || sx > this.cssW + 20 || sz > this.cssH + 20) continue;
      const sel = this.selected === f;
      const visited = this.isVisited(f);
      const r = sel ? 13 : 10;
      ctx.globalAlpha = visited && !sel ? 0.55 : 1;
      ctx.beginPath(); ctx.arc(sx, sz, r, 0, 7);
      ctx.fillStyle = def.color; ctx.fill();
      ctx.lineWidth = sel ? 3 : 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.font = `${r * 1.3}px system-ui`;
      ctx.fillText(def.icon, sx, sz + 0.5);
      ctx.globalAlpha = 1;
      if (visited) {
        // green check badge at the marker's lower right
        const bx = sx + r * 0.75, bz = sz + r * 0.75;
        ctx.beginPath(); ctx.arc(bx, bz, 5.5, 0, 7);
        ctx.fillStyle = '#4cc38a'; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = '#06140d'; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx - 2.5, bz); ctx.lineTo(bx - 0.5, bz + 2); ctx.lineTo(bx + 2.5, bz - 2);
        ctx.lineWidth = 1.6; ctx.strokeStyle = '#06140d'; ctx.stroke();
      }
    }
  }

  private queueStructures() {
    clearTimeout(this.structTimer);
    this.structTimer = window.setTimeout(() => {
      const types = [...this.enabled];
      const [x0, z0] = this.toWorld(0, 0);
      const [x1, z1] = this.toWorld(this.cssW, this.cssH);
      if (!types.length || !this.ready) { this.found = []; this.onStatus(this.ready ? '' : this.pendingStatus()); return this.schedule(); }
      if (x1 - x0 > MAX_STRUCT_SPAN) { this.found = []; this.onStatus('Zoom in to see structures'); return this.schedule(); }
      this.onStatus('');
      const pad = (x1 - x0) * 0.25;
      const r = [x0 - pad, z0 - pad, x1 + pad, z1 + pad].map(Math.floor);
      this.structKey = `${types.join(',')}|${r.join(',')}`;
      this.structWorker.postMessage({ op: 'structures', gen: this.gen, key: this.structKey, types, x0: r[0], z0: r[1], x1: r[2], z1: r[3] });
    }, 150);
  }
  private pendingStatus() { return 'Generating…'; }

  private bindInput() {
    const c = this.canvas;
    let drag: { x: number; z: number; moved: boolean } | null = null;
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); drag = { x: e.offsetX, z: e.offsetY, moved: false }; });
    c.addEventListener('pointermove', (e) => {
      if (drag) {
        const dx = e.offsetX - drag.x, dz = e.offsetY - drag.z;
        if (Math.abs(dx) + Math.abs(dz) > 3) drag.moved = true;
        this.cx -= dx / this.zoom; this.cz -= dz / this.zoom;
        drag.x = e.offsetX; drag.z = e.offsetY;
        this.schedule(); this.queueStructures();
      }
      this.hover(e.offsetX, e.offsetY);
    });
    c.addEventListener('pointerup', (e) => {
      if (drag && !drag.moved) this.click(e.offsetX, e.offsetY);
      drag = null;
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [wx, wz] = this.toWorld(e.offsetX, e.offsetY);
      this.zoom = Math.min(8, Math.max(1 / 256, this.zoom * Math.exp(-e.deltaY * 0.0015)));
      this.cx = wx - (e.offsetX - this.cssW / 2) / this.zoom;
      this.cz = wz - (e.offsetY - this.cssH / 2) / this.zoom;
      this.schedule(); this.queueStructures();
    }, { passive: false });
  }

  private hover(sx: number, sz: number) {
    const [x, z] = this.toWorld(sx, sz);
    const scale = this.pickScale();
    const span = TILE * scale;
    const t = this.tiles.get(`${scale}:${Math.floor(x / span)}:${Math.floor(z / span)}`);
    let name = '';
    if (t) {
      const ix = Math.floor((x - Math.floor(x / span) * span) / scale);
      const iz = Math.floor((z - Math.floor(z / span) * span) / scale);
      name = biomeName(t.ids[iz * TILE + ix]);
    }
    this.onHover(Math.floor(x), Math.floor(z), name);
  }

  private click(sx: number, sz: number) {
    let best: Found | null = null, bd = 14;
    for (const f of this.found) {
      if (!this.shown(f)) continue;
      const [px, pz] = this.toScreen(f.x, f.z);
      const d = Math.hypot(px - sx, pz - sz);
      if (d < bd) { bd = d; best = f; }
    }
    this.selected = best;
    this.onSelect(best);
    this.schedule();
  }
}
