import { motion } from "framer-motion";
import type { SpaceWithBlocks, Scored } from "../../shared/types";
import { applyDateTokens } from "../../shared/dates";

interface Props {
  space: SpaceWithBlocks;
  scored?: Scored;
  now: number;
  onClose: () => void;
  onOpenFully: () => void;
  onPin: (pinned: boolean) => void;
  onArchive: () => void;
}

/**
 * The peek (spec §3): tapping a bubble shows the Space's living summary in
 * place — checking the app is reading, not navigating in. "Open fully" lives
 * inside the peek. Reading already discharged the glow (handled in App).
 */
export function Peek({ space, scored, now, onClose, onOpenFully, onPin, onArchive }: Props) {
  const pinned = space.lifecycle === "pinned";
  const summary = space.summary ? applyDateTokens(space.summary, now) : "";
  return (
    <motion.div className="sheet-backdrop" onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className="peek"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
      >
        <div className="peek-head">
          <h2>{space.title}</h2>
          <span className="chip">{space.type}</span>
        </div>
        {scored && <div className="peek-reason">{scored.reason}</div>}

        <div className="peek-summary">
          {summary.trim() || "Nothing captured here yet."}
        </div>

        <div className="peek-actions">
          <button className="btn-ghost" onClick={() => onPin(!pinned)}>
            {pinned ? "★ Pinned" : "☆ Pin"}
          </button>
          <button className="btn-ghost" onClick={onArchive}>
            Archive
          </button>
          <button className="btn-primary" onClick={onOpenFully}>
            Open fully
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
