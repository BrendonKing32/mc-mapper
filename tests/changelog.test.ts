import { describe, expect, it } from 'vitest';
import { SEEN_KEY, createChangelogSeen, unseen } from '../src/changelog';
import { CHANGELOG, type ChangelogEntry } from '../src/data/changelog';

class MemoryStorage implements Storage {
  map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.get(k) ?? null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, v); }
}

const entry = (id: string): ChangelogEntry => ({ id, date: '2026-01-01', title: id, items: [] });
const entries = [entry('c'), entry('b'), entry('a')];

describe('changelog data', () => {
  it('has unique ids, newest first', () => {
    expect(new Set(CHANGELOG.map((e) => e.id)).size).toBe(CHANGELOG.length);
    const dates = CHANGELOG.map((e) => e.date);
    expect(dates).toEqual([...dates].sort().reverse());
    for (const e of CHANGELOG) expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('unseen', () => {
  it('returns entries newer than the seen one', () => {
    expect(unseen(entries, 'b').map((e) => e.id)).toEqual(['c']);
    expect(unseen(entries, 'c')).toEqual([]);
  });
  it('treats a missing or unknown id as all new', () => {
    expect(unseen(entries, null)).toEqual(entries);
    expect(unseen(entries, 'gone')).toEqual(entries);
  });
});

describe('changelog seen tracking', () => {
  it('starts first-time visitors caught up', () => {
    const mem = new MemoryStorage();
    expect(createChangelogSeen(entries, false, mem).unseen()).toEqual([]);
    expect(mem.getItem(SEEN_KEY)).toBe('c');
  });
  it('shows returning users everything until they look', () => {
    const mem = new MemoryStorage();
    const seen = createChangelogSeen(entries, true, mem);
    expect(seen.unseen()).toEqual(entries);
    seen.markSeen();
    expect(seen.unseen()).toEqual([]);
  });
  it('shows only entries added since the last look', () => {
    const mem = new MemoryStorage();
    mem.setItem(SEEN_KEY, 'b');
    expect(createChangelogSeen(entries, false, mem).unseen().map((e) => e.id)).toEqual(['c']);
  });
  it('works without storage', () => {
    const seen = createChangelogSeen(entries, false, null);
    expect(seen.unseen()).toEqual(entries);
    expect(() => seen.markSeen()).not.toThrow();
  });
});
