import { useState } from "react";
import { motion } from "framer-motion";
import type { SpaceWithBlocks, Block, BlockType } from "../../shared/types";
import { api } from "../api";
import { blockLabel } from "../../shared/summary";
import { applyDateTokens, relativeDate } from "../../shared/dates";

interface Props {
  space: SpaceWithBlocks;
  now: number;
  onClose: () => void;
  onChanged: () => void;
}

const ADDABLE: BlockType[] = ["task", "fact", "note", "date", "contact", "checklist_item"];

/**
 * Full Space view — the MANUAL capture path (spec §5). Placing information by
 * hand is a memory-building ritual (the generation effect) that compensates for
 * the weak auditory channel, so it must be fast and pleasant — not a fallback.
 */
export function SpaceView({ space, now, onClose, onChanged }: Props) {
  const [adding, setAdding] = useState<BlockType | null>(null);
  const [draft, setDraft] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [editDateId, setEditDateId] = useState<string | null>(null);

  async function add() {
    if (!adding) return;
    const content = buildContent(adding, draft);
    if (!hasContent(content)) return;
    const when = dateInputToEpoch(draftDate);
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

  // Inline date editing: tap a date (or "+ date") to change it. Writes the
  // block's due_date (tasks) or event_date (date blocks); "" clears it.
  async function saveDate(b: Block, value: string) {
    const epoch = dateInputToEpoch(value);
    await api.patchBlock(b.id, b.type === "date" ? { event_date: epoch } : { due_date: epoch });
    setEditDateId(null);
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
        {space.summary && (
          <p className="space-summary">{applyDateTokens(space.summary, now)}</p>
        )}

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
              {datedType(b.type) &&
                (editDateId === b.id ? (
                  <span className="block-date-edit">
                    <input
                      type="date"
                      autoFocus
                      className="date-input"
                      defaultValue={dateField(b) != null ? epochToDateInput(dateField(b)!) : ""}
                      onChange={(e) => saveDate(b, e.target.value)}
                    />
                    {dateField(b) != null && (
                      <button className="link" onClick={() => saveDate(b, "")}>clear</button>
                    )}
                    <button className="link" onClick={() => setEditDateId(null)}>done</button>
                  </span>
                ) : dateField(b) != null ? (
                  <button className="block-date" onClick={() => setEditDateId(b.id)}>
                    {b.type === "date" ? "" : "due "}
                    {relativeDate(dateField(b)!, now)}
                  </button>
                ) : (
                  <button
                    className="block-date block-date-add"
                    onClick={() => setEditDateId(b.id)}
                  >
                    + date
                  </button>
                ))}
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

// Which blocks carry a date the user can edit.
function datedType(t: BlockType): boolean {
  return t === "task" || t === "checklist_item" || t === "date";
}

function dateField(b: Block): number | null {
  return b.type === "date" ? b.event_date : b.due_date;
}

// A <input type="date"> value is "YYYY-MM-DD". Anchor at LOCAL noon so the
// stored instant lands on the intended calendar day in the user's timezone
// (new Date("YYYY-MM-DD") parses as UTC midnight and shifts the day west).
function dateInputToEpoch(v: string): number | null {
  if (!v) return null;
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

function epochToDateInput(epoch: number): string {
  const d = new Date(epoch);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
