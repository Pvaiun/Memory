import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { SpaceWithBlocks } from "../shared/types";
import { scoreSpaces } from "../shared/relevance";
import { api } from "./api";
import { Board } from "./components/Board";
import { CaptureBar } from "./components/CaptureBar";
import { Peek } from "./components/Peek";
import { SpaceView } from "./components/SpaceView";
import { SearchOverlay } from "./components/SearchOverlay";

type View = "board" | "archive";

export function App() {
  const [spaces, setSpaces] = useState<SpaceWithBlocks[]>([]);
  const [view, setView] = useState<View>("board");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [peekId, setPeekId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  // Relevance is snapshotted at board mount and held stable for the session
  // (spec §3: no live recompute, no jitter). `now` refreshes only on reload.
  const nowRef = useRef<number>(Date.now());

  const load = useCallback(async (v: View = view) => {
    try {
      setLoadError(null);
      const { spaces } = v === "archive" ? await api.archive() : await api.state();
      setSpaces(spaces);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    nowRef.current = Date.now();
    load(view);
  }, [view, load]);

  // Layout is a PURE function of (spaces, scores) — relevance stays separate
  // from layout (spec §4). Recomputed against the frozen `now` so content
  // changes animate, but the clock never causes jitter.
  const scored = useMemo(
    () => scoreSpaces(spaces, { now: nowRef.current }),
    [spaces],
  );

  const byId = useMemo(() => {
    const m = new Map<string, SpaceWithBlocks>();
    for (const s of spaces) m.set(s.id, s);
    return m;
  }, [spaces]);

  // Reading discharges the glow (spec §4) without driving position (spec §10.7).
  const discharge = useCallback(async (id: string) => {
    const s = byId.get(id);
    if (s && s.unread === 1) {
      setSpaces((prev) =>
        prev.map((x) => (x.id === id ? { ...x, unread: 0 } : x)),
      );
      await api.patchSpace(id, { unread: 0 });
    }
  }, [byId]);

  const onPeek = useCallback((id: string) => {
    setPeekId(id);
    discharge(id);
  }, [discharge]);

  const peekSpace = peekId ? byId.get(peekId) : null;
  const openSpace = openId ? byId.get(openId) : null;

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setView("board")}>
          <span className="brand-dot" /> Memory
        </button>
        <div className="topbar-actions">
          <button className="icon-btn" title="Search" onClick={() => setSearching(true)}>
            ⌕
          </button>
          <button
            className={`pill ${view === "archive" ? "pill-on" : ""}`}
            onClick={() => setView(view === "archive" ? "board" : "archive")}
          >
            {view === "archive" ? "← Board" : "Archive"}
          </button>
        </div>
      </header>

      {loading ? (
        <div className="empty">Reading the room…</div>
      ) : loadError ? (
        <div className="empty">
          <p>Couldn’t reach your data.</p>
          <pre className="load-error">{loadError}</pre>
        </div>
      ) : spaces.length === 0 ? (
        <div className="empty">
          {view === "archive"
            ? "Nothing archived."
            : "Nothing here yet. Dump a thought below — it’ll find a home."}
        </div>
      ) : (
        <Board
          spaces={spaces}
          scored={scored}
          archived={view === "archive"}
          onPeek={onPeek}
          onUnarchive={async (id) => {
            await api.patchSpace(id, { lifecycle: "active" });
            load("archive");
          }}
        />
      )}

      {view === "board" && (
        <CaptureBar
          onCommitted={() => {
            nowRef.current = Date.now();
            load("board");
          }}
        />
      )}

      <AnimatePresence>
        {peekSpace && (
          <Peek
            key="peek"
            space={peekSpace}
            scored={scored.find((s) => s.spaceId === peekSpace.id)}
            onClose={() => setPeekId(null)}
            onOpenFully={() => {
              setOpenId(peekSpace.id);
              setPeekId(null);
            }}
            onPin={async (pinned) => {
              await api.patchSpace(peekSpace.id, {
                lifecycle: pinned ? "pinned" : "active",
              });
              load("board");
            }}
            onArchive={async () => {
              await api.patchSpace(peekSpace.id, { lifecycle: "archived" });
              setPeekId(null);
              load("board");
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {openSpace && (
          <SpaceView
            key="space"
            space={openSpace}
            onClose={() => setOpenId(null)}
            onChanged={() => load(view)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {searching && (
          <SearchOverlay
            key="search"
            onClose={() => setSearching(false)}
            onOpen={(id) => {
              setSearching(false);
              setOpenId(id);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
