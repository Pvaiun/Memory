# Memory

A personal, single-user **contextual second brain**, delivered as a PWA on
Cloudflare. The home screen is a board of rounded bubbles, one per active
**Space** (a context such as a project, person, or reference topic), sized and
ordered by a deterministic relevance score. Each Space holds typed **blocks**
and a cached, AI-maintained **living summary**.

A deeper reference for how the app works and the technical choices behind it is
in [`CLAUDE.md`](CLAUDE.md).

## What's here

| Piece | Where | Notes |
|---|---|---|
| **The board** | `src/components/Board.tsx`, `Bubble.tsx` | Single relevance-ordered flow of rounded bubbles, sized by tier, with animated reflow via framer-motion (FLIP). |
| **Relevance engine** | `shared/relevance.ts` | Deterministic, dispatched by block type (tasks escalate with age, facts stay flat). Separate from layout; unit-tested. |
| **Capture** | `src/components/CaptureBar.tsx` (fast dump) · `SpaceView.tsx` (manual) | The AI proposes a home; one-tap confirm/redirect. Auto-files. |
| **Living summaries** | `worker/claude.ts` · `shared/summary.ts` | Cached on the Space, regenerated when its blocks change. Heuristic fallback when no AI. |
| **Dates** | `shared/dates.ts` · `worker/claude.ts` | Timezone-aware capture; relative wording rendered live on the client. |
| **Search** | `src/components/SearchOverlay.tsx` · D1 FTS5 | Full-text over titles, content, summaries. |
| **Backend** | `worker/index.ts` | API + Claude proxy in one Worker. The Claude key is a Worker secret, not in client code. |
| **Data** | `schema.sql` | D1 (SQLite). Relevance-queried fields are real columns; the rest is JSON. |

With no `CLAUDE_API_KEY`, capture falls back to a deterministic parser and
summaries to a heuristic; layout does not block on the AI being wired up.

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

When using `AUTH_TOKEN`, the client must send the same value; it is compiled in
at build time from `VITE_AUTH_TOKEN` (a build variable equal to `AUTH_TOKEN`).

## Test

```bash
npm test        # relevance + date logic unit tests
npm run typecheck
```

## Deploy

```bash
npm run db:init:remote
npm run deploy
```

The model used for Claude calls is `CLAUDE_MODEL` in `wrangler.toml` (currently
`claude-sonnet-4-6`), overridable per environment in the dashboard.
