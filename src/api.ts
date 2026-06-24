import type {
  SpaceWithBlocks,
  Space,
  Block,
  CaptureProposal,
  SpaceType,
  Lifecycle,
} from "../shared/types";

// Optional single-user bearer token, mirrors the Worker's AUTH_TOKEN (spec §8).
const TOKEN = import.meta.env.VITE_AUTH_TOKEN as string | undefined;

// The device's IANA timezone, so the AI resolves relative dates ("next
// Wednesday") against the user's local date rather than the Worker's UTC.
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
  state: () => req<{ spaces: SpaceWithBlocks[] }>("/state"),
  archive: () => req<{ spaces: SpaceWithBlocks[] }>("/archive"),
  search: (q: string) =>
    req<{ spaces: SpaceWithBlocks[] }>(`/search?q=${encodeURIComponent(q)}`),

  createSpace: (body: { title: string; type?: SpaceType; lifecycle?: Lifecycle }) =>
    req<Space>("/spaces", { method: "POST", body: JSON.stringify(body) }),
  patchSpace: (id: string, body: Partial<Space>) =>
    req<Space>(`/spaces/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteSpace: (id: string) =>
    req<{ ok: true }>(`/spaces/${id}`, { method: "DELETE" }),

  addBlock: (spaceId: string, body: Partial<Block>) =>
    req<Block>(`/spaces/${spaceId}/blocks`, { method: "POST", body: JSON.stringify(body) }),
  patchBlock: (id: string, body: Partial<Block>) =>
    req<Block>(`/blocks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteBlock: (id: string) =>
    req<{ ok: true }>(`/blocks/${id}`, { method: "DELETE" }),

  capture: (text: string) =>
    req<{ proposal: CaptureProposal }>("/capture", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  resummarize: () => req<{ ok: true; count: number }>("/resummarize", { method: "POST" }),
};
