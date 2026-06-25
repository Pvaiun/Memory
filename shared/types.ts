// Shared domain types — used by both the Worker (worker/) and the PWA (src/).

export type SpaceType = "project" | "person" | "reference" | "standalone";
export type Lifecycle = "active" | "pinned" | "archived";
export type BlockType =
  | "fact"
  | "task"
  | "checklist_item"
  | "note"
  | "contact"
  | "date";

export interface Block {
  id: string;
  space_id: string;
  type: BlockType;
  /** Parsed content. Shape depends on type (e.g. {key,value} for fact). */
  content: Record<string, unknown>;
  completed: 0 | 1 | null;
  due_date: number | null; // epoch ms
  event_date: number | null; // epoch ms
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface Space {
  id: string;
  title: string;
  type: SpaceType;
  lifecycle: Lifecycle;
  pin_weight: number;
  summary: string | null;
  unread: 0 | 1;
  created_at: number;
  updated_at: number;
  accessed_at: number;
}

export interface SpaceWithBlocks extends Space {
  blocks: Block[];
}

// ---- Relevance output ---------------------------------------------------

export type Tier = "hero" | "active" | "medium" | "dormant";

export interface Scored {
  spaceId: string;
  score: number;
  tier: Tier;
  /** Glow on when there is unread content. */
  charged: boolean;
  /** Human-readable reason the bubble sits where it does. */
  reason: string;
}

// ---- AI capture contract -------------------------------------

export interface CaptureProposal {
  target_space:
    | { existing_id: string }
    | { new: { title: string; type: SpaceType } };
  block: {
    type: BlockType;
    content: Record<string, unknown>;
    due_date: number | null;
    event_date: number | null;
  };
  confidence: number; // 0..1
}
