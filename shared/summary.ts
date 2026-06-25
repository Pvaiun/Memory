// Deterministic heuristic living summary.
//
// Phase-1 fallback: the most-urgent / most-recent N items, so the board layout
// can be validated WITHOUT the AI dependency. The Worker swaps in an
// AI-generated summary when CLAUDE_API_KEY is configured; this is the floor.

import type { Block, SpaceWithBlocks } from "./types";
import { blockUrgency } from "./relevance";

const TOP_N = 3;

export function blockLabel(b: Block): string {
  const c = b.content || {};
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = c[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  switch (b.type) {
    case "fact": {
      const key = pick("key", "name");
      const value = pick("value", "text");
      return key && value ? `${key}: ${value}` : key || value || "fact";
    }
    case "task":
    case "checklist_item": {
      const text = pick("text", "title", "value") || "task";
      return (b.completed ? "✓ " : "") + text;
    }
    case "contact": {
      const name = pick("name", "key");
      const detail = pick("phone", "email", "value");
      return detail ? `${name} — ${detail}` : name || "contact";
    }
    case "date": {
      return pick("title", "text", "label") || "event";
    }
    case "note":
    default:
      return pick("text", "value", "title") || "note";
  }
}

/** Top ~3 things to know right now, urgency-first. */
export function heuristicSummary(space: SpaceWithBlocks, now: number): string {
  const open = space.blocks.filter(
    (b) => !((b.type === "task" || b.type === "checklist_item") && b.completed),
  );
  if (open.length === 0) return "";

  const ranked = [...open].sort((a, b) => {
    const ua = blockUrgency(a, now);
    const ub = blockUrgency(b, now);
    if (ub !== ua) return ub - ua;
    return b.created_at - a.created_at; // tie-break: newest first
  });

  return ranked
    .slice(0, TOP_N)
    .map((b) => blockLabel(b))
    .filter(Boolean)
    .join(" • ");
}
