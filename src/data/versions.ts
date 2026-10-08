// `mc` values are cubiomes' MCVersion enum ids (vendor/cubiomes/biomes.h).
export type Edition = 'java' | 'bedrock';
export const JAVA_VERSIONS = [
  { label: '1.21 (Winter Drop)', mc: 28 }, { label: '1.21.3', mc: 27 }, { label: '1.21.1', mc: 26 },
  { label: '1.20', mc: 25 }, { label: '1.19.4', mc: 24 }, { label: '1.19.2', mc: 23 },
  { label: '1.18', mc: 22 }, { label: '1.17', mc: 21 }, { label: '1.16.5', mc: 20 },
  { label: '1.15', mc: 18 }, { label: '1.14', mc: 17 }, { label: '1.13', mc: 16 },
  { label: '1.12', mc: 15 }, { label: '1.11', mc: 14 }, { label: '1.10', mc: 13 },
  { label: '1.9', mc: 12 }, { label: '1.8', mc: 11 }, { label: '1.7', mc: 10 },
];
// Bedrock biomes use the matching Java generator (same since 1.18); structures use Bedrock placement. See README.
export const BEDROCK_VERSIONS = [
  { label: '1.21+', mc: 28 }, { label: '1.20', mc: 25 }, { label: '1.18', mc: 22 },
];
/** Bedrock labels used to end in " (approx.)"; maps those (in saved seeds and links) to the current ones. */
export const currentVersionLabel = (label: string) => label.replace(/ \(approx\.\)$/, '');
export const versionsFor = (e: Edition) => (e === 'bedrock' ? BEDROCK_VERSIONS : JAVA_VERSIONS);
