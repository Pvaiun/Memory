// Typed fetch client (SCAFFOLD). Adds auth + timezone headers; calls the new
// component/bubble/capture/search endpoints. Most return stubs for now.

import type {
  BubbleWithItems,
  CaptureProposal,
  ItemRef,
  Task,
  Goal,
  Knowledge,
  EventItem,
} from "../shared/types";

const TOKEN = import.meta.env.VITE_AUTH_TOKEN as string | undefined;
const TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
})();

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  if (TZ) headers["x-tz"] = TZ;
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || res.statusText);
  return res.json() as Promise<T>;
}

export const api = {
  // Board
  bubbles: () => req<{ bubbles: BubbleWithItems[] }>("/bubbles"),
  rebuildBubbles: () => req<{ ok: true; count: number }>("/bubbles/rebuild", { method: "POST" }),
  patchBubble: (id: string, body: Partial<BubbleWithItems>) =>
    req(`/bubbles/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  // Capture
  capture: (text: string) =>
    req<{ proposal: CaptureProposal }>("/capture", { method: "POST", body: JSON.stringify({ text }) }),
  commitCapture: (proposal: CaptureProposal) =>
    req("/capture/commit", { method: "POST", body: JSON.stringify({ proposal }) }),

  // Content components (secondary interfaces)
  tasks: () => req<{ items: Task[] }>("/tasks"),
  goals: () => req<{ items: Goal[] }>("/goals"),
  knowledge: () => req<{ items: Knowledge[] }>("/knowledge"),
  events: () => req<{ items: EventItem[] }>("/events"),
  actGoal: (id: string) => req(`/goals/${id}/act`, { method: "POST" }),

  // Search + calendar
  search: (q: string) => req<{ results: ItemRef[] }>(`/search?q=${encodeURIComponent(q)}`),
  syncCalendar: () => req("/calendar/sync", { method: "POST" }),
};
