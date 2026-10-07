/**
 * Least-recently-used cache for map tiles. `get` marks an entry as used; `trim`
 * evicts the oldest entries beyond the budget, calling `onEvict` so callers can
 * free resources (e.g. canvas backing stores).
 */
export class TileCache<T> {
  private map = new Map<string, T>(); // insertion order = least → most recently used

  constructor(public budget: number, private onEvict: (value: T) => void = () => {}) {}

  get size() { return this.map.size; }

  get(key: string): T | undefined {
    const v = this.map.get(key);
    if (v !== undefined) { this.map.delete(key); this.map.set(key, v); }
    return v;
  }

  set(key: string, value: T) {
    const old = this.map.get(key);
    if (old !== undefined && old !== value) this.onEvict(old);
    this.map.delete(key);
    this.map.set(key, value);
  }

  /** Evicts least-recently-used entries until at most max(budget, keep) remain. */
  trim(keep = 0) {
    const limit = Math.max(this.budget, keep);
    for (const [k, v] of this.map) {
      if (this.map.size <= limit) break;
      this.map.delete(k);
      this.onEvict(v);
    }
  }

  clear() {
    for (const v of this.map.values()) this.onEvict(v);
    this.map.clear();
  }
}
