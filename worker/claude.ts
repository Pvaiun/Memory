// Claude proxy (SCAFFOLD). All Claude access lives here, server-side, behind
// the CLAUDE_API_KEY secret.
//
// PRESERVED from the previous app and reused as-is: the timezone-aware date
// helpers (localDate / upcomingDays / toEpoch / fmtDate). These solve relative-
// date resolution ("next Tuesday") correctly and the new design needs them.
//
// CHANGED: smart capture now proposes potentially SEVERAL items across
// DIFFERENT components (task, goal, knowledge, event), not one block.

import type { Env } from "./index";
import type { CaptureProposal, UserContext } from "../shared/types";

const API = "https://api.anthropic.com/v1/messages";

export async function callClaude(
  env: Env,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.CLAUDE_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL || "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`claude ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content?: { text?: string }[] };
  return data.content?.[0]?.text?.trim() || "";
}

// ---- Date helpers (PRESERVED — port verbatim, they are hard-won) ----------

export interface LocalDate {
  today: string; // "Wednesday, 24 June 2026"
  iso: string; // "2026-06-24"
  timezone: string;
  utc_offset: string; // "-04:00"
}

export function localDate(tz?: string): LocalDate {
  const zone = tz || "UTC";
  const now = new Date();
  let today: string, iso: string, utc_offset = "+00:00";
  try {
    today = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone, weekday: "long", year: "numeric", month: "long", day: "numeric",
    }).format(now);
    iso = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now);
    const off = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
      .formatToParts(now).find((p) => p.type === "timeZoneName")?.value;
    const m = off?.match(/GMT([+-]\d{2}):?(\d{2})/);
    if (m) utc_offset = `${m[1]}:${m[2]}`;
  } catch {
    today = now.toUTCString();
    iso = now.toISOString().slice(0, 10);
  }
  return { today, iso, timezone: zone, utc_offset };
}

/** Next N calendar days as "Weekday YYYY-MM-DD" so the model resolves weekday
 *  references by LOOKUP rather than (unreliable) arithmetic. */
export function upcomingDays(iso: string, n: number): string[] {
  const [y, mo, d] = iso.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const dt = new Date(Date.UTC(y, mo - 1, d + i));
    const wd = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long" }).format(dt);
    const label = i === 0 ? " (today)" : i === 1 ? " (tomorrow)" : "";
    out.push(`${wd} ${dt.toISOString().slice(0, 10)}${label}`);
  }
  return out;
}

/** Model's ISO date string (or legacy epoch) -> epoch ms. */
export function toEpoch(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : t;
}

/** epoch ms -> "2026-07-01 (Wednesday)" in the local zone. */
export function fmtDate(epoch: number | null | undefined, tz?: string): string | null {
  if (epoch == null) return null;
  const zone = tz || "UTC";
  const d = new Date(epoch);
  try {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(d);
    const wd = new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "long" }).format(d);
    return `${day} (${wd})`;
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

// ---- Smart capture (EXPANDED) --------------------------------------------

const CAPTURE_SYSTEM = `You triage a casual, often dictated thought into a
personal memory app for an ADHD user. Decide which component(s) the thought
belongs in and propose structured items. A single thought may produce SEVERAL
items across different components.

Components:
- task: something to do. May have a due_date, a priority, a category, recurrence.
- goal: an ongoing thing to be reminded to do (no deadline).
- knowledge: timeless info to remember, under a category.
- event: something happening at a time; set push_to_calendar=true only when it
  is important enough to belong on the real calendar.

Reply with ONLY JSON: { "items": [ { "type": ..., "data": { ... },
"push_to_calendar"?: bool } ], "confidence": 0..1, "note"?: "..." }.

Resolve dates by LOOKUP against the provided "calendar" list; return any date as
an ISO 8601 string including the given utc_offset. The server converts to epoch.`;

export async function proposeCapture(
  env: Env,
  text: string,
  context: UserContext,
  tz?: string,
): Promise<CaptureProposal> {
  // TODO(cost): the design flags AI-cost risk. Decide what context to send —
  // likely a compact summary (categories, existing goals) rather than the full
  // app, and consider a deterministic fast-path for obvious single-item dumps.
  if (!env.CLAUDE_API_KEY) return localPropose(text);

  const { today, iso, timezone, utc_offset } = localDate(tz);
  const user = JSON.stringify({
    today: `${today} (${iso})`,
    timezone,
    utc_offset,
    calendar: upcomingDays(iso, 14),
    existing_categories: deriveCategories(context),
    existing_goals: context.goals.map((g) => ({ id: g.id, title: g.title })),
    text,
  });
  try {
    const raw = await callClaude(env, CAPTURE_SYSTEM, user, 900);
    const parsed = extractJson(raw) as CaptureProposal | null;
    if (parsed?.items) {
      for (const it of parsed.items) {
        const d = it.data as Record<string, unknown>;
        if ("due_date" in d) d.due_date = toEpoch(d.due_date);
        if ("start_at" in d) d.start_at = toEpoch(d.start_at);
        if ("end_at" in d) d.end_at = toEpoch(d.end_at);
      }
      return parsed;
    }
    return localPropose(text);
  } catch {
    return localPropose(text); // never block capture on the AI
  }
}

/** Deterministic fallback when the AI is unavailable: file as a single note. */
function localPropose(text: string): CaptureProposal {
  // TODO: cheap heuristics (a date word -> event/task, "remember that" -> knowledge).
  return {
    items: [{ type: "knowledge", data: { body: text } }],
    confidence: 0.2,
    note: "AI unavailable — filed as a note.",
  };
}

function deriveCategories(ctx: UserContext): string[] {
  const s = new Set<string>();
  for (const t of ctx.tasks) if (t.category) s.add(t.category);
  for (const k of ctx.knowledge) if (k.category) s.add(k.category);
  return [...s];
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
