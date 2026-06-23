// Memory — Cloudflare Worker: the API layer AND the Claude proxy (spec §8).
// The Claude API key lives only as a Worker secret (spec §10.9). This same
// Worker is reused unchanged when the app is later wrapped natively.

import type {
  Space,
  SpaceWithBlocks,
  Block,
  BlockType,
  SpaceType,
} from "../shared/types";
import { heuristicSummary } from "../shared/summary";
import { proposeCapture, generateSummary } from "./claude";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  CLAUDE_API_KEY?: string;
  CLAUDE_MODEL?: string;
  AUTH_TOKEN?: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const bad = (msg: string, status = 400) => json({ error: msg }, status);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request); // serve the PWA
    }

    // Single-user bearer auth — trivial by design (spec §8). No-op if unset.
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
};

async function route(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;
  const m = request.method;

  // GET /api/state  -> all non-archived spaces with their blocks
  if (path === "/api/state" && m === "GET") {
    return json({ spaces: await loadSpaces(env, false) });
  }
  // GET /api/archive
  if (path === "/api/archive" && m === "GET") {
    return json({ spaces: await loadSpaces(env, true) });
  }
  // GET /api/search?q=
  if (path === "/api/search" && m === "GET") {
    return json({ spaces: await search(env, url.searchParams.get("q") || "") });
  }

  // POST /api/spaces  -> create a space (one-tap spin-up, spec §2)
  if (path === "/api/spaces" && m === "POST") {
    const body = (await request.json()) as Partial<Space>;
    return json(await createSpace(env, body));
  }

  // POST /api/capture -> AI fast-dump proposal (does NOT auto-commit; spec §5)
  if (path === "/api/capture" && m === "POST") {
    const { text } = (await request.json()) as { text?: string };
    if (!text || !text.trim()) return bad("empty capture");
    const spaces = await loadSpaces(env, false);
    const proposal = await proposeCapture(env, text.trim(), spaces);
    return json({ proposal });
  }

  // /api/spaces/:id
  const spaceMatch = path.match(/^\/api\/spaces\/([^/]+)$/);
  if (spaceMatch) {
    const id = spaceMatch[1];
    if (m === "PATCH") return json(await patchSpace(env, id, await request.json()));
    if (m === "DELETE") {
      await env.DB.prepare("DELETE FROM spaces WHERE id = ?").bind(id).run();
      await reindexDelete(env, id);
      return json({ ok: true });
    }
  }

  // /api/spaces/:id/blocks  -> add a block
  const blocksMatch = path.match(/^\/api\/spaces\/([^/]+)\/blocks$/);
  if (blocksMatch && m === "POST") {
    return json(await addBlock(env, blocksMatch[1], await request.json()));
  }

  // /api/blocks/:id
  const blockMatch = path.match(/^\/api\/blocks\/([^/]+)$/);
  if (blockMatch) {
    const id = blockMatch[1];
    if (m === "PATCH") return json(await patchBlock(env, id, await request.json()));
    if (m === "DELETE") return json(await deleteBlock(env, id));
  }

  return bad("not found", 404);
}

// ---- Data access --------------------------------------------------------

function parseBlock(row: Record<string, unknown>): Block {
  return {
    id: row.id as string,
    space_id: row.space_id as string,
    type: row.type as BlockType,
    content: safeJson(row.content as string),
    completed: (row.completed as 0 | 1 | null) ?? null,
    due_date: (row.due_date as number | null) ?? null,
    event_date: (row.event_date as number | null) ?? null,
    sort_order: (row.sort_order as number) ?? 0,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
  };
}

function safeJson(s: string): Record<string, unknown> {
  try {
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

async function loadSpaces(env: Env, archived: boolean): Promise<SpaceWithBlocks[]> {
  const cond = archived ? "= 'archived'" : "!= 'archived'";
  const spaces = await env.DB.prepare(
    `SELECT * FROM spaces WHERE lifecycle ${cond} ORDER BY updated_at DESC`,
  ).all<Space>();
  const blocks = await env.DB.prepare("SELECT * FROM blocks ORDER BY sort_order ASC").all();

  const bySpace = new Map<string, Block[]>();
  for (const r of blocks.results as Record<string, unknown>[]) {
    const b = parseBlock(r);
    if (!bySpace.has(b.space_id)) bySpace.set(b.space_id, []);
    bySpace.get(b.space_id)!.push(b);
  }
  return (spaces.results as Space[]).map((s) => ({
    ...s,
    blocks: bySpace.get(s.id) || [],
  }));
}

async function loadOne(env: Env, id: string): Promise<SpaceWithBlocks | null> {
  const s = await env.DB.prepare("SELECT * FROM spaces WHERE id = ?").bind(id).first<Space>();
  if (!s) return null;
  const blocks = await env.DB.prepare(
    "SELECT * FROM blocks WHERE space_id = ? ORDER BY sort_order ASC",
  )
    .bind(id)
    .all();
  return { ...s, blocks: (blocks.results as Record<string, unknown>[]).map(parseBlock) };
}

function uuid(): string {
  return crypto.randomUUID();
}

async function createSpace(env: Env, body: Partial<Space>): Promise<Space> {
  const now = Date.now();
  const type = (body.type as SpaceType) || "standalone";
  const lifecycle = body.lifecycle === "pinned" ? "pinned" : "active";
  const s: Space = {
    id: uuid(),
    title: (body.title || "Untitled").toString().slice(0, 200),
    type,
    lifecycle,
    pin_weight: body.pin_weight ?? (lifecycle === "pinned" ? 1 : 0),
    summary: null,
    unread: 1,
    created_at: now,
    updated_at: now,
    accessed_at: now,
  };
  await env.DB.prepare(
    `INSERT INTO spaces (id,title,type,lifecycle,pin_weight,summary,unread,created_at,updated_at,accessed_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      s.id, s.title, s.type, s.lifecycle, s.pin_weight, s.summary,
      s.unread, s.created_at, s.updated_at, s.accessed_at,
    )
    .run();
  await reindex(env, s.id);
  return s;
}

async function patchSpace(env: Env, id: string, body: Partial<Space>): Promise<Space> {
  const now = Date.now();
  const fields: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown) => {
    fields.push(`${col} = ?`);
    vals.push(v);
  };

  if (body.title != null) set("title", String(body.title).slice(0, 200));
  if (body.type != null) set("type", body.type);
  if (body.lifecycle != null) {
    set("lifecycle", body.lifecycle);
    // pin lifecycle implies a manual boost; archiving clears it.
    if (body.lifecycle === "pinned" && body.pin_weight == null) set("pin_weight", 1);
    if (body.lifecycle !== "pinned" && body.pin_weight == null) set("pin_weight", 0);
  }
  if (body.pin_weight != null) set("pin_weight", body.pin_weight);
  if (body.summary != null) set("summary", body.summary);
  // Reading discharges the glow (spec §4) and stamps access — but never drives
  // position (spec §10.7).
  if (body.unread != null) {
    set("unread", body.unread);
    if (body.unread === 0) set("accessed_at", now);
  }
  set("updated_at", now);

  vals.push(id);
  await env.DB.prepare(`UPDATE spaces SET ${fields.join(", ")} WHERE id = ?`).bind(...vals).run();

  if (body.title != null) await reindex(env, id);
  return (await env.DB.prepare("SELECT * FROM spaces WHERE id = ?").bind(id).first<Space>())!;
}

async function addBlock(env: Env, spaceId: string, body: Partial<Block>): Promise<Block> {
  const now = Date.now();
  const order = await env.DB.prepare(
    "SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM blocks WHERE space_id = ?",
  )
    .bind(spaceId)
    .first<{ n: number }>();
  const b: Block = {
    id: uuid(),
    space_id: spaceId,
    type: (body.type as BlockType) || "note",
    content: (body.content as Record<string, unknown>) || {},
    completed:
      body.type === "task" || body.type === "checklist_item"
        ? ((body.completed as 0 | 1) ?? 0)
        : null,
    due_date: body.due_date ?? null,
    event_date: body.event_date ?? null,
    sort_order: order?.n ?? 0,
    created_at: now,
    updated_at: now,
  };
  await env.DB.prepare(
    `INSERT INTO blocks (id,space_id,type,content,completed,due_date,event_date,sort_order,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      b.id, b.space_id, b.type, JSON.stringify(b.content), b.completed,
      b.due_date, b.event_date, b.sort_order, b.created_at, b.updated_at,
    )
    .run();

  // New capture sets the glow (spec §4) and refreshes the cached summary.
  await env.DB.prepare("UPDATE spaces SET unread = 1, updated_at = ? WHERE id = ?")
    .bind(now, spaceId)
    .run();
  await refreshSummary(env, spaceId);
  await reindex(env, spaceId);
  return b;
}

async function patchBlock(env: Env, id: string, body: Partial<Block>): Promise<Block> {
  const now = Date.now();
  const fields: string[] = [];
  const vals: unknown[] = [];
  const set = (c: string, v: unknown) => {
    fields.push(`${c} = ?`);
    vals.push(v);
  };
  if (body.content != null) set("content", JSON.stringify(body.content));
  if (body.completed != null) set("completed", body.completed);
  if (body.due_date !== undefined) set("due_date", body.due_date);
  if (body.event_date !== undefined) set("event_date", body.event_date);
  if (body.sort_order != null) set("sort_order", body.sort_order);
  set("updated_at", now);
  vals.push(id);
  await env.DB.prepare(`UPDATE blocks SET ${fields.join(", ")} WHERE id = ?`).bind(...vals).run();

  const block = await env.DB.prepare("SELECT * FROM blocks WHERE id = ?").bind(id).first();
  const spaceId = (block as { space_id: string }).space_id;
  await refreshSummary(env, spaceId);
  await reindex(env, spaceId);
  return parseBlock(block as Record<string, unknown>);
}

async function deleteBlock(env: Env, id: string): Promise<{ ok: true }> {
  const block = await env.DB.prepare("SELECT space_id FROM blocks WHERE id = ?").bind(id).first();
  await env.DB.prepare("DELETE FROM blocks WHERE id = ?").bind(id).run();
  if (block) {
    const spaceId = (block as { space_id: string }).space_id;
    await refreshSummary(env, spaceId);
    await reindex(env, spaceId);
  }
  return { ok: true };
}

// ---- Living summary (spec §6: regenerate when blocks change) -------------

async function refreshSummary(env: Env, spaceId: string): Promise<void> {
  const space = await loadOne(env, spaceId);
  if (!space) return;
  // AI summary when configured; deterministic heuristic otherwise (spec §6).
  let summary = heuristicSummary(space, Date.now());
  if (env.CLAUDE_API_KEY) {
    const ai = await generateSummary(env, space).catch(() => null);
    if (ai) summary = ai;
  }
  await env.DB.prepare("UPDATE spaces SET summary = ? WHERE id = ?")
    .bind(summary || null, spaceId)
    .run();
}

// ---- Search index (FTS5, spec §7) ---------------------------------------

async function reindex(env: Env, spaceId: string): Promise<void> {
  const space = await loadOne(env, spaceId);
  if (!space) return;
  const body = [
    space.summary || "",
    ...space.blocks.map((b) => JSON.stringify(b.content)),
  ].join(" \n ");
  await env.DB.prepare("DELETE FROM search_index WHERE space_id = ?").bind(spaceId).run();
  await env.DB.prepare(
    "INSERT INTO search_index (space_id, title, body) VALUES (?, ?, ?)",
  )
    .bind(spaceId, space.title, body)
    .run();
}

async function reindexDelete(env: Env, spaceId: string): Promise<void> {
  await env.DB.prepare("DELETE FROM search_index WHERE space_id = ?").bind(spaceId).run();
}

async function search(env: Env, q: string): Promise<SpaceWithBlocks[]> {
  if (!q.trim()) return [];
  // Prefix match on each term so search feels live.
  const query = q
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
    .map((t) => `${t}*`)
    .join(" ");
  if (!query) return [];
  const hits = await env.DB.prepare(
    "SELECT space_id FROM search_index WHERE search_index MATCH ? ORDER BY rank LIMIT 30",
  )
    .bind(query)
    .all<{ space_id: string }>();
  const ids = (hits.results || []).map((r) => r.space_id);
  const out: SpaceWithBlocks[] = [];
  for (const id of ids) {
    const s = await loadOne(env, id);
    if (s) out.push(s);
  }
  return out;
}
