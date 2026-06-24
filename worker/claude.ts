// The Claude proxy (spec §6, §8). All Claude API access lives here, server-side,
// behind the CLAUDE_API_KEY Worker secret. Both functions degrade gracefully:
// if the key is unset or the call fails, the caller falls back to deterministic
// behaviour so the layout never blocks on the AI (spec §6, §9).

import type { Env } from "./index";
import type { CaptureProposal, SpaceWithBlocks } from "../shared/types";
import { heuristicSummary } from "../shared/summary";
import { localPropose } from "./local-capture";

const API = "https://api.anthropic.com/v1/messages";

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
    "due_date": <epoch ms | null>,
    "event_date": <epoch ms | null>
  },
  "confidence": 0.0-1.0
}
Use "fact" for stable info (allergies, preferences, codes). Use "task" for
things to do; set due_date only if a time is clearly implied. Use "date" with
event_date for events. Resolve relative dates against the provided "now".`;

export async function proposeCapture(
  env: Env,
  text: string,
  spaces: SpaceWithBlocks[],
): Promise<CaptureProposal> {
  if (!env.CLAUDE_API_KEY) return localPropose(text, spaces);

  const spaceList = spaces.map((s) => ({ id: s.id, title: s.title, type: s.type }));
  const user = JSON.stringify({ now: Date.now(), text, spaces: spaceList });
  try {
    const raw = await callClaude(env, CAPTURE_SYSTEM, user, 700);
    const parsed = extractJson(raw) as CaptureProposal | null;
    if (parsed && parsed.target_space && parsed.block) return parsed;
    return localPropose(text, spaces);
  } catch {
    return localPropose(text, spaces); // never block capture on the AI (spec §5)
  }
}

const SUMMARY_SYSTEM = `You maintain a living summary for a Space in a personal
second brain. Write the top ~3 things the user needs to know about this Space
RIGHT NOW, as one short glanceable line (no markdown, no preamble). Lead with
what is most urgent or time-sensitive. Be terse — this is read in a five-second
glance. If there is nothing meaningful, reply with an empty string.`;

export async function generateSummary(
  env: Env,
  space: SpaceWithBlocks,
): Promise<string> {
  if (!env.CLAUDE_API_KEY) return heuristicSummary(space, Date.now());
  const payload = JSON.stringify({
    now: Date.now(),
    title: space.title,
    type: space.type,
    blocks: space.blocks.map((b) => ({
      type: b.type,
      content: b.content,
      completed: b.completed,
      due_date: b.due_date,
      event_date: b.event_date,
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
