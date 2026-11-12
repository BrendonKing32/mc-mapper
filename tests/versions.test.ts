import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BEDROCK_VERSIONS, currentVersionLabel, JAVA_VERSIONS, LATEST_GENERATOR } from '../src/data/versions';

const header = readFileSync(new URL('../vendor/cubiomes/biomes.h', import.meta.url), 'utf8');
const enumBody = header.match(/enum MCVersion\s*\{([\s\S]*?)\};/)![1].replace(/\/\/[^\n]*/g, '');
const mcIds = new Map<string, number>();
let id = -1;
for (const entry of enumBody.split(',')) {
  const [name, alias] = entry.trim().split(/\s*=\s*/);
  if (!name) continue;
  id = alias ? mcIds.get(alias)! : id + 1;
  mcIds.set(name, id);
}

describe('Minecraft version compatibility', () => {
  it('offers the current Java release with an explicit generator approximation', () => {
    expect(JAVA_VERSIONS[0]).toMatchObject({ label: '26.3', mc: LATEST_GENERATOR.mc, approximate: true });
    expect(LATEST_GENERATOR).toEqual({ label: '26.1.2', mc: mcIds.get('MC_NEWEST') });
    expect(JAVA_VERSIONS).toContainEqual(LATEST_GENERATOR);
  });

  it('offers the current Bedrock release with an explicit generator approximation', () => {
    expect(BEDROCK_VERSIONS[0]).toMatchObject({ label: '26.52', mc: LATEST_GENERATOR.mc, approximate: true });
    expect(BEDROCK_VERSIONS).toContainEqual({ label: '1.21+', mc: 28 });
  });

  it('uses the actual C enum ids for every supported Java version', () => {
    for (const version of JAVA_VERSIONS.filter((v) => !v.approximate)) {
      expect(version.mc, version.label).toBe(mcIds.get(`MC_${version.label.replaceAll('.', '_')}`));
    }
  });

  it('keeps saved seeds and links using legacy labels on their original generators', () => {
    expect(currentVersionLabel('1.21 (Winter Drop)')).toBe('1.21.4');
    expect(JAVA_VERSIONS.find((v) => v.label === currentVersionLabel('1.21 (Winter Drop)'))?.mc).toBe(28);
    for (const version of ['1.21+', '1.20', '1.18']) {
      const current = currentVersionLabel(`${version} (approx.)`);
      expect(current).toBe(version);
      expect(BEDROCK_VERSIONS.find((v) => v.label === current)).toBeDefined();
    }
    expect(currentVersionLabel('26.1.2')).toBe('26.1.2');
  });
});
