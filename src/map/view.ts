/** Map viewport: world point at the screen centre and screen px per block. */
export type View = { cx: number; cz: number; zoom: number };
type Pt = { x: number; y: number };

export const MIN_ZOOM = 1 / 256;
export const MAX_ZOOM = 8;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Zooms by `factor` keeping the world point under screen point `p` fixed. `w`/`h` are the viewport size in CSS px. */
export function zoomAt(v: View, p: Pt, factor: number, w: number, h: number): View {
  return moveAnchor(v, p, p, factor, w, h);
}

/**
 * Two-finger gesture: the world point under the old midpoint ends up under the new midpoint,
 * and zoom scales by how much the fingers spread apart.
 */
export function pinch(v: View, from: [Pt, Pt], to: [Pt, Pt], w: number, h: number): View {
  const d0 = Math.hypot(from[0].x - from[1].x, from[0].y - from[1].y);
  const d1 = Math.hypot(to[0].x - to[1].x, to[0].y - to[1].y);
  return moveAnchor(v, mid(from), mid(to), d0 > 0 ? d1 / d0 : 1, w, h);
}

function moveAnchor(v: View, from: Pt, to: Pt, factor: number, w: number, h: number): View {
  const wx = (from.x - w / 2) / v.zoom + v.cx;
  const wz = (from.y - h / 2) / v.zoom + v.cz;
  const zoom = clampZoom(v.zoom * factor);
  return { cx: wx - (to.x - w / 2) / zoom, cz: wz - (to.y - h / 2) / zoom, zoom };
}

const mid = ([a, b]: [Pt, Pt]): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
