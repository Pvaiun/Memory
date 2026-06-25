// Smart capture (SCAFFOLD) — the other most-important feature. A raw, often
// dictated thought goes to the AI, which proposes one or more items across
// components (task/goal/knowledge/event). The user approves, edits, or rejects
// each before commit. Confirm/redirect UX is preserved from the previous app;
// the contract is now multi-item.

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CaptureProposal } from "../../shared/types";
import { api } from "../api";

interface Props {
  onCommitted: () => void;
}

export function CaptureBar({ onCommitted }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<CaptureProposal | null>(null);

  async function submit() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { proposal } = await api.capture(t);
      setProposal(proposal);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Capture failed");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!proposal) return;
    setBusy(true);
    try {
      await api.commitCapture(proposal); // TODO: allow per-item edits first
      setText("");
      setProposal(null);
      onCommitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Filing failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="capture">
      <AnimatePresence>
        {proposal && (
          <motion.div className="proposal" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
            <div className="proposal-card">
              {/* TODO: render each proposed item with type chip + editable fields,
                  per-item keep/redirect, and push-to-calendar toggle for events. */}
              {proposal.items.map((it, i) => (
                <div key={i} className="proposal-line">
                  <span className="chip">{it.type}</span>
                  <span className="proposal-content">{JSON.stringify(it.data)}</span>
                </div>
              ))}
              <div className="proposal-actions">
                <button className="btn-ghost" onClick={() => setProposal(null)} disabled={busy}>Cancel</button>
                <button className="btn-primary" onClick={commit} disabled={busy}>{busy ? "Filing…" : "Confirm"}</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <div className="capture-error" role="alert">{error}</div>}

      <div className="capture-row">
        <input
          className="capture-input"
          placeholder="Dump a thought…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          disabled={busy && !proposal}
        />
        {/* TODO: voice dictation (Web Speech API) + Android share-target intake. */}
        <button className="capture-send" onClick={submit} disabled={busy || !text.trim()}>↑</button>
      </div>
    </div>
  );
}
