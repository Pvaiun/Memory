import { describe, it, expect } from "vitest";
import { relativeDate, applyDateTokens, civilDayDiff } from "./dates";

// Anchor "now" at a fixed local wall-clock time mid-morning so civil-day math
// is unambiguous. Using local Date construction matches the client runtime.
const at = (y: number, m: number, d: number, h = 10) =>
  new Date(y, m - 1, d, h, 0, 0).getTime();

describe("civilDayDiff", () => {
  it("counts calendar days, not rolling 24h windows", () => {
    // A date late today vs now this morning is still 0 days (today), even
    // though the ms gap exceeds 12h — the old bug rounded this to 'tomorrow'.
    expect(civilDayDiff(at(2026, 6, 24, 23), at(2026, 6, 24, 9))).toBe(0);
    expect(civilDayDiff(at(2026, 6, 25, 1), at(2026, 6, 24, 23))).toBe(1);
  });
});

describe("relativeDate", () => {
  const now = at(2026, 6, 24);
  it("names near days", () => {
    expect(relativeDate(at(2026, 6, 24, 23), now)).toBe("today");
    expect(relativeDate(at(2026, 6, 25), now)).toBe("tomorrow");
    expect(relativeDate(at(2026, 6, 23), now)).toBe("yesterday");
  });
  it("uses days under two weeks", () => {
    expect(relativeDate(at(2026, 6, 27), now)).toBe("in 3 days");
    expect(relativeDate(at(2026, 6, 21), now)).toBe("3 days ago");
  });
  it("uses weeks from two weeks to two months", () => {
    expect(relativeDate(at(2026, 7, 8), now)).toBe("in 2 weeks");
  });
  it("uses months beyond", () => {
    expect(relativeDate(at(2026, 9, 24), now)).toBe("in 3 months");
  });
});

describe("applyDateTokens", () => {
  it("renders [[YYYY-MM-DD]] tokens to live wording", () => {
    const now = at(2026, 6, 24);
    expect(applyDateTokens("Call doctor [[2026-06-25]]", now)).toBe("Call doctor tomorrow");
    expect(applyDateTokens("Sub [[2026-07-06]] and will [[2026-06-24]]", now)).toBe(
      "Sub in 12 days and will today",
    );
  });
  it("leaves text without tokens untouched", () => {
    expect(applyDateTokens("no dates here", at(2026, 6, 24))).toBe("no dates here");
  });

  it("resolves [[ref]] tokens against the live blocks (stays current after edits)", () => {
    const now = at(2026, 6, 24);
    const blocks = [
      { id: "a1b2c3d4-aaaa", due_date: at(2026, 6, 25), event_date: null },
      { id: "9f8e7d6c-bbbb", due_date: null, event_date: at(2026, 7, 6) },
    ];
    expect(applyDateTokens("Call doctor [[a1b2c3d4]]", now, blocks)).toBe("Call doctor tomorrow");
    expect(applyDateTokens("Sub [[9f8e7d6c]]", now, blocks)).toBe("Sub in 12 days");
    // After a date edit the block's date changes; same token renders the new value.
    const edited = [{ id: "a1b2c3d4-aaaa", due_date: at(2026, 6, 24), event_date: null }];
    expect(applyDateTokens("Call doctor [[a1b2c3d4]]", now, edited)).toBe("Call doctor today");
  });

  it("drops a ref token whose block is gone or has no date", () => {
    const now = at(2026, 6, 24);
    expect(applyDateTokens("Gone [[deadbeef]]", now, [])).toBe("Gone ");
  });
});
