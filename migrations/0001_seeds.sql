CREATE TABLE IF NOT EXISTS seeds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  seed TEXT NOT NULL,
  edition TEXT NOT NULL DEFAULT 'java',
  version TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seeds_created ON seeds (created_at DESC);
