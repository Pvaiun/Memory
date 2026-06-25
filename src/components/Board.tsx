// The board (SCAFFOLD): a relevance-ordered flow of bubbles. The Brain sets
// each bubble's priority and display vectors; this just renders them. Reflow
// animates via framer-motion layout (FLIP) — preserved from the previous app.

import { LayoutGroup } from "framer-motion";
import type { BubbleWithItems } from "../../shared/types";
import { Bubble } from "./Bubble";

interface Props {
  bubbles: BubbleWithItems[];
  now: number;
  onPeek: (id: string) => void;
}

export function Board({ bubbles, now, onPeek }: Props) {
  const ordered = [...bubbles].sort((a, b) => b.priority - a.priority);
  return (
    <main className="board">
      <LayoutGroup>
        <div className="flow">
          {ordered.map((b) => (
            <Bubble key={b.id} bubble={b} now={now} onPeek={onPeek} />
          ))}
        </div>
      </LayoutGroup>
    </main>
  );
}
