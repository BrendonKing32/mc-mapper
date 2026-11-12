import { BIOMES } from '../data/biomes';
import { STRUCTURES } from '../data/structures';
import { MAX_ZOOM, MIN_ZOOM, type View } from './view';

const WORLD_LIMIT = 30_000_000;
const structureTypes = new Set(STRUCTURES.map((s) => s.type));
const biomeIds = new Set(BIOMES.map((b) => b.id));

export type SharedMapState = {
  view?: View;
  structures?: Set<number>;
  biomes?: Set<number>;
  large?: boolean;
};

export function readSharedMapState(params: URLSearchParams): SharedMapState {
  const x = Number(params.get('x'));
  const z = Number(params.get('z'));
  const zoom = Number(params.get('zoom'));
  const hasView = ['x', 'z', 'zoom'].every((key) => params.has(key));
  const state: SharedMapState = {};
  if (hasView && Number.isFinite(x) && Number.isFinite(z) && Number.isFinite(zoom)
    && Math.abs(x) <= WORLD_LIMIT && Math.abs(z) <= WORLD_LIMIT
    && zoom >= MIN_ZOOM && zoom <= MAX_ZOOM) {
    state.view = { cx: x, cz: z, zoom };
  }
  if (params.has('structures')) state.structures = readIds(params.get('structures')!, structureTypes);
  if (params.has('biomes')) state.biomes = readIds(params.get('biomes')!, biomeIds);
  state.large = params.get('large') === '1';
  return state;
}

export function writeSharedMapState(params: URLSearchParams, state: Required<SharedMapState>) {
  params.set('x', String(round(state.view.cx)));
  params.set('z', String(round(state.view.cz)));
  params.set('zoom', String(round(state.view.zoom, 6)));
  params.set('structures', [...state.structures].sort((a, b) => a - b).join(','));
  params.set('biomes', [...state.biomes].sort((a, b) => a - b).join(','));
  if (state.large) params.set('large', '1');
  else params.delete('large');
}

function readIds(value: string, allowed: Set<number>) {
  return new Set(value.split(',').filter(Boolean).map(Number).filter((id) => Number.isInteger(id) && allowed.has(id)));
}

function round(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
