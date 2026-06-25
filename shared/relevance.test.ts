import { describe, it, expect } from "vitest";
import { scoreSpaces, blockUrgency } from "./relevance";
import type { Block, SpaceWithBlocks } from "./types";

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

function block(p: Partial<Block>): Block {
  return {
    id: "b",
    space_id: "s",
    type: "note",
    content: {},
    completed: null,
    due_date: null,
    event_date: null,
    sort_order: 0,
    created_at: NOW,
    updated_at: NOW,
    ...p,
  };
}

function space(p: Partial<SpaceWithBlocks>): SpaceWithBlocks {
  return {
    id: "s",
    title: "S",
    type: "standalone",
    lifecycle: "active",
    pin_weight: 0,
    summary: null,
    unread: 0,
    created_at: NOW,
    updated_at: NOW,
    accessed_at: NOW,
    blocks: [],
    ...p,
  };
}

describe("the task / permanent split", () => {
  it("an undated task escalates with age", () => {
    const fresh = blockUrgency(block({ type: "task", created_at: NOW }), NOW);
    const old = blockUrgency(
      block({ type: "task", created_at: NOW - 7 * DAY }),
      NOW,
    );
    expect(old).toBeGreaterThan(fresh);
  });

  it("a fact NEVER gets louder with age", () => {
    const fresh = blockUrgency(block({ type: "fact", created_at: NOW }), NOW);
    const old = blockUrgency(
      block({ type: "fact", created_at: NOW - 90 * DAY }),
      NOW,
    );
    expect(old).toBe(fresh);
  });

  it("a completed task goes silent", () => {
    expect(
      blockUrgency(block({ type: "task", completed: 1, created_at: NOW - 30 * DAY }), NOW),
    ).toBe(0);
  });
});

describe("date proximity", () => {
  it("rises as the event nears and peaks on the day", () => {
    const farOff = blockUrgency(block({ type: "date", event_date: NOW + 30 * DAY }), NOW);
    const soon = blockUrgency(block({ type: "date", event_date: NOW + 2 * DAY }), NOW);
    const today = blockUrgency(block({ type: "date", event_date: NOW }), NOW);
    expect(today).toBeGreaterThan(soon);
    expect(soon).toBeGreaterThan(farOff);
  });

  it("decays after the day passes", () => {
    const today = blockUrgency(block({ type: "date", event_date: NOW }), NOW);
    const after = blockUrgency(block({ type: "date", event_date: NOW - 5 * DAY }), NOW);
    expect(after).toBeLessThan(today);
  });
});

describe("overdue tasks keep climbing", () => {
  it("an overdue task outranks one merely due soon", () => {
    const dueSoon = blockUrgency(block({ type: "task", due_date: NOW + 1 * DAY }), NOW);
    const overdue = blockUrgency(block({ type: "task", due_date: NOW - 5 * DAY }), NOW);
    expect(overdue).toBeGreaterThan(dueSoon);
  });
});

describe("scoreSpaces", () => {
  it("excludes archived spaces from the board", () => {
    const out = scoreSpaces([space({ id: "a", lifecycle: "archived" })], { now: NOW });
    expect(out).toHaveLength(0);
  });

  it("orders by descending score and assigns a hero", () => {
    const urgent = space({
      id: "move",
      lifecycle: "pinned",
      pin_weight: 1,
      blocks: [block({ type: "date", event_date: NOW + 1 * DAY })],
    });
    const dormant = space({
      id: "sarah",
      created_at: NOW - 60 * DAY,
      blocks: [block({ type: "fact", created_at: NOW - 60 * DAY })],
    });
    const out = scoreSpaces([dormant, urgent], { now: NOW });
    expect(out[0].spaceId).toBe("move");
    expect(out[0].tier).toBe("hero");
    expect(out[out.length - 1].spaceId).toBe("sarah");
    expect(out[out.length - 1].tier).toBe("dormant");
  });

  it("carries the unread glow as charged", () => {
    const out = scoreSpaces([space({ unread: 1, blocks: [block({ type: "fact" })] })], {
      now: NOW,
    });
    expect(out[0].charged).toBe(true);
  });

  it("an escalating task inside a space lifts the whole bubble", () => {
    const withOldTask = space({
      id: "proj",
      blocks: [block({ type: "task", created_at: NOW - 10 * DAY })],
    });
    const justFacts = space({
      id: "ref",
      blocks: [block({ type: "fact", created_at: NOW - 10 * DAY })],
    });
    const out = scoreSpaces([justFacts, withOldTask], { now: NOW });
    expect(out[0].spaceId).toBe("proj");
  });
});
