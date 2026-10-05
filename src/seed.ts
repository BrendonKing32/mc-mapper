import type { Edition } from './data/versions';

/** Java's String.hashCode — what the game applies to non-numeric seed text. */
export function javaHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** Parses seed input the way the game does. Returns signed 64-bit (Java) or 32-bit (Bedrock) as BigInt. */
export function parseSeed(input: string, edition: Edition): bigint {
  const t = input.trim();
  let v: bigint;
  if (/^-?\d+$/.test(t)) v = BigInt.asIntN(64, BigInt(t));
  else v = BigInt(javaHash(t));
  return edition === 'bedrock' ? BigInt.asIntN(32, v) : v;
}

export function seedParts(seed: bigint): { lo: number; hi: number } {
  const u = BigInt.asUintN(64, seed);
  return { lo: Number(u & 0xffffffffn), hi: Number(u >> 32n) };
}
