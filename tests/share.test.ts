import { describe, expect, it } from 'vitest';
import { readSharedMapState, writeSharedMapState } from '../src/map/share';
import { MAX_ZOOM, MIN_ZOOM } from '../src/map/view';

describe('shared map state', () => {
  it('round-trips the map view, filters, and large-biome setting', () => {
    const params = new URLSearchParams('seed=123&edition=java&version=1.21&dimension=nether');
    writeSharedMapState(params, {
      view: { cx: 123.456, cz: -789.123, zoom: 0.75 },
      structures: new Set([5, 18]),
      biomes: new Set([1, 172]),
      large: true,
    });

    expect(readSharedMapState(params)).toEqual({
      view: { cx: 123.46, cz: -789.12, zoom: 0.75 },
      structures: new Set([5, 18]),
      biomes: new Set([1, 172]),
      large: true,
    });
    expect(params.get('seed')).toBe('123');
    expect(params.get('dimension')).toBe('nether');
  });

  it('leaves absent filters undefined for legacy links', () => {
    expect(readSharedMapState(new URLSearchParams('seed=42'))).toEqual({ large: false });
  });

  it('ignores malformed views and unknown filter ids', () => {
    const state = readSharedMapState(new URLSearchParams('x=Infinity&z=2&zoom=1&structures=5,999&biomes=1,nope'));
    expect(state.view).toBeUndefined();
    expect(state.structures).toEqual(new Set([5]));
    expect(state.biomes).toEqual(new Set([1]));
  });

  it('rejects view coordinates and zoom outside supported ranges', () => {
    expect(readSharedMapState(new URLSearchParams(`x=30000001&z=0&zoom=${MIN_ZOOM}`)).view).toBeUndefined();
    expect(readSharedMapState(new URLSearchParams(`x=0&z=0&zoom=${MAX_ZOOM + 1}`)).view).toBeUndefined();
  });
});
