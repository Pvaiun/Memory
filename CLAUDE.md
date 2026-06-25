# CLAUDE.md

Guidance for AI agents (and humans) continuing development on **Memory**. This
describes how the app actually works today and the technical choices behind it.
The product/design rationale lives in `docs/design-spec.md` — read that for
*why*; read this for *how*.

---

## What the app is

Memory is a personal, single-user **contextual second brain** delivered as a
PWA. The home screen is a board of rounded "bubbles", one per active **Space**
(a context like a project, person, or reference topic). Bubbles are sized and
ordered by a deterministic relevance score so the most relevant thing is biggest
and first. Each Space holds typed **blocks** and an AI-maintained **living
summary**. You capture thoughts via a fast-dump box (AI files them) or by
editing a Space directly.

The three load-bearing behaviours:
1. **Deterministic relevance** decides bubble size/position. The AI never drives
   layout — only capture and summary content.
2. **Living summaries** are cached per Space and regenerated only when a Space's
   blocks change (not on every open).
3. **Dates are handled carefully** end-to-end (timezone-correct capture,
   live-rendered relative wording). This is the most subtle subsystem — see
   "Date handling".

---

## Tech stack & architecture

- **Frontend:** React 18 + Vite, TypeScript. Animations via **framer-motion**
  (`layout`/`layoutId` for FLIP reflow on the board).
- **Backend:** a single **Cloudflare Worker** (`worker/index.ts`) that is *both*
  the API layer *and* the Claude proxy. Non-`/api` requests fall through to the
  built PWA assets (served via the `ASSETS` binding, SPA mode).
- **Data:** **Cloudflare D1** (SQLite), bound as `DB`. Server-side, so the schema
  survives a future PWA→native port unchanged.
- **AI:** Claude via the Anthropic Messages API, called only from the Worker.
  The API key is a Worker secret and never reaches the client.
- **Deploy:** Cloudflare (Pages-style Git-connected build, or `wrangler deploy`).

The Worker is designed to be reused unchanged if the app is later wrapped with
Capacitor for a native widget — keep all AI/data logic server-side.

---

## Repository layout

```
worker/
  index.ts          API router + D1 data access (the backend)
  claude.ts         Claude proxy: capture proposals + summary generation + date helpers
  local-capture.ts  Deterministic fallback capture (used when no CLAUDE_API_KEY)
shared/             Code imported by BOTH worker/ and src/
  types.ts          Domain types (Space, Block, Scored, CaptureProposal, …)
  relevance.ts      Deterministic relevance engine (scoreSpaces, blockUrgency)
  summary.ts        Heuristic (non-AI) summary + blockLabel
  dates.ts          Relative-date wording + summary date-token rendering
  relevance.test.ts / dates.test.ts   vitest unit tests
src/
  main.tsx          Entry; mounts <App/> inside <ErrorBoundary/>; registers SW
  App.tsx           Top-level state: load, relevance snapshot, peek/open/search
  api.ts            Typed fetch client; adds auth + x-tz headers
  ErrorBoundary.tsx Crash screen + one-tap "Reset app" (clears SW + caches)
  components/
    Board.tsx       Relevance-ordered flow of bubbles (+ dormant collapse)
    Bubble.tsx      One Space bubble; content varies by tier
    CaptureBar.tsx  Fast-dump box; AI proposal confirm/redirect; voice button
    Peek.tsx        Tap-a-bubble sheet: summary + pin/archive/open
    SpaceView.tsx   Full Space: add/edit/complete/delete blocks; inline date edit
    SearchOverlay.tsx  Debounced full-text search
  styles.css
schema.sql          D1 schema (run once per database)
seed.sql            Optional sample data
wrangler.toml       Worker config (bindings, vars)
docs/design-spec.md Product spec (the "why")
```

---

## Data model (D1 — `schema.sql`)

**`spaces`**: `id` (uuid text), `title`, `type` (`project|person|reference|standalone`),
`lifecycle` (`active|pinned|archived`), `pin_weight` (real), `summary` (text,
nullable cached summary), `unread` (0/1 glow flag), `created_at`, `updated_at`,
`accessed_at` (epoch ms).

**`blocks`**: `id`, `space_id` (fk, cascade delete), `type`
(`fact|task|checklist_item|note|contact|date`), `content` (JSON text),
`completed` (0/1, nullable — only tasks/checklist), `due_date` (epoch ms,
nullable), `event_date` (epoch ms, nullable), `sort_order`, `created_at`,
`updated_at`.

**`search_index`**: FTS5 virtual table (`space_id`, `title`, `body`) for search.

Schema rationale: fields the relevance engine queries (`completed`, `due_date`,
`event_date`, `pin_weight`, timestamps, `unread`) are real columns so the engine
never parses JSON; everything block-shape-specific lives in `content` JSON.

All timestamps are **epoch milliseconds**. Types are in `shared/types.ts`.

---

## API (all under `/api`, JSON)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/state` | All non-archived Spaces with their blocks |
| GET | `/api/archive` | Archived Spaces |
| GET | `/api/search?q=` | FTS5 search (prefix-matched terms) |
| POST | `/api/spaces` | Create a Space |
| PATCH | `/api/spaces/:id` | Update title/type/lifecycle/pin/summary/unread |
| DELETE | `/api/spaces/:id` | Delete a Space (cascades blocks) |
| POST | `/api/spaces/:id/blocks` | Add a block |
| PATCH | `/api/blocks/:id` | Update a block (content/completed/dates/order) |
| DELETE | `/api/blocks/:id` | Delete a block |
| POST | `/api/capture` | AI fast-dump → returns a `CaptureProposal` (does NOT commit) |
| POST | `/api/resummarize` | Rebuild every Space's cached summary (one-time maintenance) |

Non-`/api` paths serve the PWA. Client calls go through `src/api.ts`, which sets
`content-type`, the optional `Authorization: Bearer` header, and the `x-tz`
header (see Date handling).

---

## Relevance engine (`shared/relevance.ts`)

Deterministic and **inspectable** — never AI-driven. `scoreSpaces(spaces, {now})`
returns `Scored[]` sorted by descending score, each with a `tier`, a `charged`
flag (glow), and a human-readable `reason`.

- Runs **client-side** (in `App.tsx`) against a snapshot `now`. Also used
  server-side indirectly via the heuristic summary's urgency sort.
- A Space's score = `pin` + `recencyBoost` + `max(blockUrgency over blocks)`.
- `blockUrgency` is **dispatched by block type** (the core modelling decision):
  - `date` → rises hyperbolically as `event_date` nears, peaks on the day,
    decays after.
  - `task`/`checklist_item` (incomplete): with `due_date` → date curve, and
    **escalates without decay once overdue**; without `due_date` → escalates
    with age since creation. Completed → 0 (disappears).
  - `fact`/`note`/`contact` → low **flat** baseline; must never get louder with
    age.
- Score maps to tiers via thresholds (`tierActive`/`tierMedium`); `hero` is the
  top 1–2 that also clear `heroFloor`. Constants live in `CONST` and are meant to
  be tuned.

**Snapshot model (important):** relevance is computed once per "session" against
a frozen `now`, held stable while the user looks (no jitter), and recomputed on
discrete events: load, view switch, capture commit, app foreground, and calendar
day rollover (see `App.tsx` effects). There is **no cron**; nothing recomputes on
a timer.

---

## Date handling (the subtle part)

Dates flow through several stages, each chosen to avoid a specific bug. Touch
this area carefully.

1. **Timezone reaches the server via a header.** `src/api.ts` sends `x-tz` (the
   device IANA zone, e.g. `America/Toronto`) on every request. The Worker reads
   it in `route()` and threads it into capture and summary functions. Never
   resolve dates against the Worker's UTC.

2. **Capture resolves dates by lookup, not arithmetic.** In `worker/claude.ts`,
   `proposeCapture` builds a human-readable local "today", the UTC offset, and a
   **`calendar` array of the next 14 days** (`"Thursday 2026-06-25"`). The model
   is told to *look up* weekday/relative references in that list rather than
   compute them (it miscounts weekday math). The model returns dates as ISO
   strings **including the offset**; `toEpoch()` converts them to epoch ms
   server-side (the model never emits epoch ms).

3. **Stored dates are epoch ms.** `due_date`/`event_date` columns.

4. **Relative wording is rendered live on the client** (`shared/dates.ts`):
   - `relativeDate(when, now)` → `today` / `tomorrow` / `yesterday` /
     `in N days` / `N days ago` (under 2 weeks) / `in N weeks` (to ~2 months) /
     `in N months`. Computed on **civil-day boundaries in local time** (so
     "tomorrow" flips at midnight, not on a rolling 24h clock).
   - Used by block rows (`SpaceView`), bubble digests, and the peek reason —
     all read live block data, so they're always current.

5. **Summaries embed date *references*, not literal dates.** AI summaries emit
   tokens that point at a block: `[[<id-prefix>]]` (the first 8 chars of the
   block id). `applyDateTokens(text, now, blocks)` resolves each token against
   the live blocks and renders the current relative wording. Consequences:
   - Editing a block's date updates the summary's date text automatically on
     next load — **no AI regeneration needed, and it can't go stale**.
   - A literal `[[YYYY-MM-DD]]` token is still supported as a fallback for legacy
     summaries.
   - When picking a `<input type="date">` value, anchor at **local noon**
     (`dateInputToEpoch` in `SpaceView.tsx`) — `new Date("YYYY-MM-DD")` parses as
     UTC midnight and shifts the day west.

If you add a place that displays a date, render via `relativeDate` /
`applyDateTokens`; do not format epoch ms directly.

---

## Living summaries (`worker/claude.ts`, `shared/summary.ts`)

- Cached in `spaces.summary`. Regenerated **only when a Space's blocks change**
  (add/edit/complete/delete), via `refreshSummary` in `worker/index.ts`.
- With `CLAUDE_API_KEY` set → AI summary (`generateSummary`). Without it →
  deterministic `heuristicSummary` (top-N most-urgent block labels). The layout
  never blocks on the AI.
- The summary prompt is told to emit `[[ref]]` date tokens (see Date handling)
  and never literal/relative dates.
- **Date-only block edits skip the AI.** `patchBlock` detects a change touching
  only `due_date`/`event_date` (no `content`/`completed`) and skips both
  `refreshSummary` and reindex — there's nothing textual to change because the
  summary's `[[ref]]` tokens re-resolve client-side. This keeps date edits free.
- `/api/resummarize` rebuilds all summaries; `App.tsx` calls it once per device
  (guarded by a `localStorage` flag, currently `resummarized_dates_v2`) so
  existing summaries adopt the latest token format. Bump that flag's version if a
  future change requires another one-time rebuild.

---

## Capture (`worker/claude.ts`, `CaptureBar.tsx`)

- **Fast-dump:** `POST /api/capture` returns a `CaptureProposal` (target Space —
  existing or new — block type, structured content, confidence). It does **not**
  auto-commit; the client shows a one-tap confirm/redirect, then creates the
  Space (if new) and the block. Low confidence is presented more tentatively.
- **Manual:** open a Space in `SpaceView` and add/edit/complete/delete blocks
  directly, including inline date editing.
- The AI degrades gracefully: if the key is unset or the call fails,
  `local-capture.ts` produces a deterministic proposal so capture never blocks.

---

## Other behaviours

- **Glow / unread:** new captures set `spaces.unread = 1` (drives the bubble
  glow). Peeking/reading sets it back to 0 and stamps `accessed_at`. Access
  **never** affects relevance/position — it only clears the glow.
- **Archive:** sets `lifecycle = 'archived'`, removing the Space from the board;
  still searchable and visible in the archive view. Pin sets `lifecycle =
  'pinned'` with `pin_weight`.
- **Search:** FTS5 over title + block content + summary, prefix-matched per term.
- **Service worker (`public/sw.js`):** **network-first for HTML/navigations**
  (so deploys are picked up immediately — a cache-first shell served stale
  `index.html` referencing renamed bundles → white screen), cache-first only for
  hashed assets. Bump `CACHE` (e.g. `memory-shell-vN`) when changing the SW.
- **Error recovery:** `ErrorBoundary` shows a crash screen with a **Reset app**
  button that unregisters the SW and clears caches — important on mobile where
  there are no devtools.

---

## Auth

Single-user bearer token, intentionally trivial.
- `AUTH_TOKEN` — **runtime** Worker secret; checked on every `/api` request.
- `VITE_AUTH_TOKEN` — **build-time** variable, compiled into the client so it can
  send `Authorization: Bearer`. Must equal `AUTH_TOKEN`.
- Both unset → API is open (fine for local dev). Note the token is embedded in
  the public bundle, so it deters bots, not determined humans; Cloudflare Access
  is the stronger option if real privacy is needed.

---

## Configuration, build & deploy

**`wrangler.toml`**
- `[[d1_databases]]` binding `DB`, `database_name = "memory"`, `database_id` set
  to the real D1 id.
- `[assets]` binding `ASSETS`, `directory = ./dist/client`, SPA not-found.
- `[vars] CLAUDE_MODEL = "claude-sonnet-4-6"` — the model for all Claude calls.
  Override per environment in the dashboard if needed. Code falls back to
  `claude-sonnet-4-6` if unset (`worker/claude.ts`).
- Secrets (set via dashboard or `wrangler secret put`): `CLAUDE_API_KEY`,
  `AUTH_TOKEN`.

**npm scripts**
- `npm run dev` — Vite dev server (proxies `/api` to a local `wrangler dev` on
  `:8787`).
- `npm run build` — `tsc -b && vite build` → `dist/client`.
- `npm run deploy` — build + `wrangler deploy`.
- `npm run db:init:remote` / `db:init:local` — apply `schema.sql`.
- `npm test` / `npm run typecheck` — vitest / TS check.

First-time setup: create the D1 database, put its id in `wrangler.toml`, run the
schema, set `CLAUDE_API_KEY` (+ `AUTH_TOKEN`/`VITE_AUTH_TOKEN` if using auth),
deploy.

---

## Conventions & gotchas

- **Keep relevance/layout AI-free.** The AI owns capture and summary content
  only. Dates, pins, recency, and task age own position.
- **`shared/` is imported by both runtimes.** No DOM-only or Node-only APIs
  there. (`shared/dates.ts` uses `Intl` + `Date`, available in both.)
- **Store epoch ms; render relative.** Don't surface raw dates; go through
  `relativeDate` / `applyDateTokens`.
- **Summaries cache on write, not read.** Don't add per-open AI calls. Date-only
  edits must stay AI-free.
- **Snapshot, don't poll.** Recompute relevance on discrete events; never add a
  timer that reshuffles the board while the user is looking.
- **Tests cover the deterministic core** (`relevance.test.ts`, `dates.test.ts`).
  Run `npm test` and `npm run typecheck` before committing; add cases when
  changing scoring or date wording.
- Default to keeping the Worker the single AI/data backend so a future native
  wrap reuses it unchanged.
