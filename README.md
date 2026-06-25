# Memory

A single-user memory-aid app: a glanceable **board of bubbles** that surfaces the
right content at the right time, fed by **smart capture** (a casual/dictated
thought is sorted by AI into tasks, goals, knowledge, or calendar events).

> **Status: scaffold.** This repo is a starting point for the more robust design
> — normalized content components with an AI **Brain** that builds the bubble
> board over them. Most logic is stubbed; it does not yet compile or run. See
> [`CLAUDE.md`](CLAUDE.md) for the map of the skeleton and what's reusable vs.
> stubbed.

## Layout (high level)

- `worker/` — one Cloudflare Worker: API, Claude proxy, the daily **Brain** run.
  - `brain.ts` builds/prioritizes bubbles; `claude.ts` handles smart capture +
    date helpers; `calendar.ts` and `search.ts` are integration stubs.
- `shared/` — types, reused date logic (`dates.ts`), deterministic signals
  (`signals.ts`).
- `src/` — the PWA: board, capture, peek, search, secondary editing views.
- `schema.sql` — D1: content tables (tasks/goals/knowledge/events) + bubbles.

## Platform

Cloudflare Worker + D1 + Claude (Anthropic). Semantic search and the Brain can
use Cloudflare Workers AI + Vectorize; calendar uses Google Calendar via a
server-side OAuth refresh token. Bindings/secrets are sketched in
`wrangler.toml`.

## Dev (once stubs are implemented)

```bash
npm install
npx wrangler d1 create memory          # paste id into wrangler.toml
npm run db:init:local
npm run build && npx wrangler dev       # Worker serves API + assets at :8787
npm run dev                             # optional: Vite hot-reload at :5173
```

Secrets: `CLAUDE_API_KEY` (capture + Brain), optional `AUTH_TOKEN`, and the
`GOOGLE_*` set for calendar.
