import { beforeEach, describe, expect, it } from 'vitest';
import { KEY, LEGACY_KEY, MAX_NOTES, MAX_PIN_NAME, StorageError, createSeedStore, structureKey } from '../src/storage';

class MemoryStorage implements Storage {
  map = new Map<string, string>();
  failWrites: Error | null = null;
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.get(k) ?? null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { if (this.failWrites) throw this.failWrites; this.map.set(k, v); }
}

const seed = { name: 'Home', seed: '12345', edition: 'java' as const, version: '1.21.3', dimension: 'overworld' as const, notes: '' };

let mem: MemoryStorage;
beforeEach(() => { mem = new MemoryStorage(); });

describe('seed store', () => {
  it('maps old "(approx.)" Bedrock version labels to the current ones', () => {
    const store = createSeedStore(mem);
    const a = store.add({ ...seed, edition: 'bedrock', version: '1.20 (approx.)' });
    expect(store.list().find((s) => s.id === a.id)?.version).toBe('1.20');
  });
  it('adds, renames and removes seeds', () => {
    const store = createSeedStore(mem);
    const a = store.add(seed);
    const b = store.add({ ...seed, name: 'Other', seed: 'abc' });
    expect(store.list().map((s) => s.id)).toEqual([b.id, a.id]);
    store.rename(a.id, '  Renamed ');
    expect(store.list().find((s) => s.id === a.id)?.name).toBe('Renamed');
    store.remove(b.id);
    expect(store.list().map((s) => s.id)).toEqual([a.id]);
  });

  it('saves notes and toggles visited structures', () => {
    const store = createSeedStore(mem);
    const a = store.add(seed);
    const b = store.add({ ...seed, seed: '2' });
    expect(a.visited).toEqual([]);
    store.setNotes(a.id, 'portal at 100 64 -200');
    store.setNotes(b.id, 'x'.repeat(MAX_NOTES + 10));
    const village = structureKey(5, -320, 1040);
    store.setVisited(a.id, village, true);
    store.setVisited(a.id, village, true);
    store.setVisited(a.id, structureKey(18, 48, -96), true);
    let [, got] = store.list();
    expect(got).toMatchObject({ notes: 'portal at 100 64 -200', visited: ['5:-320:1040', '18:48:-96'] });
    expect(store.list()[0].notes).toHaveLength(MAX_NOTES);
    expect(store.list()[0].visited).toEqual([]);
    store.setVisited(a.id, village, false);
    [, got] = store.list();
    expect(got.visited).toEqual(['18:48:-96']);
  });

  it('keeps notes and visits through export and import', () => {
    const src = createSeedStore(mem);
    const a = src.add({ ...seed, notes: 'hi' });
    src.setVisited(a.id, structureKey(100, 1200, -400), true);
    const dst = createSeedStore(new MemoryStorage());
    dst.importJson(src.exportJson());
    expect(dst.list()[0]).toMatchObject({ notes: 'hi', visited: ['100:1200:-400'] });
  });

  it('adds, renames and removes pins', () => {
    const store = createSeedStore(mem);
    const a = store.add(seed);
    const b = store.add({ ...seed, seed: '2' });
    expect(a.pins).toEqual([]);
    const base = store.addPin(a.id, { name: '  Base ', x: 120, z: -340, dimension: 'overworld' });
    const hub = store.addPin(a.id, { name: '', x: 15, z: -42, dimension: 'nether' });
    expect(store.list().find((s) => s.id === a.id)?.pins).toMatchObject([
      { id: base.id, name: 'Base', x: 120, z: -340, dimension: 'overworld' },
      { id: hub.id, name: 'Pin', x: 15, z: -42, dimension: 'nether' },
    ]);
    expect(store.list().find((s) => s.id === b.id)?.pins).toEqual([]);
    store.renamePin(a.id, hub.id, 'x'.repeat(100));
    store.renamePin(a.id, base.id, '   ');
    let pins = store.list().find((s) => s.id === a.id)!.pins;
    expect(pins.map((p) => p.name)).toEqual(['Base', 'x'.repeat(MAX_PIN_NAME)]);
    store.removePin(a.id, base.id);
    pins = store.list().find((s) => s.id === a.id)!.pins;
    expect(pins.map((p) => p.id)).toEqual([hub.id]);
    expect(() => store.addPin(a.id, { name: 'far', x: 1.5, z: 0, dimension: 'overworld' })).toThrow(StorageError);
  });

  it('keeps pins through export and import and drops malformed ones', () => {
    const src = createSeedStore(mem);
    const a = src.add(seed);
    src.addPin(a.id, { name: 'Base', x: 1, z: 2, dimension: 'end' });
    const dst = createSeedStore(new MemoryStorage());
    dst.importJson(src.exportJson());
    expect(dst.list()[0].pins).toMatchObject([{ name: 'Base', x: 1, z: 2, dimension: 'end' }]);

    const ok = { id: 'p', name: 'ok', x: 3, z: 4 };
    mem.setItem(KEY, JSON.stringify([{ id: 'y', seed: '1', version: '1.20',
      pins: [ok, ok, null, { id: 'q', x: '3', z: 4 }, { id: 'r', x: 4e7, z: 0 }, { x: 1, z: 1 }] }]));
    expect(createSeedStore(mem).list()[0].pins).toMatchObject([{ id: 'p', name: 'ok', x: 3, z: 4, dimension: 'overworld' }]);
  });

  it('drops malformed visited entries', () => {
    mem.setItem(KEY, JSON.stringify([{ id: 'y', seed: '1', version: '1.20', visited: ['5:1:2', '5:1:2', 'bad', 7, '-1:0:0'] }]));
    expect(createSeedStore(mem).list()[0].visited).toEqual(['5:1:2']);
  });

  it('ignores malformed stored data', () => {
    mem.setItem(KEY, '{not json');
    expect(createSeedStore(mem).list()).toEqual([]);
    mem.setItem(KEY, JSON.stringify([{ id: 'x' }, null, { id: 'y', seed: '1', version: '1.20' }]));
    const list = createSeedStore(mem).list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'y', name: '1', edition: 'java', dimension: 'overworld' });
  });

  it('migrates seeds from the legacy key', () => {
    mem.setItem(LEGACY_KEY, JSON.stringify([{ id: 'old', seed: '42', version: '1.20', name: 'Old', created_at: 1 }]));
    const store = createSeedStore(mem);
    expect(store.list().map((s) => s.id)).toEqual(['old']);
    expect(mem.getItem(LEGACY_KEY)).toBeNull();
    expect(JSON.parse(mem.getItem(KEY)!)).toHaveLength(1);
  });

  it('round-trips export and import without duplicating ids', () => {
    const src = createSeedStore(mem);
    src.add(seed);
    src.add({ ...seed, seed: '999' });
    const json = src.exportJson();

    const other = new MemoryStorage();
    const dst = createSeedStore(other);
    expect(dst.importJson(json)).toBe(2);
    expect(dst.importJson(json)).toBe(0);
    expect(dst.list().map((s) => s.seed).sort()).toEqual(['12345', '999']);
  });

  it('rejects invalid import files', () => {
    const store = createSeedStore(mem);
    expect(() => store.importJson('nope')).toThrow(StorageError);
    expect(() => store.importJson('{"a":1}')).toThrow(StorageError);
  });

  it('surfaces write failures instead of dropping the save', () => {
    const store = createSeedStore(mem);
    mem.failWrites = new DOMException('full', 'QuotaExceededError');
    expect(() => store.add(seed)).toThrow(/storage is full/);
    mem.failWrites = new Error('denied');
    expect(() => store.add(seed)).toThrow(StorageError);
    expect(store.list()).toEqual([]);
  });

  it('reports missing storage', () => {
    expect(() => createSeedStore(null).add(seed)).toThrow(/not available/);
  });
});
