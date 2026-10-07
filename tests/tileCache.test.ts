import { describe, expect, it } from 'vitest';
import { TileCache } from '../src/map/tileCache';


describe('TileCache', () => {
  it('evicts least-recently-used entries beyond the budget', () => {
    const evicted: number[] = [];
    const c = new TileCache<number>(2, (v) => evicted.push(v));
    c.set('a', 1); c.set('b', 2); c.set('c', 3);
    c.get('a'); // a is now most recent; b is oldest
    c.trim();
    expect(c.size).toBe(2);
    expect(evicted).toEqual([2]);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
    expect(c.get('c')).toBe(3);
  });

  it('keeps at least `keep` entries so visible tiles are never evicted', () => {
    const c = new TileCache<number>(2);
    for (let i = 0; i < 6; i++) c.set(String(i), i);
    c.trim(5);
    expect(c.size).toBe(5);
    expect(c.get('0')).toBeUndefined();
    expect(c.get('5')).toBe(5);
  });

  it('calls onEvict for replaced values and on clear', () => {
    const evicted: number[] = [];
    const c = new TileCache<number>(10, (v) => evicted.push(v));
    c.set('a', 1); c.set('a', 2);
    c.set('b', 3);
    c.clear();
    expect(evicted).toEqual([1, 2, 3]);
    expect(c.size).toBe(0);
  });

  it('stays bounded over a long pan', () => {
    const c = new TileCache<number>(50);
    for (let step = 0; step < 1000; step++) {
      for (let dx = 0; dx < 10; dx++) c.set(`${step + dx}:0`, step);
      c.trim(10);
    }
    expect(c.size).toBeLessThanOrEqual(50);
  });
});
