import type { Edition } from './data/versions';

export type SavedSeed = { id: string; name: string; seed: string; edition: Edition; version: string; dimension: 'overworld' | 'nether'; notes: string; created_at: number };

const LS = 'mc-mapper:seeds';
const local = (): SavedSeed[] => { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } };
const saveLocal = (s: SavedSeed[]) => { try { localStorage.setItem(LS, JSON.stringify(s)); } catch { /* ignore */ } };

async function req(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json' } });
  if (!r.ok) throw new Error(String(r.status));
  return r.json() as Promise<any>;
}

/** D1-backed via /api/seeds; falls back to localStorage when the API is unavailable (e.g. plain `vite dev`). */
export const seedsApi = {
  async list(): Promise<SavedSeed[]> {
    try { const s = await req('/api/seeds'); if (Array.isArray(s)) { saveLocal(s); return s; } } catch { /* fall through */ }
    return local();
  },
  async add(s: Omit<SavedSeed, 'id' | 'created_at'>): Promise<SavedSeed> {
    try { return await req('/api/seeds', { method: 'POST', body: JSON.stringify(s) }); }
    catch { const n = { ...s, id: crypto.randomUUID(), created_at: Date.now() }; saveLocal([n, ...local()]); return n; }
  },
  async rename(id: string, name: string) {
    try { await req(`/api/seeds/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }); }
    catch { saveLocal(local().map((s) => (s.id === id ? { ...s, name } : s))); }
  },
  async remove(id: string) {
    try { await req(`/api/seeds/${id}`, { method: 'DELETE' }); }
    catch { saveLocal(local().filter((s) => s.id !== id)); }
  },
};
