import type { ChangelogEntry } from './data/changelog';

/** Id of the newest changelog entry this browser has seen. */
export const SEEN_KEY = 'mc-mapper:changelog-seen';

/** Entries newer than `seenId`. An unknown or missing id counts everything as new. */
export function unseen(entries: ChangelogEntry[], seenId: string | null): ChangelogEntry[] {
  const i = seenId === null ? -1 : entries.findIndex((e) => e.id === seenId);
  return i === -1 ? entries : entries.slice(0, i);
}

function defaultStorage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; } // access throws when site data is blocked
}

/**
 * Remembers which changelog entries this browser has seen. First-time visitors start caught up, since everything is
 * new to them; returning users (who already have saved seeds) are shown what they missed. Storage failures are
 * ignored: the worst case is the "new" dot showing again.
 */
export function createChangelogSeen(entries: ChangelogEntry[], returningUser: boolean, storage: Storage | null = defaultStorage()) {
  const read = () => { try { return storage?.getItem(SEEN_KEY) ?? null; } catch { return null; } };
  const write = (id: string) => { try { storage?.setItem(SEEN_KEY, id); } catch { /* see above */ } };
  if (read() === null && !returningUser && entries[0]) write(entries[0].id);
  return {
    unseen: () => unseen(entries, read()),
    markSeen() { if (entries[0]) write(entries[0].id); },
  };
}
