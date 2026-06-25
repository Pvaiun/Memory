// The Brain (SCAFFOLD) — the most important and most design-open component.
//
// Job: build/sort/merge/destroy/prioritize the BUBBLES that the board shows,
// from the user's full context. Bubbles are a projection over content, so the
// Brain is free to lump items from different components into one actionable
// bubble (e.g. "After Work: pick up milk, then hang out with Kyle") and to put
// the same item in more than one bubble.
//
// Cadence (per the design): the app lives on a timeline of DAYS, so a full AI
// rebuild ~once a day (early morning) is the starting assumption, with cheap
// DETERMINISTIC updates in between (item added/edited/completed) to avoid an AI
// call on every interaction. The split below reflects that.

import type { Env } from "./index";
import type { BrainResult, BubbleWithItems, UserContext } from "../shared/types";
import { callClaude, localDate, fmtDate } from "./claude";
import { taskUrgency, goalUrgency, eventUrgency } from "../shared/signals";

// ---- Full AI rebuild (expensive; ~daily) ---------------------------------

const BRAIN_SYSTEM = `You build a glanceable board of "bubbles" for an ADHD user.
Each bubble lumps related items into one actionable, at-a-glance card with a
title and a short description, and references the content items it surfaces.
Prioritize what is temporally relevant, important, neglected, or routine.
You may create, merge, and drop bubbles freely, but NEVER move a pinned bubble's
items out from under the user. Reply with ONLY JSON matching the BubbleWithItems
shape (title, description, priority, display, items:[{type,id}]).`;

export async function rebuildBubbles(
  env: Env,
  context: UserContext,
  tz?: string,
): Promise<BrainResult> {
  if (!env.CLAUDE_API_KEY) return { bubbles: deterministicBubbles(context) };

  const { today, iso } = localDate(tz);
  const payload = JSON.stringify({
    today: `${today} (${iso})`,
    profile: context.profile,
    // Hand the model deterministic urgency hints so it doesn't have to derive
    // them, and pre-formatted local dates so it never reads raw epoch ms.
    tasks: context.tasks.map((t) => ({
      id: t.id, title: t.title, category: t.category, due: fmtDate(t.due_date, tz),
      completed: t.completed, urgency: Math.round(taskUrgency(t, context.now)),
    })),
    goals: context.goals.filter((g) => g.active).map((g) => ({
      id: g.id, title: g.title, last_acted: fmtDate(g.last_acted_at, tz),
      urgency: Math.round(goalUrgency(g, context.now)),
    })),
    events: context.events.map((e) => ({
      id: e.id, title: e.title, start: fmtDate(e.start_at, tz),
      urgency: Math.round(eventUrgency(e, context.now)),
    })),
    knowledge: context.knowledge.map((k) => ({ id: k.id, title: k.title, category: k.category })),
  });

  try {
    const raw = await callClaude(env, BRAIN_SYSTEM, payload, 2000);
    const parsed = extractJson(raw) as { bubbles?: BubbleWithItems[] } | null;
    if (parsed?.bubbles) return { bubbles: parsed.bubbles };
  } catch {
    /* fall through to deterministic */
  }
  return { bubbles: deterministicBubbles(context) };
}

// ---- Deterministic interim updates (cheap; no AI) ------------------------
//
// Run on every content change so the board stays live between AI rebuilds.

export interface InterimEffect {
  // TODO: shape this — e.g. bubble id -> new priority, or "spawn New Today".
  note: string;
}

export function applyInterimUpdates(_context: UserContext): InterimEffect[] {
  // Examples from the design to implement:
  //  - lower a bubble's priority as its items get completed;
  //  - spawn/refresh a "New Today" bubble when same-day items are added;
  //  - raise a "due tonight" task bubble as the day ends.
  // These use shared/signals.ts; none of them call the AI.
  return [];
}

/** No-AI fallback board: one bubble per high-signal item, urgency-ordered. */
export function deterministicBubbles(context: UserContext): BubbleWithItems[] {
  // TODO: a reasonable rules-only board so the app is useful without the AI.
  void context;
  return [];
}

// ---- User profile (the Brain's persistent memory) ------------------------

const PROFILE_SYSTEM = `Maintain a short recap of this user's state, routines,
and habits, so future runs aren't from scratch. Update it from recent activity;
keep it brief. Reply with the updated recap text only.`;

export async function updateProfile(
  env: Env,
  context: UserContext,
): Promise<string | null> {
  // TODO(cost): fold into the daily rebuild rather than a separate call, or run
  // weekly. Decide cadence with the user.
  if (!env.CLAUDE_API_KEY) return context.profile;
  try {
    return await callClaude(env, PROFILE_SYSTEM, JSON.stringify({ prev: context.profile }), 400);
  } catch {
    return context.profile;
  }
}

function extractJson(s: string): unknown {
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a === -1 || b === -1) return null;
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch {
    return null;
  }
}
