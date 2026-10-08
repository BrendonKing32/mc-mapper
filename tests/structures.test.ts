import { describe, expect, it } from 'vitest';
import { isStructureAvailable, STRUCTURES } from '../src/data/structures';

describe('structure version availability', () => {
  it('gates structures until the selected generator version supports them', () => {
    const ancientCity = STRUCTURES.find((s) => s.key === 'ancient_city')!;
    const trailRuins = STRUCTURES.find((s) => s.key === 'trail_ruins')!;
    const trialChambers = STRUCTURES.find((s) => s.key === 'trial_chambers')!;

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
