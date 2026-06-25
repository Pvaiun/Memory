// Bubble peek (SCAFFOLD). Opening a bubble shows its description and the content
// items it references, with controls to pin/dismiss/reprioritize and to act on
// the underlying items (complete a task, act on a goal, etc.).

import { motion } from "framer-motion";
import type { BubbleWithItems } from "../../shared/types";
import { api } from "../api";

interface Props {
  bubble: BubbleWithItems;
  now: number;
  onClose: () => void;
  onChanged: () => void;
}

export function Peek({ bubble, onClose, onChanged }: Props) {
  const pinned = bubble.pinned === 1;
  return (
    <motion.div className="sheet-backdrop" onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="peek" onClick={(e) => e.stopPropagation()}
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}>
        <div className="peek-head"><h2>{bubble.title}</h2></div>
        <div className="peek-summary">{bubble.description}</div>

        {/* TODO: render each referenced item (fetch by ItemRef) with inline
            actions — complete task, act-on goal, edit date, open knowledge. */}
        <ul className="block-list">
          {bubble.items.map((it) => (
            <li key={`${it.type}:${it.id}`} className="block">
              <span className="block-text">{it.type}: {it.id}</span>
            </li>
          ))}
          {bubble.items.length === 0 && <li className="block empty-block">No linked items.</li>}
        </ul>

        <div className="peek-actions">
          <button className="btn-ghost" onClick={async () => { await api.patchBubble(bubble.id, { pinned: pinned ? 0 : 1 }); onChanged(); }}>
            {pinned ? "★ Pinned" : "☆ Pin"}
          </button>
          <button className="btn-ghost" onClick={async () => { await api.patchBubble(bubble.id, { dismissed: 1 }); onChanged(); onClose(); }}>
            Dismiss
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
