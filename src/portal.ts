/** Overworld ↔ Nether coordinates: X and Z scale by 8, Y doesn't. */
export const NETHER_SCALE = 8;

/** The Nether block a portal must sit on to link to this Overworld block (the game floors, so negatives round down). */
export const toNether = (x: number, z: number) => ({ x: Math.floor(x / NETHER_SCALE), z: Math.floor(z / NETHER_SCALE) });

/** The Overworld block matching this Nether block (the north-west corner of the 8×8 area it covers). */
export const toOverworld = (x: number, z: number) => ({ x: Math.floor(x) * NETHER_SCALE, z: Math.floor(z) * NETHER_SCALE });

/** Parses a typed coordinate; blank or non-numeric input is null. */
export function parseCoord(s: string): number | null {
  const t = s.trim();
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return null;
  return Math.floor(Number(t));
}
