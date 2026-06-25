// The relevance engine.
//
// Kept DELIBERATELY separate from layout: this produces a relevance score per
// Space from a small set of legible, DETERMINISTIC rules. The AI never drives
// position. Layout is then a pure function of (spaces, scores).
//
// The engine is dispatched BY BLOCK TYPE because tasks and permanent facts have
// opposite time-behaviour: tasks escalate with age, facts never do.
//
// Computed on read when the board mounts and held stable for the session
// no cron, no live recompute, exact to the moment of opening.

import type { Block, SpaceWithBlocks, Scored, Tier } from "./types";
import { relativeDate } from "./dates";

const DAY = 86_400_000; // ms

// Tunable constants. The score is on a ~0..100 scale.
export const CONST = {
  // Manual pin/boost — a primary input, strong enough to lift a
  // Space into the Active/Hero range on its own.
  pinWeight: 55,

  // Recency-of-capture boost: decays over days regardless of reading.
  recencyMax: 35,
  recencyTauDays: 2.5, // exponential decay constant (~halves every ~1.7 days)

  // Date/event proximity — the strongest signal.
  datePeak: 70,
  dateRiseScaleDays: 4, // hyperbolic rise: half-peak this many days out
  dateDecayTauDays: 2, // decay after the day has passed

  // Tasks.
  taskBase: 22, // an open task is never silent
  taskAgeRatePerDay: 4, // grows with age-since-created (no due date)
  taskAgeCap: 50,
  overduePeak: 85, // a due task that is now overdue keeps climbing
  overdueRatePerDay: 6,
  overdueCap: 95,

  // Permanent info — low FLAT baseline, must NOT escalate with age.
  factBaseline: 6,

  // Tier thresholds (mapped from final score). Hero selection is additionally
  // capped to the top 1–2 spaces in scoreSpaces().
  tierActive: 45,
  tierMedium: 18,
  // below tierMedium => dormant

  // Hero must clear this AND be in the top 2 by score.
  heroFloor: 60,
} as const;

/** Hyperbolic rise as the event nears, exponential decay after. */
function dateUrgency(eventDate: number, now: number): number {
  const days = (eventDate - now) / DAY;
  if (days >= 0) {
    // Far future -> small; on the day -> peak.
    return CONST.datePeak / (1 + days / CONST.dateRiseScaleDays);
  }
  // After the event: decay and (eventually) prompt archiving.
  return CONST.datePeak * Math.exp(days / CONST.dateDecayTauDays);
}

/** Urgency of a single block, dispatched by type. */
export function blockUrgency(block: Block, now: number): number {
  switch (block.type) {
    case "date":
      return block.event_date ? dateUrgency(block.event_date, now) : 0;

    case "task":
    case "checklist_item": {
      if (block.completed) return 0; // completed tasks disappear
      if (block.due_date != null) {
        const days = (block.due_date - now) / DAY;
        if (days < 0) {
          // Overdue: escalate (do NOT decay).
          const overdueDays = -days;
          return Math.min(
            CONST.overdueCap,
            CONST.overduePeak + overdueDays * CONST.overdueRatePerDay,
          );
        }
        // Upcoming due date follows the date curve.
        return dateUrgency(block.due_date, now);
      }
      // No due date: escalate with age-since-created.
      const ageDays = (now - block.created_at) / DAY;
      return Math.min(
        CONST.taskAgeCap,
        CONST.taskBase + ageDays * CONST.taskAgeRatePerDay,
      );
    }

    case "fact":
    case "note":
    case "contact":
    default:
      // Permanent info: low flat baseline; never louder with age.
      return CONST.factBaseline;
  }
}

function recencyBoost(space: SpaceWithBlocks, now: number): number {
  // Time since the most recent capture in the Space.
  let newest = space.created_at;
  for (const b of space.blocks) newest = Math.max(newest, b.created_at);
  const ageDays = (now - newest) / DAY;
  return CONST.recencyMax * Math.exp(-ageDays / CONST.recencyTauDays);
}

function tierFor(score: number): Exclude<Tier, "hero"> {
  if (score >= CONST.tierActive) return "active";
  if (score >= CONST.tierMedium) return "medium";
  return "dormant";
}

export interface ScoreOptions {
  now: number;
}

/**
 * Score every active/pinned Space and assign tiers. Archived Spaces are
 * excluded from the board. Returns descending-by-score (the board is
 * a single relevance-ordered flow).
 */
export function scoreSpaces(
  spaces: SpaceWithBlocks[],
  opts: ScoreOptions,
): Scored[] {
  const now = opts.now;

  const scored = spaces
    .filter((s) => s.lifecycle !== "archived")
    .map((s) => {
      // A Space's prominence tracks its HOTTEST block.
      let hottest = 0;
      let hotReason = "";
      for (const b of s.blocks) {
        const u = blockUrgency(b, now);
        if (u > hottest) {
          hottest = u;
          hotReason = reasonForBlock(b, now);
        }
      }

      const pin = s.lifecycle === "pinned" || s.pin_weight > 0
        ? CONST.pinWeight * Math.max(s.pin_weight, s.lifecycle === "pinned" ? 1 : 0)
        : 0;
      const recency = recencyBoost(s, now);
      const score = pin + recency + hottest;

      const reasons: string[] = [];
      if (pin > 0) reasons.push("pinned");
      if (hotReason) reasons.push(hotReason);
      if (recency > 8) reasons.push("recently updated");
      if (reasons.length === 0) reasons.push("dormant");

      return {
        spaceId: s.id,
        score,
        tier: tierFor(score) as Tier,
        charged: s.unread === 1,
        reason: reasons.join(" · "),
      } satisfies Scored;
    })
    .sort((a, b) => b.score - a.score);

  // Hero selection: top 1–2 that clear the floor. Promotion is deterministic, never AI-driven.
  for (let i = 0; i < scored.length && i < 2; i++) {
    if (scored[i].score >= CONST.heroFloor) scored[i].tier = "hero";
  }

  return scored;
}

function reasonForBlock(b: Block, now: number): string {
  if (b.type === "date" && b.event_date) {
    return relativeDay(b.event_date, now, "event");
  }
  if ((b.type === "task" || b.type === "checklist_item") && !b.completed) {
    if (b.due_date != null) return relativeDay(b.due_date, now, "due");
    return "open task";
  }
  return "";
}

// Shared, live wording (shared/dates.ts) with a leading label, e.g. "due
// tomorrow", "event in 3 days". Computed fresh on every render so it never
// goes stale.
function relativeDay(when: number, now: number, label: string): string {
  return `${label} ${relativeDate(when, now)}`;
}
