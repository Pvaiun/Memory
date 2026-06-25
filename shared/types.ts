// Shared domain types (SCAFFOLD) — imported by both worker/ and src/.
//
// Two layers:
//   1. CONTENT — normalized components the user's data lives in.
//   2. BUBBLES — the projection the Brain builds over that content for the board.

// ---- Content components --------------------------------------------------

export type ItemType = "task" | "goal" | "knowledge" | "event";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  due_date: number | null; // epoch ms; null = untimed
  priority: number | null; // null when driven by deadline
  recurrence: string | null; // null = one-shot
  completed: 0 | 1;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  priority: number | null;
  last_acted_at: number | null;
  act_count: number;
  active: 0 | 1;
  created_at: number;
  updated_at: number;
}

export interface Knowledge {
  id: string;
  title: string | null;
  body: string;
  category: string | null;
  created_at: number;
  updated_at: number;
}

export interface EventItem {
  id: string;
  title: string;
  description: string | null;
  start_at: number; // epoch ms
  end_at: number | null;
  all_day: 0 | 1;
  recurrence: string | null;
  source: "app" | "google";
  google_event_id: string | null;
  pushed: 0 | 1;
  created_at: number;
  updated_at: number;
}

/** A reference to a content item, used by bubbles and capture. */
export interface ItemRef {
  type: ItemType;
  id: string;
}

/** Everything the Brain reasons over in one run. */
export interface UserContext {
  tasks: Task[];
  goals: Goal[];
  knowledge: Knowledge[];
  events: EventItem[];
  profile: string | null; // the persisted recap
  now: number;
}

// ---- Bubbles (the projection / board) ------------------------------------

export interface BubbleDisplay {
  size?: "hero" | "large" | "medium" | "small";
  shape?: string;
  color?: string;
  glow?: boolean;
}

export interface Bubble {
  id: string;
  title: string;
  description: string | null; // AI-generated, glanceable
  priority: number;
  display: BubbleDisplay | null;
  source: "brain" | "rule" | "user";
  pinned: 0 | 1;
  dismissed: 0 | 1;
  valid_date: string | null;
  created_at: number;
  updated_at: number;
}

export interface BubbleWithItems extends Bubble {
  items: ItemRef[];
}

// ---- Smart capture contract ----------------------------------------------
//
// Capture turns one casual/dictated dump into a proposal that may create
// SEVERAL items across DIFFERENT components (e.g. a task + a calendar event +
// a knowledge note). The user approves/edits/rejects before anything commits.

export interface ProposedItem {
  type: ItemType;
  // Partial shape of the target component; the user can edit before commit.
  data: Partial<Task> | Partial<Goal> | Partial<Knowledge> | Partial<EventItem>;
  push_to_calendar?: boolean; // only meaningful for events
}

export interface CaptureProposal {
  items: ProposedItem[];
  confidence: number; // 0..1
  note?: string; // optional explanation the UI can show
}

// ---- Brain output --------------------------------------------------------

export interface BrainResult {
  bubbles: BubbleWithItems[];
  profile?: string; // updated recap, if the Brain rewrote it
}
