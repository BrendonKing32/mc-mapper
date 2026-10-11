/** Terrain shading for biome tiles, from cubiomes' approximate surface heights (`mc_heights`). */

export const SEA_LEVEL = 63;
/** A shade value of NEUTRAL leaves the biome colour as is; the colour is scaled by shade / NEUTRAL. */
export const NEUTRAL = 128;

/**
 * Turns a (size+2)² height grid (the tile plus a one-sample border, so edge slopes match the next tile) into a
 * per-pixel shade and the rounded height of each pixel. `scale` is blocks per sample; `dim` 1 is the End.
 *
 * Land is hillshaded with light from the north-west. Slopes are exaggerated more the further out the map is
 * zoomed, since over a 256-block sample real slopes are nearly flat. Water (Overworld, below sea level) darkens
 * with depth instead, and the End's void (height 0) is dimmed so the islands stand out.
 */
export function shadeTile(h: Float32Array, size: number, scale: number, dim: number) {
  const n = size + 2;
  const shade = new Uint8Array(size * size);
  const height = new Int16Array(size * size);
  const ex = 0.6 * scale ** 0.4; // vertical exaggeration
  const lx = -1, ly = 1.5, lz = -1; // towards the light
  const ll = Math.hypot(lx, ly, lz);
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const c = (j + 1) * n + i + 1;
      const y = h[c];
      const o = j * size + i;
      height[o] = Math.round(y);
      let f: number;
      if (dim === 1 && y <= 0) f = 0.35;
      else if (dim !== 1 && y < SEA_LEVEL) f = 1 - 0.5 * Math.min(1, (SEA_LEVEL - y) / 50);
      else {
        const dx = ((h[c + 1] - h[c - 1]) / (2 * scale)) * ex;
        const dz = ((h[c + n] - h[c - n]) / (2 * scale)) * ex;
        // Lambert against the surface normal (-dx, 1, -dz), relative to flat ground
        const lit = (-dx * lx + ly - dz * lz) / (Math.hypot(dx, 1, dz) * ll);
        f = Math.min(1.3, Math.max(0.55, 1 + 0.7 * (lit / (ly / ll) - 1))); // soften, so steep slopes keep their colour
        if (dim !== 1) f *= 0.92 + 0.16 * Math.min(1, (y - SEA_LEVEL) / 150); // higher ground a little brighter
      }
      shade[o] = Math.max(0, Math.min(255, Math.round(f * NEUTRAL)));
    }
  return { shade, height };
}
