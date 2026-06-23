import { useState } from "react";
import { LayoutGroup } from "framer-motion";
import type { SpaceWithBlocks, Scored } from "../../shared/types";
import { Bubble } from "./Bubble";

interface Props {
  spaces: SpaceWithBlocks[];
  scored: Scored[];
  archived: boolean;
  onPeek: (id: string) => void;
  onUnarchive: (id: string) => void;
}

/**
 * The surfacing board (spec §3): a single relevance-ordered flow, most-relevant
 * first, size from tier. Relevance is double-encoded — reading order AND size
 * both point at the same thing. Reflow animates via framer-motion layout (FLIP).
 */
export function Board({ spaces, scored, archived, onPeek, onUnarchive }: Props) {
  const [showDormant, setShowDormant] = useState(false);

  const byId = new Map(spaces.map((s) => [s.id, s]));
  // Descending relevance order (scoreSpaces already sorts).
  const ordered = scored
    .map((sc) => ({ sc, space: byId.get(sc.spaceId)! }))
    .filter((x) => x.space);

  const prominent = ordered.filter((x) => x.sc.tier !== "dormant");
  const dormant = ordered.filter((x) => x.sc.tier === "dormant");

  return (
    <main className="board">
      <LayoutGroup>
        <div className="flow">
          {prominent.map(({ sc, space }) => (
            <Bubble
              key={space.id}
              space={space}
              scored={sc}
              archived={archived}
              onPeek={onPeek}
              onUnarchive={onUnarchive}
            />
          ))}
        </div>

        {/* Dormant circles fall to the end and collapse behind an affordance
            so they don't clutter the glance (spec §3). Reached via search. */}
        {dormant.length > 0 && (
          <div className="dormant-zone">
            <button className="dormant-toggle" onClick={() => setShowDormant((v) => !v)}>
              {showDormant ? "Hide" : `${dormant.length} dormant`}
            </button>
            {showDormant && (
              <div className="flow dormant-flow">
                {dormant.map(({ sc, space }) => (
                  <Bubble
                    key={space.id}
                    space={space}
                    scored={sc}
                    archived={archived}
                    onPeek={onPeek}
                    onUnarchive={onUnarchive}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </LayoutGroup>
    </main>
  );
}
