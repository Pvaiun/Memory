# Memory — Design Specification (v1)

A personal, single-user **contextual second brain** for Android. Its job is to hold large amounts of changing information and **surface the right content at the right moment, visually, with zero recall effort from the user.** This is not a reminder app, a to-do app, or a timer app. Read the next section before building anything — it contains the reasoning that makes the rest of the spec coherent, and several decisions here deliberately reject the obvious default.

---

## 1. What this is, and the user it's for

The user has a formally diagnosed **99th-percentile weakness in auditory processing**: information told to them is largely not retained. Visual processing is a relative strength. They are busy and frequently *cannot* respond to a prompt at the moment it fires.

Three design consequences follow, and they drive everything:

1. **Capture must be instantaneous.** Because told information doesn't encode, the moment something is heard is now-or-never. Any friction at capture means the thought is lost. Capture latency is the single most important performance metric in the app.
2. **The output is visual content, browsed or surfaced — not pushed.** The core user action is *reading what the app shows them when they glance at it*, or *navigating in to read*. Notifications and timers are explicitly **minor**. The app cannot assume it can interrupt the user successfully.
3. **The user should never have to remember to retrieve.** The app pushes relevant *content* to a glanceable surface; the user pulls only for targeted lookups (via search). Surfacing-first, not storage-first.

**The core bet this app is making:** that a board which sizes and positions information by current relevance — read fresh on every glance — plus AI-maintained living summaries, plus near-zero-friction capture, will let this user hold and use far more contextual information than a notes app or task list ever could. The first build exists to validate that bet. Optimize for proving the core interaction, not for completeness.

---

## 2. Core concepts

### The Space
The central object. A Space is a **context**, not a task or a note. Examples: "Big Move," "Sarah," "Kitchen reference." Each Space is a page of typed blocks plus an AI-maintained summary. Spaces have:
- a **type** — `project`, `person`, `reference`, or `standalone` (for an orphan task/note that doesn't belong to a larger context). Type drives a starting template.
- a **lifecycle** — `active`, `pinned`, or `archived`. Archiving removes a Space from the board entirely (it lives in an archive view, still searchable). Archiving is the mechanism that keeps the active surface small — the thing that killed the user's previous task list was that nothing ever left it. Make archiving and "spin up a new Space" both one-tap.

### The Block
The unit of content inside a Space. Typed: `fact` (key→value, e.g. Sarah → shellfish allergy), `task`, `checklist_item`, `note` (free text), `contact`, `date`/event. The type system matters because **different block types have opposite time-behaviour** (see §4).

### The task vs. permanent distinction (structurally critical)
This is the most important modelling decision in the app. Two kinds of information behave in **opposite** ways over time:
- **Tasks escalate.** An uncompleted task should become *more* prominent the longer it sits — it grows on the board, it brightens. It disappears entirely on completion. This is how "don't forget to book the dentist" surfaces *more* the longer it's ignored, without ever firing a notification.
- **Permanent information recedes (or stays flat).** Sarah's shellfish allergy is not more urgent for being three months old. It must **never** get louder with age. It stays dormant and surfaces by context or search.

The relevance engine is therefore **dispatched by type** — there is no single relevance formula. See §4.

---

## 3. The surfacing board (the heart of the UI)

The home of the app is a board of **bubbles**, one per active Space, sized and positioned by current relevance. The board *is* the surfacing mechanism. Glance at it: the largest, most prominent thing is what matters most right now. No memory, no navigation, no reading required to know where to look.

### Decided principles (non-negotiable, with reasons)

- **Relevance is read fresh on every glance, not memorized.** The board does not need to help the user remember where a Space *was* yesterday. Navigation is not this user's problem; surfacing is. (Earlier drafts of this design optimized for stable card positions as a memory aid — that was wrong and has been removed. Do not reintroduce positional stability as a goal.)
- **Reflow is good, but it must animate.** Because we've dropped positional stability, bubbles changing size/position is pure upside. The one rule: **animate every change.** When Big Move grows as its date nears, the user should *see* it grow — the motion itself is information. Silent reflow is the enemy; visible transition is a feature.
- **Compute relevance on open, hold it stable for the session.** Snapshot relevance when the board mounts; don't recompute live while the user is looking (no jitter). Recompute on next open. **No daily cron** — date-proximity and recency are exact to the moment of opening, and on-read is less to build.
- **Shape and size encode state.** Use rounded forms (the user explicitly does not want hard rectangular cards / a treemap of squares). Prominence is expressed as a small number of discrete tiers, each with its own shape, size, and content density:

| Tier | Form | Content shown |
|---|---|---|
| **Hero** (usually 1, occasionally 2) | Large rounded panel | Living summary — the top ~3 things to know right now |
| **Active** | Medium squircle | Title + one-line digest + glow if charged |
| **Medium** | Small squircle | Title + glow if charged |
| **Dormant** | Small circle / pill | Label or icon only; surfaced mainly via search |

Discrete tiers (rather than a continuous size gradient) are recommended because they make the hierarchy instantly legible and because **promotion becomes a visible shape change** — a dormant item is a little circle; as it climbs it grows and *unfolds* into a rounded panel that reveals its summary. (Note: the original reason for discretizing was to protect spatial memory; that reason is gone, but discreteness still earns its place through legibility and the shape-change affordance. The tier count and thresholds are a starting point — tune freely.)

### Layout model
The board is a **single relevance-ordered flow** — not a grid, not a list, and not a packed blob. Bubbles are laid out **most-relevant-first** — top-left, flowing and wrapping down the viewport — with **size from tier**. Relevance is therefore double-encoded: reading order (first/top = most relevant) *and* size both point at the same thing, which is what makes the hierarchy legible at a glance with no spatial memory.

- The **Hero** is first and effectively full-width: a wide rounded panel showing the living summary.
- **Active** and **Medium** bubbles flow and wrap beneath it, larger first, packing to fill the width.
- **Dormant** circles are smallest and fall to the end of the flow; collapse them behind a "more / dormant" affordance so they don't clutter the glance. They're reached mainly via search anyway.
- **Reflow animates** (FLIP / layout animation): when a Space changes tier it visibly grows or shrinks and moves to its new place in the order — the "watch Big Move rise and grow as the date nears" effect. The motion is information.

**Buildable starting point:** a flex-wrap (or CSS grid with row-spanning) of rounded elements sized by tier, ordered by descending relevance, with a layout-animation library handling the transitions. That is enough to ship a working, spec-true v1. The one genuinely fiddly part — packing *mixed* bubble sizes prettily with minimal gaps — can begin as simple wrapping and later upgrade to a justified-rows or masonry pack if the simple version looks too uneven. **Do not** reach for a force-directed/physics layout (non-deterministic positions fight the legibility requirement) or a treemap (rejected — hard rectangles). The layout *model* here is decided; only the visual polish of the packing is open.

### The peek / open interaction
- Tapping a bubble opens a **peek**: the Space's living summary, shown in place.
- "Open fully" lives *inside* the peek, for when the user wants the whole Space.
- The **whole bubble is the tap target.** Do not build a small separate highlight target for reading — it's fiddly on mobile.
- **Reading discharges the glow** (see §4).

---

## 4. The relevance engine

Keep this engine **separate from the layout**: it produces a relevance score per Space from a small set of legible rules; the layout is then a pure function `(spaces, scores) → tiers, positions`. The two can be built and tested independently, and relevance stays inspectable.

**Keep relevance deterministic. Do not let the AI drive position.** It is tempting to have the AI quietly reorder the board ("the user seems stressed about the move"). Do not. Opaque reordering destroys the trust the whole board rests on. The user should always be able to predict *why* a bubble sits where it does. **AI owns capture and content; dates, pins, and recency own position.**

### The four signals

1. **Date/time proximity** — the strongest signal. A Space with an upcoming event/`date` block rises as the date approaches, peaks on the day, then decays and prompts archiving.
2. **Recency of capture** — newly added content boosts a Space temporarily; the boost decays over a few days on its own.
3. **Manual control** — a first-class, one-tap **pin/boost**. Because the app has very little context about what the user is actually doing right now, *the user is often the best available signal.* Treat manual boost as a primary input, not a fallback.
4. **Task age** — an uncompleted task's contribution *grows* with time-since-created (see the task/permanent split in §2).

### Charge / discharge (this resolves the "access" question)
"Recency of info added" and "access/reading" are the same mechanic seen from both ends — salience going up, then coming back down. Model them as **two separate things**:

- **`unread` flag** (boolean, per Space): set `true` on new capture; set `false` when the user peeks/reads. This **drives the glow**, nothing else. Purely binary — no scoring ambiguity.
- **recency boost** (a decaying term in the score): based on time-since-last-capture; decays over ~3–7 days *regardless of whether the user has read it.*

Why separate: raw access-recency has an ambiguous sign — "I just glanced at this" could mean *keep it warm* or *I'm done with it.* So access is deliberately **not** a position driver. Its only job is to let the user cheaply clear the "there's something new here" glow without fully opening the Space. Glow handles "new"; manual pin handles "keep this warm"; deterministic terms handle size.

### Scoring sketch (illustrative — tune the constants)
A Space's score derives from its **hottest block**, plus space-level terms:

```
relevance(space) = w_pin * pin_weight
                 + recency_boost(space)            // decays over days
                 + max_block_urgency(space)        // dispatched by block type:

  date/event block  → rises as event_date nears, peaks on the day, decays after
  task block, due   → date curve, AND escalates if overdue
  task block, no due→ escalates with age-since-created (time-left-uncompleted)
  fact / note       → low flat baseline; does NOT escalate with age
```

The result maps to a tier via thresholds. A Space's prominence tracking its hottest block is what makes an escalating task *inside* Big Move push the whole Big Move bubble up. Standalone tasks/notes are their own `standalone` Spaces and surface as small bubbles.

---

## 5. Capture (two deliberate paths)

Both paths are first-class. This is a requirement, not an optimization.

- **Fast dump** — one always-available box (and, ideally, voice). The user dumps raw text: *"remind me to call the dentist / Sarah's allergic to shellfish / cast iron doesn't go in the dishwasher."* The AI proposes a target Space (existing or new), a block type, and structured content. The user confirms or redirects in a single tap. **Critically: the AI auto-files immediately to a good-enough home. Nothing is forced to sit in a triage queue.** A mandatory inbox would recreate the overflowing-list failure mode. Reorganizing later stays *optional* (it aids the user's recall via the generation effect) but is never required.
- **Manual** — open a Space and add a block directly. This is not a fallback. Placing information by hand encodes it (the generation effect), which directly compensates for the weak auditory channel. It is a memory-building ritual and must be fast and pleasant.

**Voice** (optional for the first pass): the Web Speech API is available in the PWA for speech-to-text, or record-and-send. Text box is sufficient to start.

### AI capture contract
The Worker proxy (see §6) calls the Claude API with the raw dump and a list of existing Spaces, and returns JSON the client can act on, roughly:

```json
{
  "target_space": { "existing_id": "..." } | { "new": { "title": "...", "type": "project|person|reference|standalone" } },
  "block": { "type": "fact|task|checklist_item|note|contact|date",
             "content": { ... },              // shape depends on type
             "due_date": <epoch ms | null>,
             "event_date": <epoch ms | null> },
  "confidence": 0.0-1.0
}
```

Low confidence → present the proposal more tentatively / offer alternatives. The user always gets a one-tap confirm-or-redirect; never auto-commit silently on low confidence.

---

## 6. Living summaries

The payoff of surfacing is the right **content**, not just the right bubble. Each Space carries an AI-maintained **living summary** — a short, glanceable digest of the most important things in it right now. The Hero bubble shows this summary so that *checking the app is reading, not navigating in.* This is what lets a dense Space stay usable in a five-second glance instead of becoming a wall to re-read.

Implementation: **cache the summary on the Space; regenerate it when the Space's blocks change** (not on every open — cheaper and faster, and the summary only needs to change when content does). Store it in the `spaces.summary` column.

For the first pass you may start with a **deterministic heuristic summary** (e.g. the most-urgent / most-recent N items) to validate the board layout *without* the AI dependency, then swap in AI-generated summaries in phase 2. The layout should not block on the AI being wired up.

---

## 7. Search

Targeted retrieval of a specific dormant Space is a **search** problem, not a spatial-memory one. Provide fast full-text search across Space titles, block content, and summaries. This is what covers "I need that one thing I filed weeks ago" — the board surfaces the common case; search covers the targeted case.

---

## 8. Architecture (Cloudflare; user is already set up and has a Claude API key)

- **Pages** — hosts the PWA frontend.
- **Workers** — the API layer *and* the Claude proxy. **The Claude API key lives as a Worker secret and never appears in client code.** This same Worker is reused unchanged when the app is later wrapped natively, so the AI layer ports for free.
- **D1 (SQLite)** — the data store. Because it's server-side, the schema survives the PWA→native port untouched. Schema (starting point):

  **`spaces`**: `id` (text/uuid), `title`, `type` (`project|person|reference|standalone`), `lifecycle` (`active|pinned|archived`), `pin_weight` (real, default 0), `summary` (text, nullable — cached living summary), `unread` (int 0/1 — glow flag), `created_at`, `updated_at`, `accessed_at` (epoch ms).

  **`blocks`**: `id`, `space_id` (fk), `type` (`fact|task|checklist_item|note|contact|date`), `content` (text/JSON), `completed` (int 0/1, nullable), `due_date` (epoch ms, nullable), `event_date` (epoch ms, nullable), `sort_order` (int), `created_at`, `updated_at`.

  **Schema rationale:** fields the *relevance engine queries* (`completed`, `due_date`, `event_date`, `pin_weight`, timestamps, `unread`) are promoted to real columns so the engine never parses JSON; everything else lives in the flexible `content` JSON so block shapes can evolve without schema churn.

- **R2** — only if/when images or voice memos are added later. Not needed for the first pass.
- **Auth** — it's a single user. Keep it trivial (Cloudflare Access, or one bearer token). **Do not overbuild auth.**
- **Relevance** — computed on read when the board mounts (§3). No Cron Triggers.

### PWA → native path (validated, with one honest limit)
- A PWA validates **almost everything**: the Space model, both capture paths, the board and relevance engine, the peek interaction, AI routing, offline, and install-to-home-screen as an app icon.
- A PWA **cannot** render a true Android home-screen *widget* — only an app icon. That one piece is unvalidatable as a PWA and is the sole reason to go native.
- **Capacitor** is the recommended wrap: it carries essentially all of the web UI over, and a native **Kotlin widget** is then added that reads shared storage. The widget is net-new native work either way; nothing else is thrown away.
- The widget is just a **mini-render of the board**: the top 1–3 Hero Spaces with their living summaries. Design it as a read-only projection of the same data.
- **Design the schema deliberately now** (done above) so it survives the port, and keep the Worker as the single AI/data backend so it's reused unchanged.

---

## 9. Recommended build phases

Folding the AI into the first build (per the decision to include it from the start) collapses this to **the full app as a PWA, then a native wrap.** Still sequence *within* Phase 1 so the deterministic core is working before it depends on AI output.

- **Phase 1 — the working app (PWA).** D1 schema; both capture paths — manual (create Space, add/edit/complete blocks) *and* AI fast-dump through the Worker proxy with the JSON contract and one-tap confirm/redirect; the board with tiered rounded bubbles, the deterministic relevance engine, on-open snapshot, and animated reflow; the peek interaction; glow/discharge; archive; search; and AI-generated living summaries (cached, regenerated on change). **Suggested internal order:** stand up the schema and the deterministic board with **manual capture and heuristic summaries first** so the core interaction can be validated, *then* wire the Worker proxy and swap in AI capture and AI summaries — the layout must never block on the AI being connected. Voice capture (Web Speech API) is optional here. **The Claude API key is a Worker secret from day one — never in client code.**
- **Phase 2 — native + widget.** Wrap with Capacitor; build the Kotlin home-screen widget as a read-only mini-render of the board's Hero tier.

---

## 10. Anti-patterns — do **not** do these

These are counterintuitive and earned through design discussion; an implementer will reach for several by default. Resist them.

1. **Do not make this a notification / reminder / timer app.** Surfacing is visual and on-open. Timers are a deliberately minor side-feature; the user often can't respond to a prompt in the moment.
2. **Do not let the AI drive relevance or board position.** Relevance is deterministic and inspectable. AI owns capture and content only.
3. **Do not optimize for positional stability or fixed layouts.** Reflow is fine and good — just animate it. Navigation is not the user's problem.
4. **Do not use hard rectangular cards or a treemap of squares.** Rounded squircles/circles; shape encodes state.
5. **Do not force captured items into a mandatory inbox/triage queue.** Auto-file to a good-enough home; reorganizing is optional.
6. **Do not give tasks and permanent facts the same time-curve.** Tasks escalate with age; permanent information must not get louder with age.
7. **Do not make "access/reading" a position driver.** It only clears the glow (its sign is ambiguous as a size signal).
8. **Do not build a daily cron for relevance.** Compute on open.
9. **Do not put the Claude API key in client code.** It lives as a Worker secret.

---

## 11. Open questions / where there's latitude

The implementer (and the user) should feel free to iterate on: the exact tier count and thresholds; the relevance constants and decay curves; the visual polish of how mixed-size bubbles pack (the layout *model* is decided in §3 — relevance-ordered flow with size from tier; the justified/masonry refinement over the flex-wrap starting point is the part that's open); the visual language of glow and animation; and the block-type taxonomy. The §10 anti-patterns and the §2 task/permanent split are the load-bearing constraints — most other specifics here are a sound starting point meant to be tuned against real use.
