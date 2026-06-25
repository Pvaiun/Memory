// One bubble (SCAFFOLD). Shows the Brain's title + glanceable description; size/
// shape/color/glow come from the bubble's display vectors. Whole bubble taps to
// peek. Date wording in the description renders live via applyDateTokens.

import { motion } from "framer-motion";
import type { BubbleWithItems } from "../../shared/types";
import { applyDateTokens } from "../../shared/dates";

interface Props {
  bubble: BubbleWithItems;
  now: number;
  onPeek: (id: string) => void;
}

export function Bubble({ bubble, now, onPeek }: Props) {
  const size = bubble.display?.size ?? "medium";
  // TODO: the Brain can embed [[ref]] date tokens in descriptions; resolving
  // them live needs the referenced items' dates (not just the refs). Wire the
  // bubble's items (with their dates) through here. For now, pass none.
  const description = bubble.description ? applyDateTokens(bubble.description, now) : "";

  return (
    <motion.button
      layout
      layoutId={bubble.id}
      className={`bubble tier-${size} ${bubble.display?.glow ? "charged" : ""}`}
      onClick={() => onPeek(bubble.id)}
      title={bubble.title}
    >
      <div className="bubble-head">
        <span className="bubble-title">{bubble.title}</span>
      </div>
      {(size === "hero" || size === "large") && description && (
        <div className="hero-summary">{description}</div>
      )}
    </motion.button>
  );
}
