# CLAUDE.md

**This repository is a SCAFFOLD**, not a finished app. It was reshaped from a
working single-user prototype into a starting point for the more robust design
(the "Brain"-driven bubble board over normalized content components). Most logic
is stubbed with `TODO`s; it is not expected to compile or run yet. This file is
a map of the skeleton for the next implementer.

---

## The shape of the system

Two layers:

1. **Content components** — where the user's data actually lives, normalized:
   - **tasks** (deadline or priority, category, recurring or one-shot)
   - **goals** (ongoing, no deadline, "acted on" over time)
   - **knowledge** (timeless, categorized, searchable)
   - **events** (app-only or mirrored from Google Calendar)

2. **Bubbles** — the board. Bubbles do **not** store content; they **reference**
   it (many-to-many), so one item can appear in several bubbles and a bubble can
   lump items from different components into one actionable card. Bubbles are
   built by **the Brain**.

The two most important features (per the design) are **smart capture** and the
**bubble board**; everything else is secondary.

---

## What carried over from the prototype (reusable, not stubs)

- `shared/dates.ts` — timezone-aware relative date wording + `[[ref]]` token
  rendering. Used as-is. (`shared/dates.test.ts` still passes.)
- `worker/claude.ts` date helpers — `localDate`, `upcomingDays` (the 14-day
  weekday lookup table), `toEpoch`, `fmtDate`. These solve relative-date
  resolution correctly; reuse them.
- `shared/signals.ts` — the prototype's relevance curves, repurposed as the
  **deterministic, non-AI supplement** the design calls for (urgency/recency per
  item; used to feed the Brain and to update bubble priority between AI runs).
- Platform plumbing — single Worker (API + Claude proxy + cron), D1, the PWA
  shell (`src/main.tsx`, `ErrorBoundary.tsx`, `styles.css`, `public/sw.js`),
  bearer auth, and the build/deploy setup.

---

## Repository layout

```
worker/
  index.ts      API router + the daily `scheduled()` Brain run. Most handlers stubbed.
  claude.ts     Claude proxy + date helpers; smart capture (multi-item) proposal.
  brain.ts      The Brain: AI bubble rebuild + deterministic interim updates + user profile.
  calendar.ts   Google Calendar read/push (OAuth refresh-token flow). Stubs.
  search.ts     Semantic search: embeddings + Vectorize. Stubs.
shared/
  types.ts      Content + bubble + capture types.
  dates.ts      Relative date wording + token rendering (reused).
  signals.ts    Deterministic per-item urgency/recency (the non-AI supplement).
  dates.test.ts vitest (still valid).
src/
  App.tsx                 Board-first shell; capture; peek; search; library.
  api.ts                  Typed client for the new endpoints.
  components/
    Board.tsx             Priority-ordered flow of bubbles (FLIP reflow).
    Bubble.tsx            One bubble: title + glanceable description + display vectors.
    CaptureBar.tsx        Smart capture; multi-item proposal confirm.
    Peek.tsx              Bubble detail: linked items + pin/dismiss.
    SearchOverlay.tsx     Semantic search box.
    ComponentsView.tsx    Secondary direct-edit interfaces (placeholder).
  main.tsx, ErrorBoundary.tsx, styles.css   (reused)
schema.sql      D1 schema: content tables + bubbles/bubble_items + user_profile + embeddings.
wrangler.toml   Bindings, daily cron, and commented-out AI/Vectorize/Google config.
```

---

## The Brain (`worker/brain.ts`) — the centerpiece, most design-open

- **Full rebuild** (`rebuildBubbles`): an AI pass that builds the day's bubbles
  from the whole context plus the persisted user profile. Expensive → intended
  to run on a **daily cron** (`scheduled()` in `index.ts`; time in
  `wrangler.toml`).
- **Interim updates** (`applyInterimUpdates`): cheap, deterministic changes on
  every content edit (deprioritize a bubble as items complete, spawn "New Today",
  raise "due tonight") — no AI call. Uses `shared/signals.ts`.
- **Deterministic fallback** (`deterministicBubbles`): a rules-only board so the
  app is useful with no AI key.
- **User profile** (`updateProfile`): a short AI-maintained recap so the Brain
  isn't reasoning from scratch each run.

Key open questions left for design (all flagged in code): rebuild cadence vs.
freshness vs. cost; whether a separate "resurface" AI call is worth it; how much
context to send the model; bubble lifetime/persistence; how pinned bubbles
survive rebuilds.

---

## Proposed AI usage (for discussion — the design asks for this explicitly)

The design wants AI used deliberately, only where a deterministic algorithm
can't do the job, with cost in mind. Current proposed AI touchpoints:

1. **Smart capture** (`proposeCapture`) — interpret a casual/dictated dump into
   structured items across components. *Hard to do without AI.* Cost: per
   capture; cheapest model. Open: how much context to include; a deterministic
   fast-path for obvious single-item dumps.
2. **Brain bubble rebuild** (`rebuildBubbles`) — author/merge/prioritize the
   board. *The main AI spend.* Cost: ~once daily. Deterministic signals feed it
   and handle between-run updates so it isn't called per interaction.
3. **User profile recap** (`updateProfile`) — optional; could be folded into the
   daily rebuild rather than a separate call.
4. **Search embeddings** (`search.ts`) — embedding model (far cheaper than chat),
   on write only; querying is essentially free.

Everything else — ordering math, interim bubble updates, date resolution — is
deterministic on purpose.

---

## Not yet started

Google Calendar sync, semantic search wiring, notifications, Android share
target intake (`/share` route + manifest is declared), voice dictation, and the
secondary component-editing UIs. Stubs and `TODO`s mark each.

---

## Build / deploy

Unchanged platform: `npm run dev` (Vite + `wrangler dev`), `npm run build`,
`npm run deploy`, `npm run db:init:remote|local`, `npm test`, `npm run
typecheck`. Note: as a scaffold it will not typecheck/build until the stubs are
implemented.
