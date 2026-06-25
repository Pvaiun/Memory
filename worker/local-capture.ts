// Deterministic capture fallback: a good-enough auto-file when
// CLAUDE_API_KEY is unset or the AI call fails. Never blocks capture; the user
// still gets a one-tap confirm/redirect on the client. Confidence is kept
// modest so the client presents it tentatively.

import type { CaptureProposal, BlockType, SpaceWithBlocks } from "../shared/types";

const TASK_RE = /\b(remind me|remember to|don'?t forget|need to|todo|to-do|task|book|buy|call|email|pay|schedule|fix|send|finish)\b/i;
const FACT_RE = /\b(is|are|=|->|allergic|prefers?|likes?|dislikes?|password|code|pin|wifi|birthday)\b/i;
const CONTACT_RE = /(\+?\d[\d\s().-]{6,}\d)|([\w.+-]+@[\w-]+\.[\w.-]+)/;

export function localPropose(text: string, spaces: SpaceWithBlocks[]): CaptureProposal {
  const t = text.trim();
  let type: BlockType = "note";
  let content: Record<string, unknown> = { text: t };

  if (CONTACT_RE.test(t)) {
    type = "contact";
    const phone = t.match(/\+?\d[\d\s().-]{6,}\d/)?.[0];
    const email = t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
    content = { name: stripContact(t), phone: phone || null, email: email || null };
  } else if (TASK_RE.test(t)) {
    type = "task";
    content = { text: t.replace(TASK_RE, "").replace(/^\s*[:,-]?\s*/, "").trim() || t };
  } else if (FACT_RE.test(t) && t.length < 120) {
    type = "fact";
    const split = t.split(/\s+is\s+|\s*[:=]\s*|\s*->\s*/);
    if (split.length >= 2) content = { key: split[0].trim(), value: split.slice(1).join(" ").trim() };
    else content = { value: t };
  }

  // Try to file into an existing Space whose title appears in the text.
  const match = spaces.find(
    (s) => s.title.length > 2 && t.toLowerCase().includes(s.title.toLowerCase()),
  );

  const proposal: CaptureProposal = {
    target_space: match
      ? { existing_id: match.id }
      : { new: { title: titleFrom(t, type), type: type === "fact" || type === "contact" ? "reference" : "standalone" } },
    block: { type, content, due_date: null, event_date: null },
    confidence: match ? 0.55 : 0.4, // modest: client presents tentatively
  };
  return proposal;
}

function titleFrom(t: string, type: BlockType): string {
  const words = t.split(/\s+/).slice(0, 6).join(" ");
  if (type === "task") return words.replace(/^(remind me to|remember to)\s*/i, "");
  return words.length > 40 ? words.slice(0, 40) + "…" : words;
}

function stripContact(t: string): string {
  return t
    .replace(/\+?\d[\d\s().-]{6,}\d/, "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/, "")
    .replace(/\b(call|email|text|contact|number|phone)\b/gi, "")
    .replace(/[:,-]/g, " ")
    .trim() || "Contact";
}
