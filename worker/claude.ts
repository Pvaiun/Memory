// The Claude proxy. All Claude API access lives here, server-side,
// behind the CLAUDE_API_KEY Worker secret. Both functions degrade gracefully:
// if the key is unset or the call fails, the caller falls back to deterministic
// behaviour so the layout never blocks on the AI.

import type { Env } from "./index";
import type { CaptureProposal, SpaceWithBlocks } from "../shared/types";
import { heuristicSummary } from "../shared/summary";
import { localPropose } from "./local-capture";

const API = "https://api.anthropic.com/v1/messages";

// The AI is bad at reading raw epoch-ms as a date (and epoch is UTC, while the
// user thinks in local time). So we hand it an unambiguous, human-readable
// LOCAL date plus the timezone and UTC offset, and have it return ISO strings
// that include that offset — which the server then converts to epoch with a
// plain Date.parse. The timezone arrives from the client via the x-tz header.
interface LocalDate {
  today: string; // e.g. "Wednesday, 24 June 2026"
  iso: string; // e.g. "2026-06-24"
  timezone: string; // IANA, e.g. "America/New_York"
  utc_offset: string; // e.g. "-04:00"
}

function localDate(tz?: string): LocalDate {
  const zone = tz || "UTC";
  const now = new Date();
  let today: string, iso: string, utc_offset = "+00:00";
  try {
    today = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(now);
    iso = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now); // en-CA => YYYY-MM-DD
    const offPart = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "longOffset",
    })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value;
    const m = offPart?.match(/GMT([+-]\d{2}):?(\d{2})/);
    if (m) utc_offset = `${m[1]}:${m[2]}`;
  } catch {
    // Unknown timezone -> fall back to UTC.
    today = now.toUTCString();
    iso = now.toISOString().slice(0, 10);
    utc_offset = "+00:00";
  }
  return { today, iso, timezone: zone, utc_offset };
}

// The next N calendar days as "Weekday YYYY-MM-DD", so the AI resolves weekday
// names ("Thursday") and "next <weekday>" by LOOKUP instead of arithmetic —
// which it gets wrong (it stored "Thursday" a day late). Enumerated on the
// civil date with UTC math, so it is immune to DST.
function upcomingDays(iso: string, n: number): string[] {
  const [y, mo, d] = iso.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const dt = new Date(Date.UTC(y, mo - 1, d + i));
    const wd = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long" }).format(dt);
    const ds = dt.toISOString().slice(0, 10);
    const label = i === 0 ? " (today)" : i === 1 ? " (tomorrow)" : "";
    out.push(`${wd} ${ds}${label}`);
  }
  return out;
}

// Convert the model's ISO date string (or a legacy epoch number) to epoch ms.
function toEpoch(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : t;
}

// Format a stored epoch-ms as a human-readable LOCAL date, e.g.
// "2026-07-01 (Wednesday)". The summary AI must never see raw epoch ms — it
// misreads the integer and invents the wrong calendar date.
function fmtDate(epoch: number | null | undefined, tz?: string): string | null {
  if (epoch == null) return null;
  const zone = tz || "UTC";
  const d = new Date(epoch);
  try {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const wd = new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "long" }).format(d);
    return `${day} (${wd})`;
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

async function callClaude(
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

const CAPTURE_SYSTEM = `You file raw thoughts into a personal "second brain".
Given a raw text dump and the user's existing Spaces (contexts), decide where it
belongs and how to structure it. A Space is a context (a project, a person, a
reference topic), NOT a single task. Prefer filing into an existing Space when
the dump clearly relates to one; otherwise propose a new Space. A standalone
task or note that fits no larger context gets type "standalone".

Reply with ONLY a JSON object, no prose, matching exactly:
{
  "target_space": { "existing_id": "<id>" } | { "new": { "title": "...", "type": "project|person|reference|standalone" } },
  "block": {
    "type": "fact|task|checklist_item|note|contact|date",
    "content": { ... },        // e.g. {"key","value"} for fact; {"text"} for task/note; {"name","phone"|"email"} for contact; {"title"} for date
    "due_date": <ISO 8601 string with the given utc_offset, or null>,
    "event_date": <ISO 8601 string with the given utc_offset, or null>
  },
  "confidence": 0.0-1.0
}
Use "fact" for stable info (allergies, preferences, codes). Use "task" for
things to do; set due_date only if a time is clearly implied. Use "date" with
event_date for events.

The user message includes "today" (current local date + weekday), "timezone",
"utc_offset", and "calendar" — an array of the next 14 days as
"Weekday YYYY-MM-DD". To resolve ANY date reference — a weekday name
("Thursday", "this Friday", "next Monday"), "today"/"tomorrow", or "in N days" —
look it up in "calendar" and copy that exact date. Do NOT compute weekdays
yourself; you miscount them. For dates beyond 14 days, count forward from
today. Return due_date and event_date as full ISO 8601 timestamps that INCLUDE
the given utc_offset, e.g. "2026-07-01T09:00:00-04:00". If only a day is known,
use 09:00 local time. Use null when no date is implied.`;

export async function proposeCapture(
  env: Env,
  text: string,
  spaces: SpaceWithBlocks[],
  tz?: string,
): Promise<CaptureProposal> {
  if (!env.CLAUDE_API_KEY) return localPropose(text, spaces);

  const spaceList = spaces.map((s) => ({ id: s.id, title: s.title, type: s.type }));
  const { today, iso, timezone, utc_offset } = localDate(tz);
  const user = JSON.stringify({
    today: `${today} (${iso})`,
    timezone,
    utc_offset,
    calendar: upcomingDays(iso, 14),
    text,
    spaces: spaceList,
  });
  try {
    const raw = await callClaude(env, CAPTURE_SYSTEM, user, 700);
    const parsed = extractJson(raw) as CaptureProposal | null;
    if (parsed && parsed.target_space && parsed.block) {
      // The model returns ISO date strings; normalize to epoch ms for storage.
      parsed.block.due_date = toEpoch(parsed.block.due_date);
      parsed.block.event_date = toEpoch(parsed.block.event_date);
      return parsed;
    }
    return localPropose(text, spaces);
  } catch {
    return localPropose(text, spaces); // never block capture on the AI
  }
}

const SUMMARY_SYSTEM = `You maintain a living summary for a Space in a personal
second brain. Write the top ~3 things the user needs to know about this Space
RIGHT NOW, as one short glanceable line (no markdown, no preamble). Lead with
what is most urgent or time-sensitive. Be terse — this is read in a five-second
glance. If there is nothing meaningful, reply with an empty string.
The payload includes "today" (current local date) and "timezone" for judging
what is urgent. Each block has a short "ref" plus its due_date/event_date as a
local date string like "2026-07-01 (Wednesday)".

CRITICAL — dates: whenever you mention a block's date, output it ONLY as a token
[[ref]] using that block's ref — e.g. "Call doctor [[a1b2c3d4]]". NEVER write a
month name or a literal date, and NEVER write relative words ("today",
"tomorrow", "yesterday", "overdue", "in 3 days", "due now"). The app resolves
each [[ref]] to that block's current date and renders live relative wording, so
it stays correct even if the date is later edited. Example output:
"Call doctor [[a1b2c3d4]] · ask work about Claude sub [[9f8e7d6c]]".`;

export async function generateSummary(
  env: Env,
  space: SpaceWithBlocks,
  tz?: string,
): Promise<string> {
  if (!env.CLAUDE_API_KEY) return heuristicSummary(space, Date.now());
  const { today, iso, timezone } = localDate(tz);
  const payload = JSON.stringify({
    today: `${today} (${iso})`,
    timezone,
    title: space.title,
    type: space.type,
    blocks: space.blocks.map((b) => ({
      // Short stable handle the model copies into [[ref]] date tokens; the
      // client resolves it back to this block to render the live date.
      ref: b.id.slice(0, 8),
      type: b.type,
      content: b.content,
      completed: b.completed,
      // Pre-formatted LOCAL dates so the model never converts epoch ms itself.
      due_date: fmtDate(b.due_date, tz),
      event_date: fmtDate(b.event_date, tz),
    })),
  });
  const out = await callClaude(env, SUMMARY_SYSTEM, payload, 200);
  return out.replace(/^["']|["']$/g, "").slice(0, 400);
}

function extractJson(s: string): unknown {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}
