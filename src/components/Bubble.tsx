import { motion } from "framer-motion";
import type { SpaceWithBlocks, Scored } from "../../shared/types";
import { applyDateTokens } from "../../shared/dates";

interface Props {
  space: SpaceWithBlocks;
  scored: Scored;
  archived: boolean;
  now: number;
  onPeek: (id: string) => void;
  onUnarchive: (id: string) => void;
}

const TYPE_GLYPH: Record<string, string> = {
  project: "◆",
  person: "●",
  reference: "▤",
  standalone: "○",
};

/**
 * One bubble per active Space. Shape and size encode state rounded
 * forms only (no hard rectangles), prominence in discrete tiers, glow when
 * charged. The WHOLE bubble is the tap target. Reflow animates via
 * the `layout` prop — when a Space changes tier it visibly grows/shrinks and
 * moves to its new place (the motion is information).
 */
export function Bubble({ space, scored, archived, now, onPeek, onUnarchive }: Props) {
  const { tier, charged, reason } = scored;
  // Date tokens in the cached summary are rendered to live wording here, so
  // "tomorrow" can never go stale (it's recomputed every render).
  const summary = space.summary ? applyDateTokens(space.summary, now, space.blocks) : "";

  return (
    <motion.button
      layout
      layoutId={space.id}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className={`bubble tier-${tier} ${charged ? "charged" : ""} type-${space.type}`}
      onClick={() => (archived ? onUnarchive(space.id) : onPeek(space.id))}
      title={reason}
    >
      {charged && <span className="glow-dot" aria-label="new" />}

      {tier === "hero" ? (
        <>
          <div className="bubble-head">
            <span className="glyph">{TYPE_GLYPH[space.type] || "○"}</span>
            <span className="bubble-title">{space.title}</span>
          </div>
          <div className="hero-summary">
            {summary.trim() || "Nothing pressing right now."}
          </div>
          <div className="bubble-reason">{reason}</div>
        </>
      ) : tier === "active" ? (
        <>
          <div className="bubble-head">
            <span className="glyph">{TYPE_GLYPH[space.type] || "○"}</span>
            <span className="bubble-title">{space.title}</span>
          </div>
          <div className="bubble-digest">{firstLine(summary) || reason}</div>
        </>
      ) : tier === "medium" ? (
        <span className="bubble-title">{space.title}</span>
      ) : (
        <span className="bubble-title dormant-label">
          {TYPE_GLYPH[space.type] || "○"} {space.title}
        </span>
      )}

      {archived && <span className="restore-hint">tap to restore</span>}
    </motion.button>
  );
}

function firstLine(summary: string): string {
  if (!summary) return "";
  const [first] = summary.split("•");
  return first.trim();
}
