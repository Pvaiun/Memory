-- Memory — D1 schema.
-- Fields the relevance engine queries are promoted to real columns so the
-- engine never parses JSON; everything else lives in the flexible `content`
-- JSON so block shapes can evolve without schema churn.

CREATE TABLE IF NOT EXISTS spaces (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'standalone',   -- project | person | reference | standalone
  lifecycle   TEXT NOT NULL DEFAULT 'active',        -- active | pinned | archived
  pin_weight  REAL NOT NULL DEFAULT 0,               -- manual boost
  summary     TEXT,                                  -- cached living summary
  unread      INTEGER NOT NULL DEFAULT 1,            -- glow flag
  created_at  INTEGER NOT NULL,                      -- epoch ms
  updated_at  INTEGER NOT NULL,                      -- epoch ms
  accessed_at INTEGER NOT NULL                       -- epoch ms (last peek/read)
);

CREATE TABLE IF NOT EXISTS blocks (
  id          TEXT PRIMARY KEY,
  space_id    TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,                         -- fact | task | checklist_item | note | contact | date
  content     TEXT NOT NULL DEFAULT '{}',            -- JSON; shape depends on type
  completed   INTEGER,                               -- 0/1, nullable (only tasks/checklist)
  due_date    INTEGER,                               -- epoch ms, nullable
  event_date  INTEGER,                               -- epoch ms, nullable
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blocks_space   ON blocks(space_id);
CREATE INDEX IF NOT EXISTS idx_spaces_life     ON spaces(lifecycle);

-- Full-text search across titles, block content, and summaries.
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  space_id UNINDEXED,
  title,
  body,
  tokenize = 'porter unicode61'
);
