// Semantic search (SCAFFOLD).
//
// Design: the user often recalls things only vaguely, so search must be
// semantic, not keyword. Approach: embed each content item's text, store the
// vector, and query by embedding the user's phrase and finding nearest vectors.
//
// On Cloudflare this is cheap and same-platform:
//   - embeddings via Workers AI (env.AI binding),
//   - vector store via Vectorize (env.VECTORIZE binding).
// The `embeddings` table maps item -> vector_id + content_hash so we only
// re-embed when the underlying text actually changes.

import type { Env } from "./index";
import type { ItemRef } from "../shared/types";

const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5"; // example; pick during dev

export async function embed(env: Env, text: string): Promise<number[]> {
  // TODO: const r = await env.AI.run(EMBED_MODEL, { text }); return r.data[0];
  void EMBED_MODEL;
  void env;
  void text;
  return [];
}

/** Embed and upsert an item's vector when its text changes (called on writes). */
export async function indexItem(env: Env, ref: ItemRef, text: string): Promise<void> {
  // TODO: hash text; skip if unchanged vs embeddings table; else embed +
  // env.VECTORIZE.upsert([{ id, values, metadata:{type,id} }]); record mapping.
  void env;
  void ref;
  void text;
}

/** Semantic query -> ranked content refs. */
export async function semanticSearch(env: Env, query: string, _limit = 20): Promise<ItemRef[]> {
  // TODO: const v = await embed(env, query);
  //       const m = await env.VECTORIZE.query(v, { topK: limit });
  //       map matches back to ItemRef via metadata.
  void env;
  void query;
  return [];
}

// TODO(hybrid): optionally blend with a keyword/FTS pass for exact-term recall.
