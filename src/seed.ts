/** Java's String.hashCode — what the game applies to non-numeric seed text. */
export function javaHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * Parses seed input the way the game does, as a signed 64-bit BigInt. Since 1.18 Bedrock seeds are 64-bit too
 * (its structures and Nether/End only use the low 32 bits, which the generator handles).
 */
export function parseSeed(input: string): bigint {
  const t = input.trim();
  return /^-?\d+$/.test(t) ? BigInt.asIntN(64, BigInt(t)) : BigInt(javaHash(t));
}

export function seedParts(seed: bigint): { lo: number; hi: number } {
  const u = BigInt.asUintN(64, seed);
  return { lo: Number(u & 0xffffffffn), hi: Number(u >> 32n) };
}
