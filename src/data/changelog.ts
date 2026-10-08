/**
 * What's new, newest first. Add an entry at the top when shipping something users will notice; `id` must be unique
 * and never change (it's how the app remembers what each browser has already seen).
 */
export type ChangelogEntry = { id: string; date: string; title: string; items: string[] };

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-10-08-pins',
    date: '2026-10-08',
    title: 'Pins',
    items: [
      'Drop your own pins on the map: tap the 📍 button and then the map, or right-click the map.',
      'Pins belong to a saved seed and remember their dimension. Click one for its coords, /tp command and portal coords, or to rename or remove it.',
      'The Pins section in the sidebar lists them all; click one to jump there. They are included in Export/Import.',
    ],
  },
  {
    id: '2026-10-08-bedrock-structures',
    date: '2026-10-08',
    title: 'Real Bedrock structure positions',
    items: [
      "Bedrock maps now place villages, temples, monuments, outposts, mansions, ancient cities, shipwrecks, fortresses, bastions and more where Bedrock does, instead of where Java would.",
      'Bedrock seeds use all 64 bits like the game does, so large numeric seeds now show the right biomes.',
      'Structures still approximate on Bedrock (like strongholds) are marked ≈ in the filters.',
    ],
  },
  {
    id: '2026-10-08-whats-new',
    date: '2026-10-08',
    title: "What's new",
    items: [
      "This list! A dot on the What's new button means something changed since you last looked.",
    ],
  },
  {
    id: '2026-10-08-portal',
    date: '2026-10-08',
    title: 'Nether portal calculator',
    items: [
      'Type Overworld or Nether X/Z in the sidebar to get the matching spot in the other dimension.',
      'Use map center fills it from the map, and Show Overworld / Show Nether jump there.',
      'Clicking a structure offers its Nether (or Overworld) portal coords.',
    ],
  },
  {
    id: '2026-10-08-phones',
    date: '2026-10-08',
    title: 'Works on phones',
    items: [
      'The map fills the screen and the sidebar slides in from the ☰ button.',
      'Bigger buttons and zoom controls for touch.',
    ],
  },
  {
    id: '2026-10-08-surface-biomes',
    date: '2026-10-08',
    title: 'Surface biomes on 1.18+',
    items: [
      'Maps for 1.18 and later show surface biomes instead of cave biomes.',
      'Cave biomes are no longer listed in the biome filter.',
    ],
  },
  {
    id: '2026-10-08-notes-visited',
    date: '2026-10-08',
    title: 'Seed notes and visited structures',
    items: [
      'Saved seeds get a Notes box that saves as you type.',
      'Click a structure to Mark visited; Hide visited removes them from the map.',
    ],
  },
  {
    id: '2026-10-07-local-seeds',
    date: '2026-10-07',
    title: 'Saved seeds stay in your browser',
    items: [
      'Saved seeds are stored in this browser only. Use Export and Import to back them up or move them.',
      'Long sessions use less memory while panning around the map.',
    ],
  },
  {
    id: '2026-10-05-dimensions',
    date: '2026-10-05',
    title: 'Nether and End',
    items: [
      'Pick a dimension to map the Nether or the End, with their structures.',
      'Structure and biome filters are grouped by dimension.',
      'Structures show as themed emoji markers.',
    ],
  },
];
