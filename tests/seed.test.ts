import { describe, expect, it } from 'vitest';
import { javaHash, parseSeed, seedParts } from '../src/seed';

describe('seed parsing', () => {
  it('matches Java String.hashCode', () => {
    expect(javaHash('hello')).toBe(99162322);
    expect(javaHash('')).toBe(0);
  });
  it('parses numeric seeds as signed 64-bit', () => {
    expect(parseSeed('-1', 'java')).toBe(-1n);
    expect(parseSeed('9223372036854775808', 'java')).toBe(-9223372036854775808n);
  });
  it('truncates Bedrock seeds to 32 bits', () => {
    expect(parseSeed('4294967297', 'bedrock')).toBe(1n);
  });
  it('splits into 32-bit halves', () => {
    expect(seedParts(-1n)).toEqual({ lo: 0xffffffff, hi: 0xffffffff });
  });
});
