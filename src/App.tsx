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
  // (spec §3: no live recompute, no jitter). `now` is a discrete snapshot —
  // it changes only on load, view change, foregrounding, or a midnight
  // rollover, never on a rolling timer — so the board never jitters while the
  // user is looking, but priorities and date wording reset at the start of a
  // new day with no cron and no AI call.
  const [now, setNow] = useState<number>(() => Date.now());

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
    setNow(Date.now());
    load(view);
  }, [view, load]);

  // Re-snapshot the clock + reload when the app returns to the foreground, and
  // when the calendar day rolls over while it's left open. The interval only
  // acts on an actual day change, so there is no per-minute re-render.
  useEffect(() => {
    const refresh = () => {
      setNow(Date.now());
      load(view);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    let lastDay = new Date().getDate();
    const id = window.setInterval(() => {
      const d = new Date().getDate();
      if (d !== lastDay) {
        lastDay = d;
        refresh();
      }
    }, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(id);
    };
  }, [view, load]);

  // One-time: rebuild summaries written before date-tokening, so existing
  // stale prose ("due tomorrow" frozen days ago) is replaced with live tokens.
  const resummarized = useRef(false);
  useEffect(() => {
    if (resummarized.current || loading || loadError || spaces.length === 0) return;
    resummarized.current = true;
    if (localStorage.getItem("resummarized_dates_v1")) return;
    api
      .resummarize()
      .then(() => {
        localStorage.setItem("resummarized_dates_v1", "1");
        load(view);
      })
      .catch(() => {});
  }, [loading, loadError, spaces.length, load, view]);

  // Layout is a PURE function of (spaces, scores) — relevance stays separate
  // from layout (spec §4). Recomputed against the snapshot `now`.
  const scored = useMemo(() => scoreSpaces(spaces, { now }), [spaces, now]);

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
          now={now}
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
            setNow(Date.now());
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
            now={now}
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
            now={now}
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
