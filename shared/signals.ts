// Deterministic signals (SCAFFOLD).
//
// Ported from the previous app's relevance engine. In the new design the AI
// "Brain" authors and prioritizes bubbles; these cheap, deterministic signals
// are the NON-AI supplement the design calls for — used to:
//   - feed the Brain useful per-item urgency/recency hints, and
//   - update bubble priority between Brain runs WITHOUT an AI call (e.g.
//     deprioritize a bubble as its items complete, raise a "due tonight" task).
//
// The curve shapes (date proximity, task escalation) carry over directly; the
// constants are a starting point to tune.

import type { Task, Goal, EventItem } from "./types";

const DAY = 86_400_000;

export const SIGNAL = {
  datePeak: 70,
  dateRiseScaleDays: 4, // hyperbolic rise: half-peak this many days out
  dateDecayTauDays: 2, // decay after the day passes
  taskBase: 22,
  taskAgeRatePerDay: 4, // grows with age when no due date
  taskAgeCap: 50,
  overduePeak: 85,
  overdueRatePerDay: 6,
  overdueCap: 95,
  goalNeglectRatePerDay: 2, // a goal gets louder the longer since last acted
  goalNeglectCap: 60,
  knowledgeBaseline: 6, // timeless info: low flat baseline
} as const;

/** Hyperbolic rise as a date nears, exponential decay after. */
export function dateUrgency(when: number, now: number): number {
  const days = (when - now) / DAY;
  if (days >= 0) return SIGNAL.datePeak / (1 + days / SIGNAL.dateRiseScaleDays);
  return SIGNAL.datePeak * Math.exp(days / SIGNAL.dateDecayTauDays);
}

export function taskUrgency(t: Task, now: number): number {
  if (t.completed) return 0;
  if (t.due_date != null) {
    const days = (t.due_date - now) / DAY;
    if (days < 0) {
      return Math.min(SIGNAL.overdueCap, SIGNAL.overduePeak + -days * SIGNAL.overdueRatePerDay);
    }
    return dateUrgency(t.due_date, now);
  }
  const ageDays = (now - t.created_at) / DAY;
  return Math.min(SIGNAL.taskAgeCap, SIGNAL.taskBase + ageDays * SIGNAL.taskAgeRatePerDay);
}

export function goalUrgency(g: Goal, now: number): number {
  if (!g.active) return 0;
  const since = g.last_acted_at ?? g.created_at;
  const days = (now - since) / DAY;
  // TODO: weight by g.priority and typical cadence (act_count over lifetime).
  return Math.min(SIGNAL.goalNeglectCap, days * SIGNAL.goalNeglectRatePerDay);
}

export function eventUrgency(e: EventItem, now: number): number {
  return dateUrgency(e.start_at, now);
}
