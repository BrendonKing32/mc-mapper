import { describe, expect, it } from 'vitest';
import { BEDROCK_VERSIONS, JAVA_VERSIONS } from '../src/data/versions';

describe('Minecraft version compatibility', () => {
  it('offers the current Java release with an explicit generator approximation', () => {
    expect(JAVA_VERSIONS[0]).toMatchObject({ label: '26.3', mc: 28, approximate: true });
    expect(JAVA_VERSIONS.some((v) => v.label === '1.21 (Winter Drop)')).toBe(true);
  });

  it('offers the current Bedrock release with an explicit generator approximation', () => {
    expect(BEDROCK_VERSIONS[0]).toMatchObject({ label: '26.52', mc: 28, approximate: true });
    expect(BEDROCK_VERSIONS.some((v) => v.label === '1.21+')).toBe(true);
  });
});
