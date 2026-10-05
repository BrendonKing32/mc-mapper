// `type` is cubiomes' StructureType; 100 = strongholds (handled specially).
// `dim` is the dimension the structure generates in (0 = Overworld, -1 = Nether, 1 = End); defaults to 0.
export type StructureDef = { type: number; key: string; name: string; icon: string; color: string; dim?: -1 | 0 | 1 };
export const STRUCTURES: StructureDef[] = [
  { type: 5, key: 'village', name: 'Village', icon: '🏘️', color: '#c97b2a' },
  { type: 10, key: 'outpost', name: 'Pillager Outpost', icon: '🏴', color: '#7a3b3b' },
  { type: 9, key: 'mansion', name: 'Woodland Mansion', icon: '🏚️', color: '#5b3a1e' },
  { type: 8, key: 'monument', name: 'Ocean Monument', icon: '🔱', color: '#2aa9c9' },
  { type: 100, key: 'stronghold', name: 'Stronghold', icon: '🏰', color: '#444' },
  { type: 13, key: 'ancient_city', name: 'Ancient City', icon: '💀', color: '#1a5260' },
  { type: 24, key: 'trial_chambers', name: 'Trial Chambers', icon: '⚔️', color: '#b8742a' },
  { type: 23, key: 'trail_ruins', name: 'Trail Ruins', icon: '🏺', color: '#9a7b4f' },
  { type: 1, key: 'desert_pyramid', name: 'Desert Pyramid', icon: '🔺', color: '#d9b64a' },
  { type: 2, key: 'jungle_temple', name: 'Jungle Temple', icon: '🛕', color: '#3d8a3d' },
  { type: 3, key: 'swamp_hut', name: 'Swamp Hut', icon: '🧙', color: '#4d6b3a' },
  { type: 4, key: 'igloo', name: 'Igloo', icon: '🧊', color: '#9ad' },
  { type: 18, key: 'fortress', name: 'Nether Fortress', icon: '🔥', color: '#9a2a2a', dim: -1 },
  { type: 19, key: 'bastion', name: 'Bastion Remnant', icon: '🐷', color: '#4a3b2a', dim: -1 },
  { type: 11, key: 'ruined_portal', name: 'Ruined Portal', icon: '🌀', color: '#8a2be2' },
  { type: 12, key: 'ruined_portal_n', name: 'Ruined Portal (Nether)', icon: '🌀', color: '#b06bff', dim: -1 },
  { type: 7, key: 'shipwreck', name: 'Shipwreck', icon: '🚢', color: '#6b4b2a' },
  { type: 6, key: 'ocean_ruin', name: 'Ocean Ruin', icon: '🐚', color: '#4a7a8a' },
  { type: 14, key: 'treasure', name: 'Buried Treasure', icon: '💰', color: '#d4af37' },
  { type: 15, key: 'mineshaft', name: 'Mineshaft', icon: '⛏️', color: '#777' },
  { type: 16, key: 'desert_well', name: 'Desert Well', icon: '💧', color: '#6aa' },
  { type: 20, key: 'end_city', name: 'End City', icon: '🏙️', color: '#c9a876', dim: 1 },
  { type: 21, key: 'end_gateway', name: 'End Gateway', icon: '🌌', color: '#2bd9c4', dim: 1 },
  { type: 22, key: 'end_island', name: 'End Island', icon: '🏝️', color: '#f0f0ff', dim: 1 },
];
