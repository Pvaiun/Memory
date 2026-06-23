# Memory

A personal, single-user **contextual second brain**. Memory holds large amounts
of changing information and **surfaces the right content at the right moment,
visually, with zero recall effort.** It is not a reminder, to-do, or timer app.

This repo is **Phase 1** of the [design spec](#design): the full app as a PWA on
Cloudflare. Phase 2 (Capacitor wrap + native home-screen widget) builds on the
same Worker and D1 schema, untouched.

## What's here

| Piece | Where | Notes |
|---|---|---|
| **The board** | `src/components/Board.tsx`, `Bubble.tsx` | Single relevance-ordered flow of rounded bubbles, sized by tier, **animated reflow** via framer-motion (FLIP). |
| **Relevance engine** | `shared/relevance.ts` | Deterministic, dispatched **by block type** (tasks escalate, facts never do). Kept separate from layout; unit-tested. |
| **Capture** | `src/components/CaptureBar.tsx` (fast dump) · `SpaceView.tsx` (manual) | AI proposes a home; one-tap confirm/redirect. Auto-files — no triage queue. |
| **Living summaries** | `worker/claude.ts` · `shared/summary.ts` | AI-maintained, cached on the Space, regenerated on change. Heuristic fallback. |
| **Search** | `src/components/SearchOverlay.tsx` · D1 FTS5 | Full-text over titles, content, summaries. |
| **Backend** | `worker/index.ts` | API + Claude proxy in one Worker. **Claude key is a Worker secret, never in client code.** |
| **Data** | `schema.sql` | D1 (SQLite). Relevance-queried fields are real columns; the rest is JSON. |

The AI is **optional**: with no `CLAUDE_API_KEY`, capture falls back to a
deterministic parser and summaries to a heuristic. The layout never blocks on
the AI being wired up.

## Run locally

```bash
npm install

# 1. Create the D1 database, paste the printed id into wrangler.toml
npx wrangler d1 create memory

# 2. Apply schema (and optional demo data)
npm run db:init:local
npx wrangler d1 execute memory --local --file=./seed.sql   # optional

# 3. Build the PWA, then run the Worker (serves API + assets) at :8787
npm run build
npx wrangler dev
```

For frontend hot-reload, run `npm run dev` (Vite at :5173, proxying `/api` to
`wrangler dev` on :8787) in a second terminal.

### Secrets

```bash
npx wrangler secret put CLAUDE_API_KEY   # enables AI capture + summaries
npx wrangler secret put AUTH_TOKEN       # optional single-user bearer token
```

For local dev put them in a `.dev.vars` file (git-ignored):

```
CLAUDE_API_KEY=sk-ant-...
# AUTH_TOKEN=some-secret
```

## Test

```bash
npm test        # relevance engine unit tests (the load-bearing logic)
npm run typecheck
```

## Deploy

```bash
npm run db:init:remote
npm run deploy
```

## Design

The full design specification lives in [`docs/design-spec.md`](docs/design-spec.md).
The load-bearing constraints — the **task/permanent split** and the **§10
anti-patterns** (no notifications-first, no AI-driven position, no positional
stability, no hard rectangles, no mandatory inbox, no daily cron, key never in
client) — are encoded throughout and should be preserved as the app evolves.
