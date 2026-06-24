// Relative date wording, computed LIVE on the client so it never goes stale
// (the bug this fixes: AI summaries baked words like "tomorrow" into cached
// text, which was wrong the next day). The rule: never store relative words —
// store the date, render the wording fresh on every glance.
//
// Wording scheme: today · tomorrow · yesterday · "in N days" / "N days ago"
// (under 2 weeks) · "in N weeks" / "N weeks ago" (2 weeks–2 months) ·
// "in N months" beyond. Computed on CIVIL-day boundaries in local time so
// "tomorrow" flips at midnight, not on a rolling 24h clock.

const DAY = 86_400_000;

export function civilDayDiff(when: number, now: number): number {
  const a = new Date(now);
  a.setHours(0, 0, 0, 0);
  const b = new Date(when);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / DAY);
}

export function relativeDate(when: number, now: number): string {
  const d = civilDayDiff(when, now);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  const n = Math.abs(d);
  const ahead = d > 0;
  if (n < 14) return ahead ? `in ${n} days` : `${n} days ago`;
  if (n < 60) {
    const w = Math.round(n / 7);
    return ahead ? `in ${w} weeks` : `${w} weeks ago`;
  }
  const m = Math.round(n / 30);
  return ahead ? `in ${m} months` : `${m} months ago`;
}

// Replace [[YYYY-MM-DD]] tokens (emitted by the AI summary) with live relative
// wording. Anchored at local noon so the civil-day math can't flip on a DST or
// midnight boundary. Unparseable tokens are stripped of their brackets.
const TOKEN = /\[\[(\d{4})-(\d{2})-(\d{2})\]\]/g;

export function applyDateTokens(text: string, now: number): string {
  if (!text) return text;
  return text.replace(TOKEN, (_m, y, mo, d) => {
    const when = new Date(Number(y), Number(mo) - 1, Number(d), 12, 0, 0).getTime();
    if (Number.isNaN(when)) return `${y}-${mo}-${d}`;
    return relativeDate(when, now);
  });
}
