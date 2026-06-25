-- Memory — D1 schema (SCAFFOLD).
--
-- This models the "more robust" design: normalized CONTENT components
-- (tasks, goals, knowledge, events) plus a BUBBLE projection layer that the
-- Brain builds over them. Bubbles do NOT store content — they reference it,
-- many-to-many, so one item can appear in several bubbles.
--
-- All timestamps are epoch milliseconds. Categories are free-text strings for
-- now (a dedicated categories table is a design-open question).

------------------------------------------------------------------- content

-- TASKS: things to get done. Deadline OR priority; recurring or one-shot.
CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  category    TEXT,                       -- free-text for now
  due_date    INTEGER,                     -- epoch ms; null = untimed
  priority    INTEGER,                     -- null when driven by deadline
  recurrence  TEXT,                        -- e.g. RRULE or a simple token; null = one-shot
  completed   INTEGER NOT NULL DEFAULT 0,  -- 0/1
  completed_at INTEGER,                    -- epoch ms; for the Brain's history
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- GOALS: ongoing things to be reminded to do; no deadline, "acted on" over time.
CREATE TABLE IF NOT EXISTS goals (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT,
  priority      INTEGER,
  last_acted_at INTEGER,                   -- epoch ms of most recent activation
  act_count     INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,-- 0 once completed/deleted
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- Optional richer history of goal activations (the Brain can use cadence).
CREATE TABLE IF NOT EXISTS goal_activations (
  id        TEXT PRIMARY KEY,
  goal_id   TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  acted_at  INTEGER NOT NULL
);

-- KNOWLEDGE: timeless facts/info the user wants to recall. Categorized, searchable.
CREATE TABLE IF NOT EXISTS knowledge (
  id         TEXT PRIMARY KEY,
  title      TEXT,
  body       TEXT NOT NULL,
  category   TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- EVENTS / reminders. Source 'app' (app-only) or 'google' (mirrored from GCal).
-- Only "important" app events get pushed to Google (pushed = 1, google_event_id set).
CREATE TABLE IF NOT EXISTS events (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT,
  start_at        INTEGER NOT NULL,        -- epoch ms
  end_at          INTEGER,                 -- epoch ms; null = point-in-time
  all_day         INTEGER NOT NULL DEFAULT 0,
  recurrence      TEXT,
  source          TEXT NOT NULL DEFAULT 'app', -- 'app' | 'google'
  google_event_id TEXT,                    -- set when mirrored/pushed
  pushed          INTEGER NOT NULL DEFAULT 0,  -- pushed to Google calendar
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

------------------------------------------------------------------- bubbles

-- BUBBLES: the projection layer. Built by the Brain (or deterministic rules).
-- Visual "vectors" (size/shape/color/glow) live in the `display` JSON.
CREATE TABLE IF NOT EXISTS bubbles (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,                          -- AI-generated, glanceable
  priority    REAL NOT NULL DEFAULT 0,       -- ordering weight (higher = more prominent)
  display     TEXT,                          -- JSON: {size,shape,color,glow,...}
  source      TEXT NOT NULL DEFAULT 'brain', -- 'brain' | 'rule' | 'user'
  pinned      INTEGER NOT NULL DEFAULT 0,    -- user pinned (survives rebuilds)
  dismissed   INTEGER NOT NULL DEFAULT 0,    -- user dismissed
  valid_date  TEXT,                          -- 'YYYY-MM-DD' the Brain built it for; null = persistent
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Many-to-many link from a bubble to the content items it surfaces.
CREATE TABLE IF NOT EXISTS bubble_items (
  bubble_id  TEXT NOT NULL REFERENCES bubbles(id) ON DELETE CASCADE,
  item_type  TEXT NOT NULL,                  -- 'task' | 'goal' | 'knowledge' | 'event'
  item_id    TEXT NOT NULL,
  PRIMARY KEY (bubble_id, item_type, item_id)
);

------------------------------------------------------------------- brain memory

-- A single AI-maintained recap/profile of the user's state and habits, so the
-- Brain isn't reasoning from a blank slate every run. One row.
CREATE TABLE IF NOT EXISTS user_profile (
  id         TEXT PRIMARY KEY,              -- always 'me'
  profile    TEXT,                          -- AI-written recap (text or JSON)
  updated_at INTEGER NOT NULL
);

------------------------------------------------------------------- search

-- Semantic search uses vector embeddings (see worker/search.ts + Vectorize).
-- This table just maps a content item to its stored vector + a content hash so
-- we only re-embed when the text actually changes. The vectors live in
-- Cloudflare Vectorize, not here.
CREATE TABLE IF NOT EXISTS embeddings (
  item_type    TEXT NOT NULL,
  item_id      TEXT NOT NULL,
  vector_id    TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (item_type, item_id)
);

-- TODO(search): optional FTS5 table for hybrid keyword+semantic search.
