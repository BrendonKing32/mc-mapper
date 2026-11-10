// `mc` values are cubiomes' MCVersion enum ids (vendor/cubiomes/biomes.h).
export type Edition = 'java' | 'bedrock';
type Version = { label: string; mc: number; approximate?: boolean };
export const LATEST_GENERATOR = { label: '26.1.2', mc: 38 };
export const JAVA_VERSIONS: Version[] = [
  { label: '26.3', mc: LATEST_GENERATOR.mc, approximate: true },
  LATEST_GENERATOR, { label: '26.1.1', mc: 37 }, { label: '26.1', mc: 36 },
  { label: '1.21.11', mc: 35 }, { label: '1.21.10', mc: 34 }, { label: '1.21.9', mc: 33 },
  { label: '1.21.8', mc: 32 }, { label: '1.21.7', mc: 31 }, { label: '1.21.6', mc: 30 },
  { label: '1.21.5', mc: 29 }, { label: '1.21.4', mc: 28 }, { label: '1.21.3', mc: 27 }, { label: '1.21.1', mc: 26 },
  { label: '1.20', mc: 25 }, { label: '1.19.4', mc: 24 }, { label: '1.19.2', mc: 23 },
  { label: '1.18', mc: 22 }, { label: '1.17', mc: 21 }, { label: '1.16.5', mc: 20 },
  { label: '1.15', mc: 18 }, { label: '1.14', mc: 17 }, { label: '1.13', mc: 16 },
  { label: '1.12', mc: 15 }, { label: '1.11', mc: 14 }, { label: '1.10', mc: 13 },
  { label: '1.9', mc: 12 }, { label: '1.8', mc: 11 }, { label: '1.7', mc: 10 },
];
// Bedrock biomes use the matching Java generator (same since 1.18); structures use Bedrock placement. See README.
export const BEDROCK_VERSIONS: Version[] = [
  { label: '26.52', mc: LATEST_GENERATOR.mc, approximate: true },
  { label: '1.21+', mc: 28 }, { label: '1.20', mc: 25 }, { label: '1.18', mc: 22 },
];
/** Keep saved seeds and links using older version labels on the same generator. */
export const currentVersionLabel = (label: string) => label === '1.21 (Winter Drop)'
  ? '1.21.4' : label.replace(/ \(approx\.\)$/, '');
export const versionsFor = (e: Edition) => (e === 'bedrock' ? BEDROCK_VERSIONS : JAVA_VERSIONS);
