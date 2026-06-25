// Search (SCAFFOLD). Semantic, not keyword: the user types a vague phrase and
// the server returns the nearest content items by embedding similarity.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { ItemRef } from "../../shared/types";
import { api } from "../api";

interface Props {
  onClose: () => void;
}

export function SearchOverlay({ onClose }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ItemRef[]>([]);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const id = setTimeout(async () => {
      try {
        const { results } = await api.search(q);
        setResults(results);
      } catch {
        /* ignore while typing */
      }
    }, 200);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <motion.div className="sheet-backdrop" onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="search" onClick={(e) => e.stopPropagation()}
        initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }}>
        <input autoFocus className="capture-input" placeholder="Search by meaning…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        {/* TODO: resolve each ItemRef to a real item and render it nicely. */}
        <ul className="block-list">
          {results.map((r) => (
            <li key={`${r.type}:${r.id}`} className="block"><span className="block-text">{r.type}: {r.id}</span></li>
          ))}
        </ul>
      </motion.div>
    </motion.div>
  );
}
