import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, pinch, zoomAt, type View } from '../src/map/view';

const W = 400, H = 300;
const toWorld = (v: View, x: number, y: number) => [(x - W / 2) / v.zoom + v.cx, (y - H / 2) / v.zoom + v.cz];

describe('zoomAt', () => {
  it('keeps the world point under the cursor fixed', () => {
    const v = { cx: 100, cz: -50, zoom: 0.25 };
    const before = toWorld(v, 30, 220);
    const after = zoomAt(v, { x: 30, y: 220 }, 2, W, H);
    expect(after.zoom).toBe(0.5);
    const [x, z] = toWorld(after, 30, 220);
    expect(x).toBeCloseTo(before[0]);
    expect(z).toBeCloseTo(before[1]);
  });
  it('clamps zoom', () => {
    const v = { cx: 0, cz: 0, zoom: 1 };
    expect(zoomAt(v, { x: 0, y: 0 }, 1e6, W, H).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(v, { x: 0, y: 0 }, 1e-6, W, H).zoom).toBe(MIN_ZOOM);
  });
});

describe('pinch', () => {
  it('scales by finger spread around the midpoint', () => {
    const v = { cx: 0, cz: 0, zoom: 1 };
    const out = pinch(v, [{ x: 150, y: 150 }, { x: 250, y: 150 }], [{ x: 100, y: 150 }, { x: 300, y: 150 }], W, H);
    expect(out.zoom).toBe(2);
    expect(toWorld(out, 200, 150)).toEqual(toWorld(v, 200, 150));
  });
  it('pans when both fingers move together', () => {
    const v = { cx: 10, cz: 20, zoom: 0.5 };
    const out = pinch(v, [{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 150, y: 130 }, { x: 250, y: 130 }], W, H);
    expect(out.zoom).toBe(0.5);
    expect(out.cx).toBeCloseTo(10 - 50 / 0.5);
    expect(out.cz).toBeCloseTo(20 - 30 / 0.5);
  });
});
