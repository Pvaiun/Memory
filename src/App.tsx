// App shell (SCAFFOLD). The board (bubbles) is primary; capture is always
// available; secondary views and search are reachable but lower priority.

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { BubbleWithItems } from "../shared/types";
import { api } from "./api";
import { Board } from "./components/Board";
import { CaptureBar } from "./components/CaptureBar";
import { Peek } from "./components/Peek";
import { SearchOverlay } from "./components/SearchOverlay";
import { ComponentsView } from "./components/ComponentsView";

type View = "board" | "library";

export function App() {
  const [bubbles, setBubbles] = useState<BubbleWithItems[]>([]);
  const [view, setView] = useState<View>("board");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [peekId, setPeekId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  // The board is a snapshot; date wording is computed live against `now`.
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setError(null);
      const { bubbles } = await api.bubbles();
      setBubbles(bubbles);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setNow(Date.now());
    load();
  }, [load]);

  // TODO: refresh on foreground + day rollover (the Brain rebuilds daily; the
  // client should re-pull and re-snapshot `now`). See previous app's App.tsx.

  const peek = peekId ? bubbles.find((b) => b.id === peekId) : null;

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setView("board")}>
          <span className="brand-dot" /> Memory
        </button>
        <div className="topbar-actions">
          <button className="icon-btn" title="Search" onClick={() => setSearching(true)}>⌕</button>
          <button className="pill" onClick={() => setView(view === "library" ? "board" : "library")}>
            {view === "library" ? "← Board" : "Library"}
          </button>
        </div>
      </header>

      {view === "library" ? (
        <ComponentsView />
      ) : loading ? (
        <div className="empty">Loading the board…</div>
      ) : error ? (
        <div className="empty"><p>Couldn’t reach your data.</p><pre className="load-error">{error}</pre></div>
      ) : bubbles.length === 0 ? (
        <div className="empty">No bubbles yet. Dump a thought below, or rebuild the board.</div>
      ) : (
        <Board bubbles={bubbles} now={now} onPeek={setPeekId} />
      )}

      {view === "board" && <CaptureBar onCommitted={() => { setNow(Date.now()); load(); }} />}

      <AnimatePresence>
        {peek && <Peek key="peek" bubble={peek} now={now} onClose={() => setPeekId(null)} onChanged={load} />}
      </AnimatePresence>
      <AnimatePresence>
        {searching && <SearchOverlay key="search" onClose={() => setSearching(false)} />}
      </AnimatePresence>
    </div>
  );
}
