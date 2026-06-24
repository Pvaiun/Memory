import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CaptureProposal, SpaceWithBlocks } from "../../shared/types";
import { api } from "../api";

interface Props {
  onCommitted: () => void;
}

/**
 * Fast dump (spec §5): one always-available box. The AI proposes a target Space,
 * block type, and structured content; the user confirms or redirects in a single
 * tap. The AI auto-files to a good-enough home — nothing is forced into a triage
 * queue (spec §5, §10.5). Capture latency is the app's most important metric
 * (spec §1), so the box is always mounted and submits optimistically.
 */
export function CaptureBar({ onCommitted }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<CaptureProposal | null>(null);
  const [spaces, setSpaces] = useState<SpaceWithBlocks[]>([]);
  const [redirect, setRedirect] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    try {
      const [{ proposal }, state] = await Promise.all([api.capture(t), api.state()]);
      setSpaces(state.spaces);
      setProposal(proposal);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Capture failed");
    } finally {
      setBusy(false);
    }
  }

  async function commit(p: CaptureProposal) {
    setBusy(true);
    setError(null);
    try {
      let spaceId: string;
      if ("existing_id" in p.target_space) {
        spaceId = p.target_space.existing_id;
      } else {
        const created = await api.createSpace({
          title: p.target_space.new.title,
          type: p.target_space.new.type,
        });
        spaceId = created.id;
      }
      await api.addBlock(spaceId, {
        type: p.block.type,
        content: p.block.content,
        due_date: p.block.due_date,
        event_date: p.block.event_date,
      });
      reset();
      onCommitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Filing failed");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setText("");
    setProposal(null);
    setRedirect(false);
    setError(null);
  }

  return (
    <div className="capture">
      <AnimatePresence>
        {proposal && (
          <motion.div
            className="proposal"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
          >
            <ProposalCard
              proposal={proposal}
              spaces={spaces}
              redirect={redirect}
              onToggleRedirect={() => setRedirect((v) => !v)}
              onChange={setProposal}
              onCommit={() => commit(proposal)}
              onCancel={reset}
              busy={busy}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="capture-error" role="alert">
          {error}
        </div>
      )}

      <div className="capture-row">
        <input
          ref={inputRef}
          className="capture-input"
          placeholder="Dump a thought…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          disabled={busy && !proposal}
        />
        <VoiceButton onText={(t) => setText((prev) => (prev ? prev + " " + t : t))} />
        <button className="capture-send" onClick={submit} disabled={busy || !text.trim()}>
          {busy && !proposal ? "…" : "↑"}
        </button>
      </div>
    </div>
  );
}

function ProposalCard({
  proposal,
  spaces,
  redirect,
  onToggleRedirect,
  onChange,
  onCommit,
  onCancel,
  busy,
}: {
  proposal: CaptureProposal;
  spaces: SpaceWithBlocks[];
  redirect: boolean;
  onToggleRedirect: () => void;
  onChange: (p: CaptureProposal) => void;
  onCommit: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const target = proposal.target_space;
  const targetLabel =
    "existing_id" in target
      ? spaces.find((s) => s.id === target.existing_id)?.title || "a Space"
      : `New: ${target.new.title}`;
  const tentative = proposal.confidence < 0.5; // present low confidence gently (spec §5)

  return (
    <div className={`proposal-card ${tentative ? "tentative" : ""}`}>
      <div className="proposal-line">
        <span className="proposal-label">{tentative ? "Best guess →" : "Filing to"}</span>
        <strong>{targetLabel}</strong>
        <span className="chip">{proposal.block.type}</span>
        <button className="link" onClick={onToggleRedirect}>
          {redirect ? "keep" : "redirect"}
        </button>
      </div>

      <div className="proposal-content">{previewContent(proposal)}</div>

      {redirect && (
        <select
          className="redirect-select"
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__new") {
              const title = prompt("New Space title?", targetLabel.replace(/^New: /, "")) || "";
              if (title)
                onChange({ ...proposal, target_space: { new: { title, type: "standalone" } } });
            } else {
              onChange({ ...proposal, target_space: { existing_id: v } });
            }
          }}
          defaultValue=""
        >
          <option value="" disabled>
            Move to…
          </option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
          <option value="__new">+ New Space…</option>
        </select>
      )}

      <div className="proposal-actions">
        <button className="btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="btn-primary" onClick={onCommit} disabled={busy}>
          {busy ? "Filing…" : "Confirm"}
        </button>
      </div>
    </div>
  );
}

function previewContent(p: CaptureProposal): string {
  const c = p.block.content || {};
  if (typeof c.key === "string" && typeof c.value === "string") return `${c.key}: ${c.value}`;
  if (typeof c.name === "string") return [c.name, c.phone, c.email].filter(Boolean).join(" · ");
  if (typeof c.text === "string") return c.text;
  if (typeof c.title === "string") return c.title as string;
  if (typeof c.value === "string") return c.value;
  return JSON.stringify(c);
}

// Voice capture via the Web Speech API (spec §5: optional, available in the PWA).
function VoiceButton({ onText }: { onText: (t: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) {
      setSupported(true);
      const rec = new SR();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-US";
      rec.onresult = (e: any) => onText(e.results[0][0].transcript);
      rec.onend = () => setListening(false);
      recRef.current = rec;
    }
  }, [onText]);

  if (!supported) return null;
  return (
    <button
      className={`capture-voice ${listening ? "listening" : ""}`}
      title="Dictate"
      onClick={() => {
        if (listening) recRef.current?.stop();
        else {
          setListening(true);
          recRef.current?.start();
        }
      }}
    >
      🎙
    </button>
  );
}
