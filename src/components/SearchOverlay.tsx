import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { SpaceWithBlocks } from "../../shared/types";
import { api } from "../api";

interface Props {
  onClose: () => void;
  onOpen: (id: string) => void;
}

/**
 * Search (spec §7): targeted retrieval of a specific dormant Space is a search
 * problem, not a spatial-memory one. Full-text across titles, block content,
 * and summaries — covers "that one thing I filed weeks ago".
 */
export function SearchOverlay({ onClose, onOpen }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SpaceWithBlocks[]>([]);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const id = setTimeout(async () => {
      const { spaces } = await api.search(q);
      setResults(spaces);
    }, 120);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <motion.div className="sheet-backdrop search-backdrop" onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className="search-panel"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -30, opacity: 0 }}
      >
        <input
          ref={ref}
          className="search-input"
          placeholder="Search everything…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
        />
        <ul className="search-results">
          {results.map((s) => (
            <li key={s.id}>
              <button onClick={() => onOpen(s.id)}>
                <span className="chip">{s.type}</span>
                <strong>{s.title}</strong>
                {s.summary && <span className="search-snippet">{s.summary}</span>}
              </button>
            </li>
          ))}
          {q.trim() && results.length === 0 && (
            <li className="search-empty">No matches.</li>
          )}
        </ul>
      </motion.div>
    </motion.div>
  );
}
