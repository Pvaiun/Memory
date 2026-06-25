// Memory — Cloudflare Worker (SCAFFOLD): API layer + Claude proxy + the Brain.
//
// Most handlers are stubs. The shape encodes the new design:
//   - CONTENT components (tasks/goals/knowledge/events) each get plain CRUD.
//   - SMART CAPTURE proposes items across components; commit applies them.
//   - The BOARD reads bubbles; the BRAIN (re)builds them on a daily cron and
//     deterministic rules update them between runs.
//   - SEARCH is semantic; CALENDAR mirrors Google.
//
// Bindings (wrangler.toml): DB (D1), ASSETS, optional AI (Workers AI) and
// VECTORIZE for search. Secrets: CLAUDE_API_KEY, AUTH_TOKEN, GOOGLE_*.

import type { CaptureProposal, UserContext } from "../shared/types";
import { proposeCapture } from "./claude";
import { rebuildBubbles, applyInterimUpdates } from "./brain";
import { semanticSearch } from "./search";
import { listGoogleEvents } from "./calendar";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AI?: unknown; // Workers AI (embeddings) — type during dev
  VECTORIZE?: unknown; // Vectorize index — type during dev
  CLAUDE_API_KEY?: string;
  CLAUDE_MODEL?: string;
  AUTH_TOKEN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const bad = (msg: string, status = 400) => json({ error: msg }, status);
const TODO = (what: string) => json({ todo: what }, 501);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request); // serve PWA

    if (env.AUTH_TOKEN) {
      const auth = request.headers.get("authorization") || "";
      if (auth !== `Bearer ${env.AUTH_TOKEN}`) return bad("unauthorized", 401);
    }
    try {
      return await route(request, env, url);
    } catch (err) {
      return bad(err instanceof Error ? err.message : "server error", 500);
    }
  },

  // Daily Brain rebuild (cron in wrangler.toml). Single user, so no per-user loop.
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const ctx = await loadContext(env);
    const result = await rebuildBubbles(env, ctx);
    await persistBubbles(env, result);
  },
};

async function route(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;
  const m = request.method;
  const tz = request.headers.get("x-tz") || undefined; // for date resolution

  // ---- Board / bubbles ----
  if (path === "/api/bubbles" && m === "GET") return TODO("load bubbles (+items) for the board");
  if (path === "/api/bubbles/rebuild" && m === "POST") {
    const result = await rebuildBubbles(env, await loadContext(env), tz);
    await persistBubbles(env, result);
    return json({ ok: true, count: result.bubbles.length });
  }
  const bubbleMatch = path.match(/^\/api\/bubbles\/([^/]+)$/);
  if (bubbleMatch && m === "PATCH") return TODO("pin/dismiss/reprioritize a bubble");

  // ---- Smart capture ----
  if (path === "/api/capture" && m === "POST") {
    const { text } = (await request.json()) as { text?: string };
    if (!text?.trim()) return bad("empty capture");
    const proposal: CaptureProposal = await proposeCapture(env, text.trim(), await loadContext(env), tz);
    return json({ proposal });
  }
  if (path === "/api/capture/commit" && m === "POST") {
    // TODO: persist each approved ProposedItem into its component table; push
    // events flagged push_to_calendar; index new items for search; run interim
    // bubble updates.
    applyInterimUpdates(await loadContext(env));
    return TODO("commit an approved capture proposal");
  }

  // ---- Content CRUD (secondary interfaces; lower priority than the board) ----
  for (const kind of ["tasks", "goals", "knowledge", "events"]) {
    if (path === `/api/${kind}` && m === "GET") return TODO(`list ${kind}`);
    if (path === `/api/${kind}` && m === "POST") return TODO(`create a ${kind} item`);
    if (path.match(new RegExp(`^/api/${kind}/[^/]+$`)) && m === "PATCH") return TODO(`update ${kind}`);
    if (path.match(new RegExp(`^/api/${kind}/[^/]+$`)) && m === "DELETE") return TODO(`delete ${kind}`);
  }
  // Goal "act on it" (records an activation; updates last_acted_at/act_count).
  if (path.match(/^\/api\/goals\/[^/]+\/act$/) && m === "POST") return TODO("record a goal activation");

  // ---- Search (semantic) ----
  if (path === "/api/search" && m === "GET") {
    return json({ results: await semanticSearch(env, url.searchParams.get("q") || "") });
  }

  // ---- Calendar (Google mirror) ----
  if (path === "/api/calendar/sync" && m === "POST") {
    await listGoogleEvents(env);
    return TODO("pull Google events into the events table");
  }

  return bad("not found", 404);
}

// ---- Data access (stubs) -------------------------------------------------

async function loadContext(env: Env): Promise<UserContext> {
  // TODO: SELECT from tasks/goals/knowledge/events + user_profile.
  void env;
  return { tasks: [], goals: [], knowledge: [], events: [], profile: null, now: Date.now() };
}

async function persistBubbles(env: Env, result: { bubbles: unknown[] }): Promise<void> {
  // TODO: upsert bubbles + bubble_items, preserving pinned/dismissed, replacing
  // the previous day's non-pinned set.
  void env;
  void result;
}

export function uuid(): string {
  return crypto.randomUUID();
}
