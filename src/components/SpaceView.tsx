import { useState } from "react";
import { motion } from "framer-motion";
import type { SpaceWithBlocks, Block, BlockType } from "../../shared/types";
import { api } from "../api";
import { blockLabel } from "../../shared/summary";

interface Props {
  space: SpaceWithBlocks;
  onClose: () => void;
  onChanged: () => void;
}

const ADDABLE: BlockType[] = ["task", "fact", "note", "date", "contact", "checklist_item"];

/**
 * Full Space view — the MANUAL capture path (spec §5). Placing information by
 * hand is a memory-building ritual (the generation effect) that compensates for
 * the weak auditory channel, so it must be fast and pleasant — not a fallback.
 */
export function SpaceView({ space, onClose, onChanged }: Props) {
  const [adding, setAdding] = useState<BlockType | null>(null);
  const [draft, setDraft] = useState("");
  const [draftDate, setDraftDate] = useState("");

  async function add() {
    if (!adding) return;
    const content = buildContent(adding, draft);
    if (!hasContent(content)) return;
    const when = draftDate ? new Date(draftDate).getTime() : null;
    await api.addBlock(space.id, {
      type: adding,
      content,
      due_date: adding === "task" || adding === "checklist_item" ? when : null,
      event_date: adding === "date" ? when : null,
    });
    setDraft("");
    setDraftDate("");
    setAdding(null);
    onChanged();
  }

  async function toggle(b: Block) {
    await api.patchBlock(b.id, { completed: b.completed ? 0 : 1 });
    onChanged();
  }

  async function remove(b: Block) {
    await api.deleteBlock(b.id);
    onChanged();
  }

  const usesDate = adding === "task" || adding === "date" || adding === "checklist_item";

  return (
    <motion.div className="sheet-backdrop" onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className="space-view"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 34 }}
      >
        <div className="space-head">
          <h2>{space.title}</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        {space.summary && <p className="space-summary">{space.summary}</p>}

        <ul className="block-list">
          {space.blocks.map((b) => (
            <li key={b.id} className={`block block-${b.type} ${b.completed ? "done" : ""}`}>
              {(b.type === "task" || b.type === "checklist_item") && (
                <input
                  type="checkbox"
                  checked={!!b.completed}
                  onChange={() => toggle(b)}
                />
              )}
              <span className="block-text">{blockLabel(b)}</span>
              {b.due_date && <span className="block-date">due {fmt(b.due_date)}</span>}
              {b.event_date && <span className="block-date">{fmt(b.event_date)}</span>}
              <button className="block-del" onClick={() => remove(b)}>×</button>
            </li>
          ))}
          {space.blocks.length === 0 && <li className="block empty-block">No blocks yet.</li>}
        </ul>

        {adding ? (
          <div className="add-form">
            <input
              autoFocus
              className="capture-input"
              placeholder={placeholderFor(adding)}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            {usesDate && (
              <input
                type="date"
                className="date-input"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
              />
            )}
            <button className="btn-primary" onClick={add}>Add</button>
            <button className="btn-ghost" onClick={() => setAdding(null)}>Cancel</button>
          </div>
        ) : (
          <div className="add-types">
            {ADDABLE.map((t) => (
              <button key={t} className="type-btn" onClick={() => setAdding(t)}>
                + {t.replace("_", " ")}
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function buildContent(type: BlockType, draft: string): Record<string, unknown> {
  const t = draft.trim();
  if (type === "fact") {
    const parts = t.split(/\s*[:=]\s*/);
    return parts.length >= 2 ? { key: parts[0], value: parts.slice(1).join(" ") } : { value: t };
  }
  if (type === "contact") {
    const phone = t.match(/\+?\d[\d\s().-]{6,}\d/)?.[0];
    const email = t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
    const name = t.replace(phone || "", "").replace(email || "", "").trim();
    return { name: name || t, phone: phone || null, email: email || null };
  }
  if (type === "date") return { title: t };
  return { text: t };
}

function hasContent(c: Record<string, unknown>): boolean {
  return Object.values(c).some((v) => typeof v === "string" && v.trim());
}

function placeholderFor(type: BlockType): string {
  switch (type) {
    case "fact": return "key: value  (e.g. allergy: shellfish)";
    case "contact": return "name and phone/email";
    case "date": return "what's happening";
    case "task": case "checklist_item": return "what needs doing";
    default: return "note…";
  }
}

function fmt(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
