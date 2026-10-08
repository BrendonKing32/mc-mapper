import { currentVersionLabel, type Edition } from './data/versions';

export type Dimension = 'overworld' | 'nether' | 'end';
export type SavedSeed = {
  id: string; name: string; seed: string; edition: Edition; version: string; dimension: Dimension; notes: string;
  /** Structures marked as visited, as `structureKey()` strings. */
  visited: string[];
  created_at: number;
};
export type NewSeed = Omit<SavedSeed, 'id' | 'created_at' | 'visited'> & { visited?: string[] };

export const MAX_NOTES = 5000;
export const MAX_VISITED = 5000;
/** Identifies a structure within a seed: cubiomes type plus block position (types are unique per dimension). */
export const structureKey = (type: number, x: number, z: number) => `${type}:${x}:${z}`;
const KEY_RE = /^\d+:-?\d+:-?\d+$/;

export const KEY = 'mc-mapper:seeds:v1';
/** Key used when seeds were mirrored from the old D1 API; migrated on first read. */
export const LEGACY_KEY = 'mc-mapper:seeds';

export class StorageError extends Error {}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Returns a cleaned record, or null if the entry is not a usable saved seed. */
export function normalize(v: unknown): SavedSeed | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const seed = str(o.seed, 100).trim();
  const version = currentVersionLabel(str(o.version, 40));
  if (!seed || !version || typeof o.id !== 'string' || !o.id) return null;
  return {
    id: o.id,
    name: str(o.name, 100).trim() || seed,
    seed,
    edition: o.edition === 'bedrock' ? 'bedrock' : 'java',
    version,
    dimension: o.dimension === 'nether' || o.dimension === 'end' ? o.dimension : 'overworld',
    notes: str(o.notes, MAX_NOTES),
    visited: Array.isArray(o.visited)
      ? [...new Set(o.visited.filter((k): k is string => typeof k === 'string' && KEY_RE.test(k)))].slice(0, MAX_VISITED)
      : [],
    created_at: typeof o.created_at === 'number' && Number.isFinite(o.created_at) ? o.created_at : Date.now(),
  };
}

const parseList = (raw: string | null): SavedSeed[] => {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.map(normalize).filter((s): s is SavedSeed => !!s) : [];
  } catch {
    return [];
  }
};

function defaultStorage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; } // access throws when site data is blocked
}

/** Saved seeds kept in this browser only. Write failures throw a StorageError so the UI can report them. */
export function createSeedStore(storage: Storage | null = defaultStorage()) {
  const read = (key: string): string | null => {
    try { return storage?.getItem(key) ?? null; } catch { return null; }
  };
  const write = (list: SavedSeed[]) => {
    if (!storage) throw new StorageError('Browser storage is not available, so seeds cannot be saved.');
    try {
      storage.setItem(KEY, JSON.stringify(list));
    } catch (e) {
      const full = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
      throw new StorageError(full
        ? 'Browser storage is full; delete some saved seeds and try again.'
        : 'Could not save to browser storage (it may be disabled or in private mode).');
    }
  };

  function list(): SavedSeed[] {
    const current = read(KEY);
    if (current !== null) return parseList(current);
    const legacy = parseList(read(LEGACY_KEY));
    if (legacy.length) {
      try { write(legacy); storage?.removeItem(LEGACY_KEY); } catch { /* keep legacy key; retry next time */ }
    }
    return legacy;
  }

  return {
    list,
    add(s: NewSeed): SavedSeed {
      const n = normalize({ ...s, id: crypto.randomUUID(), created_at: Date.now() });
      if (!n) throw new StorageError('A seed and version are required.');
      write([n, ...list()]);
      return n;
    },
    rename(id: string, name: string) {
      write(list().map((s) => (s.id === id ? { ...s, name: name.trim().slice(0, 100) || s.name } : s)));
    },
    setNotes(id: string, notes: string) {
      write(list().map((s) => (s.id === id ? { ...s, notes: notes.slice(0, MAX_NOTES) } : s)));
    },
    setVisited(id: string, key: string, visited: boolean) {
      write(list().map((s) => {
        if (s.id !== id) return s;
        const rest = s.visited.filter((k) => k !== key);
        if (visited && rest.length >= MAX_VISITED) throw new StorageError(`You can mark at most ${MAX_VISITED} structures as visited per seed.`);
        return { ...s, visited: visited ? [...rest, key] : rest };
      }));
    },
    remove(id: string) {
      write(list().filter((s) => s.id !== id));
    },
    exportJson(): string {
      return JSON.stringify(list(), null, 2);
    },
    /** Merges seeds from an export file; entries whose id already exists are skipped. Returns how many were added. */
    importJson(text: string): number {
      let data: unknown;
      try { data = JSON.parse(text); } catch { throw new StorageError('That file is not valid JSON.'); }
      if (!Array.isArray(data)) throw new StorageError('That file is not an MC Mapper seed export.');
      const existing = list();
      const ids = new Set(existing.map((s) => s.id));
      const added = data.map(normalize).filter((s): s is SavedSeed => !!s && !ids.has(s.id) && !!ids.add(s.id));
      if (added.length) write([...added, ...existing].sort((a, b) => b.created_at - a.created_at));
      return added.length;
    },
  };
}

export type SeedStore = ReturnType<typeof createSeedStore>;
