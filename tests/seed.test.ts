import { describe, expect, it } from 'vitest';
import { javaHash, parseSeed, seedParts } from '../src/seed';

describe('seed parsing', () => {
  it('matches Java String.hashCode', () => {
    expect(javaHash('hello')).toBe(99162322);
    expect(javaHash('')).toBe(0);
  });
  it('parses numeric seeds as signed 64-bit', () => {
    expect(parseSeed('-1')).toBe(-1n);
    expect(parseSeed('9223372036854775808')).toBe(-9223372036854775808n);
    expect(parseSeed('4294967297')).toBe(4294967297n);
  });
  it('hashes text seeds', () => {
    expect(parseSeed(' hello ')).toBe(99162322n);
  });
  it('splits into 32-bit halves', () => {
    expect(seedParts(-1n)).toEqual({ lo: 0xffffffff, hi: 0xffffffff });
  });
});
