import { describe, expect, it } from 'vitest';
import { isStructureAvailable, STRUCTURES } from '../src/data/structures';

describe('structure version availability', () => {
  it('gates structures until the selected generator version supports them', () => {
    const monument = STRUCTURES.find((s) => s.key === 'monument')!;
    const mansion = STRUCTURES.find((s) => s.key === 'mansion')!;
    const outpost = STRUCTURES.find((s) => s.key === 'outpost')!;
    const ancientCity = STRUCTURES.find((s) => s.key === 'ancient_city')!;
    const endCity = STRUCTURES.find((s) => s.key === 'end_city')!;
    const oceanRuin = STRUCTURES.find((s) => s.key === 'ocean_ruin')!;
    const shipwreck = STRUCTURES.find((s) => s.key === 'shipwreck')!;
    const treasure = STRUCTURES.find((s) => s.key === 'treasure')!;
    const desertWell = STRUCTURES.find((s) => s.key === 'desert_well')!;
    const endGateway = STRUCTURES.find((s) => s.key === 'end_gateway')!;
    const endIsland = STRUCTURES.find((s) => s.key === 'end_island')!;
    const ruinedPortal = STRUCTURES.find((s) => s.key === 'ruined_portal')!;
    const netherRuinedPortal = STRUCTURES.find((s) => s.key === 'ruined_portal_n')!;
    const bastion = STRUCTURES.find((s) => s.key === 'bastion')!;
    const trailRuins = STRUCTURES.find((s) => s.key === 'trail_ruins')!;
    const trialChambers = STRUCTURES.find((s) => s.key === 'trial_chambers')!;

    expect(isStructureAvailable(monument, 10)).toBe(false);
    expect(isStructureAvailable(monument, 11)).toBe(true);
    expect(isStructureAvailable(mansion, 13)).toBe(false);
    expect(isStructureAvailable(mansion, 14)).toBe(true);
    expect(isStructureAvailable(outpost, 16)).toBe(false);
    expect(isStructureAvailable(outpost, 17)).toBe(true);
    expect(isStructureAvailable(endCity, 11)).toBe(false);
    expect(isStructureAvailable(endCity, 12)).toBe(true);
    for (const structure of [oceanRuin, shipwreck, treasure, desertWell, endGateway, endIsland]) {
      expect(isStructureAvailable(structure, 15)).toBe(false);
      expect(isStructureAvailable(structure, 16)).toBe(true);
    }
    for (const structure of [ruinedPortal, netherRuinedPortal, bastion]) {
      expect(isStructureAvailable(structure, 18)).toBe(false);
      expect(isStructureAvailable(structure, 19)).toBe(true);
    }
    expect(isStructureAvailable(ancientCity, 22)).toBe(false);
    expect(isStructureAvailable(ancientCity, 23)).toBe(true);
    expect(isStructureAvailable(trailRuins, 24)).toBe(false);
    expect(isStructureAvailable(trailRuins, 25)).toBe(true);
    expect(isStructureAvailable(trialChambers, 25)).toBe(false);
    expect(isStructureAvailable(trialChambers, 26)).toBe(true);
  });

  it('keeps structures without an introduction limit available', () => {
    const village = STRUCTURES.find((s) => s.key === 'village')!;
    expect(isStructureAvailable(village, 10)).toBe(true);
  });
});
