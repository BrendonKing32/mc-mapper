import { describe, expect, it } from 'vitest';
import { parseCoord, toNether, toOverworld } from '../src/portal';

describe('nether portal math', () => {
  it('divides Overworld X/Z by 8', () => {
    expect(toNether(800, -1600)).toEqual({ x: 100, z: -200 });
    expect(toNether(7, 15)).toEqual({ x: 0, z: 1 });
  });
  it('rounds negatives down like the game', () => {
    expect(toNether(-1, -9)).toEqual({ x: -1, z: -2 });
  });
  it('multiplies Nether X/Z by 8', () => {
    expect(toOverworld(100, -200)).toEqual({ x: 800, z: -1600 });
  });
  it('round-trips to a block in the same 8x8 area', () => {
    const n = toNether(-123, 456);
    const o = toOverworld(n.x, n.z);
    expect(o.x).toBeLessThanOrEqual(-123);
    expect(o.x + 8).toBeGreaterThan(-123);
    expect(toNether(o.x, o.z)).toEqual(n);
  });
  it('parses coordinates', () => {
    expect(parseCoord(' -42 ')).toBe(-42);
    expect(parseCoord('12.7')).toBe(12);
    expect(parseCoord('')).toBeNull();
    expect(parseCoord('abc')).toBeNull();
  });
});
