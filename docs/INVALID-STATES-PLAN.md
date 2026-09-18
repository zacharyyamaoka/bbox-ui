# Invalid states — the diagnostic axis and its marks

**Status: proposal, nothing implemented.** Zach's ask (2026-09-17, vault:
`Projects/bbox-ui/PROJECT - Black Box UI.md` § *Invalid states, and linted
warnings*): the linters *detect* — types, multiple edges into one port —
but nothing says what a wrong thing *looks like*. That is a
presentational-component concern. His constraint: **no new components if
possible — "maybe you may need a couple but could be mostly styling."**
His reference: the VS Code diagnostic hover (squiggle → popup with message,
rule id `Ruff(F407)`, an action button, View Problem / Quick Fix links).

Rendered mocks of everything below:
`/home/bam/bbox-ui/reports/media/invalid-states-proposal-2026-09-17.html`
(built by `docs/build_invalid_states_report.py`). This file is the spec of
record for an implementing lane; the report is the review surface.

---

## 1 · The axis: `diagnostics`, orthogonal to `state`

`PortState` today is `"empty" | "valueSet" | "wired" | "received"`
(`apps/storybook-basics/src/components/port.tsx:37`) — **semantic** states,
"what is in the port." A diagnostic is a *judgement about* the port, made
by an external producer (the linter), and the two are simultaneously true:
the canonical lint — **two producers into one port** (Zach's own example;
the exclusivity rule in `PROJECT - pyblocks` § many-to-one) — can *only*
fire on a `wired` port. If `"error"` were a fifth `PortState`, marking the
port would erase the very fact the lint is complaining about.

The file already models this split twice: `dimmed` and `hinting` are
deliberately booleans beside `state`, not rungs of it, because neither is
"a fact about what the port IS" (`port.tsx:169-181`; the donor's fuller
argument at `packages/bbox-ui/src/appearance.ts:20-29`). The diagnostic
axis is the third instance of the same rule.

```ts
// The closed set. Three members, like the skin table's fixed 15 tokens
// (src/skin/skin.ts:89) — an open-ended set of marks degenerates into a
// pile of per-callsite overrides.
export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  /** Stable, producer-owned. Appendix B records the cost of not having
   *  one: maxGraph's `setCellWarning(cell, null)` deletes EVERY overlay
   *  on the cell, and per-item identity is what prevents that. It is
   *  also what lets a host diff the list per item (JointJS's `list`
   *  highlighter skips `createListItem` for unchanged entries). */
  id: string;
  severity: DiagnosticSeverity;
  /** One-line human explanation — the FR's "text explanation for what
   *  the issue is" (FR - Block, Ports & Edges Primitive § Linting/Error
   *  state). Optional: a mark can render before its prose exists. */
  message?: string;
  /** Rule id — VS Code's `Ruff(F407)` slot. */
  code?: string;
}

// On each mark-bearing component:
diagnostics?: Diagnostic[];  // absent or [] = no mark. Never persisted —
                             // the producer re-derives it, same contract
                             // as `received` (appearance.ts:43-49) and
                             // `dimmed`/`hinting` (host-computed).
```

Deliberately **not** in the set: `"hint"` (VS Code has it; no producer of
ours does — add it the day one exists), and any `diagnosticColor` escape
hatch (severity → token is the component's own mapping, exactly like
`STATE_TOKENS`, `port.tsx:53`).

**One mark, N messages.** A list per element, and the chrome is painted
once at `max(severity)` — so every rule in §3 and every row in §5 reads
the max instead of the only one. A component still carries no *contested*
policy: max-severity-for-the-chrome is what VS Code, maxGraph and JointJS
all do, and §5's interaction contract is already declared IDE-shaped.

This reverses an earlier draft of this section, which specified a singular
`diagnostic` and made merging the producer's job. Two things killed it.
§5 promises a Popover with "the full anatomy", and a producer that has
already merged N findings to one has destroyed the rest — the popover can
then only ever show a single finding. And the badge carries a **count**
(Vyuh's status badges, maxGraph's `containsValidationErrors`), which a
scalar cannot render at all. Three independent library designs converged
on N-marks-per-element (Appendix B's convergence table) and a peer
session reading the same docs reached the same conclusion; ours is the
only one of the four with stable ids, so ours is the only one that can
diff the list instead of rebuilding it.

## 2 · Tokens: three, ported not invented

The donor package already names these colours —
`packages/bbox-ui/src/theme.css:28-31`: `--bbox-warning: oklch(0.65 0.16 85)`,
`--bbox-danger: oklch(0.55 0.19 25)`, `--bbox-accent: oklch(0.60 0.19 264)`
(dark: `0.80 0.15 85` / `0.72 0.17 25` / `0.70 0.17 264`,
`theme.css:79-89`). `apps/storybook-basics/src/globals.css` deliberately
does not import theme.css and instead ports the tokens it needs one by one
(`--bbox-primary`/`--bbox-received`, `globals.css:137-138` — the stated
pattern). Implementation ports three more the same way:

| severity | token | fallback at the call site |
|---|---|---|
| `error` | `--bbox-danger` | `var(--destructive)` |
| `warning` | `--bbox-warning` | none needed (always defined once ported) |
| `info` | `--bbox-accent` | none needed |

## 3 · Channel discipline — what a diagnostic may paint

Four orthogonal appearance axes exist or are planned on these components:
`state` (semantic), `skin` (shape language), the comparison lane's diff
marks, and this `diagnostics`. They stay composable because each owns
disjoint CSS channels:

| axis | owns | file evidence |
|---|---|---|
| `state` | the dot's ring/fill/core colours, badge variant colours | `port.tsx:53-58,102-159` |
| `skin` | border width/colour slots, radius, font, the *resting* shadow | `src/skin/skin.ts:89-118` |
| diff (comparison lane) | fills/washes, chips, ghosts, token-level ink — their vocabulary, their names | `systemsketch/src/diff/diffPresentation.ts` traits |
| **`diagnostics`** | **outer halo (box-shadow layers prepended), the corner flag, the wavy underline, the cable backdrop, the popover** | this plan |

A diagnostic never recolours a state ring, never tints a surface, never
touches a border the skin owns. That is what lets "changed AND broken" —
the comparison view's most important cell — render both marks at once.

## 4 · Inventory: mark → carrier → what's new

Every mark Zach listed, against what already exists:

| mark | rendered by (exists today) | new prop or new component |
|---|---|---|
| colour change | Port's `portRingColor`/`portDotStyle` (`port.tsx:102-144`); Badge `variant="destructive"` (`badge.tsx:36`) | **prop** — a `diagnostics` branch in the existing style fns |
| halo behind a Port dot | the `hinting` halo layer — `0 0 0 9px color-mix(in srgb, … 38%, transparent)` (`port.tsx:127-129`) | **prop** — same geometry, severity token |
| red halo / drop shadow behind a Block | Block's shadow seam — `box-shadow: var(--bbox-skin-shadow, …)` (`block.tsx:158`) | **prop** — prepend a glow layer; composes with every skin |
| red backdrop on cables | Trace's hit-path twin — a wider sibling path on the same geometry (`trace.tsx:131,311`) | **prop** — a translucent backdrop path; stroke keeps its variant dash/colour |
| warning icon top-right of a Block, click → message | `Glyph` (lucide `triangle-alert`/`octagon-x`/`info`) + Badge for the rule id + a click popup | **2 new** — see below |
| red wavy underline, editing text | CodeEditor + `@codemirror/lint`'s `setDiagnostics` (stock squiggles) | **prop** (`diagnostics` ranges) + **1 new dependency**, 0 new components |
| red wavy underline, resting text | EditableText / LabeledPort's rest span — CSS `text-decoration: underline wavy` | **prop** |
| hover message (rich body) | `Tooltip` — `TooltipContent` renders arbitrary children (`tooltip.tsx:33,60`), not text-only | none |
| rule-id chip | `Badge` `size="sm"` `variant="outline"` (`badge.tsx:43-46`) | none |

**Genuinely new components: 2.**

1. **`popover.tsx`** — the stock shadcn Popover over Base UI's Popover
   primitive, copied the same way `tooltip.tsx` and `dropdown-menu.tsx`
   already were (their headers state the provenance routine;
   `@base-ui/react` is already a dependency, `package.json:15`). Needed
   because *click-to-open* is not stylable onto either existing popup:
   `Tooltip` opens on hover/focus only, and `DropdownMenu` imposes menu
   semantics (`role="menu"`, arrow-key item navigation) that are wrong for
   a document-like diagnostic panel. A verbatim vendor copy is the
   smallest honest unit here.
2. **`DiagnosticFlag`** — the ~50-line composition Zach described: a small
   round chip bearing the severity Glyph, wired as a Popover trigger; the
   popover body lays out message · `code`-Badge · a host `actions` slot ·
   host footer links (the VS Code hover anatomy). One component rather
   than three inlined copies because Block's corner, LabeledPort's
   secondary slot and TraceBadge all want the identical flag.

Everything else on the list is styling behind the one `diagnostics` prop —
inside Zach's "maybe a couple" budget.

## 5 · Per component

Where a component shows **nothing**, that is the spec, not an omission.
`info` follows SystemSketch's rule — *"a note is not a mark, and painting
every informational finding is how a board loses the ability to look
calm"* (`systemsketch/src/diagnostics/diagnosticsModel.ts:58-62`) — so at
board scale `info` marks only text, never chrome.

| component | error | warning | info | carried by |
|---|---|---|---|---|
| **Port** | halo ring in `--bbox-danger` (the `hinting` geometry, `port.tsx:127-129`); state ring/fill untouched | same halo in `--bbox-warning` | nothing | `diagnostics` prop → one extra box-shadow layer, painted at `max(severity)` |
| **LabeledPort** | dot halo + wavy underline under the label text | dot halo (amber) + wavy underline | dotted underline in `--bbox-accent`, no halo | forwards `diagnostics` to its Port; underline on the rest span; `DiagnosticFlag` may ride the existing `secondarySlot` (`labeledPort.tsx:262-265`) with zero new placement math |
| **Block** | glow behind the card (`0 0 0 1.5px` danger + `0 0 18px` wash, prepended to `block.tsx:158`'s layer list) + `DiagnosticFlag` at top-right, straddling the corner the way wall ports straddle walls (`blockPort.tsx`) | flag only — no glow; warning must not shout | nothing | new `diagnostics` prop on Block; the flag carries a count when the list is longer than one |
| **PortEdge** | nothing on the rail itself | nothing | nothing | `PortEdgeItem` (`portEdge.tsx:89-93`) grows `diagnostics?`, forwarded to the LabeledPort it renders — the port is the subject, the rail is furniture |
| **Trace** | translucent backdrop path under the wire (~10px, `color-mix` 30%), same geometry as the hit path; the stroke keeps its variant colour/dash so `data`/`async`/`delayed` stay legible | same, amber | nothing | `diagnostics` prop → one extra `<path>` at `max(severity)`; message rides `TraceBadge` in severity dress at `labelPosition` |
| **CodeEditor** | wavy squiggle under the offending range (`@codemirror/lint` `setDiagnostics`) — red | amber squiggle | blue squiggle | new `diagnostics?: {from,to,severity,message}[]` prop; whole-field error also sets the existing `ariaInvalid` (`codeEditor.tsx:130`) |
| **EditableText** | wavy underline on the rest span; the editing control inherits it | amber wavy | blue dotted | `diagnostics` prop → `text-decoration` styling only |
| **Badge** | `variant="destructive"` — exists today (`badge.tsx:36`) | new `variant="warning"` — one cva row, amber bg, dark text | `variant="secondary"` — exists | one variant addition; no new component |
| **ValueCapsule** | pill glow (free — it renders Block, `value.tsx:142`) + squiggle across the invalid span of the expression | amber glow | nothing | `ValueCapsuleProps` grows `diagnostics?`, forwarded to Block and to the CodeEditor range; **no flag** — a capsule is too small, the glow is the beacon and the message rides a hover Tooltip |

Interaction contract, IDE-shaped: **hover** any marked text/dot → Tooltip
with message + code (no actions — a hover must be glanceable); **click**
the flag → Popover with the full anatomy including the host's `actions`.
Popups are components in this kit, per Zach's ruling — "the pop-up is not
an editor," so none of this belongs to editor-components.

## 6 · One vocabulary, two producers — but two props

SystemSketch runs diff marks and lint marks through ONE `state` prop
(`BLOCK_STATES = ['normal','added','removed','changed','error','warning']`,
`systemsketch/src/blocks/blockModel.ts:214`) with
`diagnosticSeverityState()` mapping severity into it
(`diagnosticsModel.ts:64-68` — "one state vocabulary on the primitives,
two producers"). The donor package made the same call as `Lens`
(`packages/bbox-ui/src/appearance.ts:124`) — currently rendered only as a
`data-lens` attribute, no paint (`port.tsx:854-857`, core package).

This kit should keep the shared *severity vocabulary and tokens* but split
the *props*:

- **For** one axis: one mark system, guaranteed visual calm, one thing to
  learn.
- **Against** it, and decisive here: (1) a single enum makes
  *changed-AND-broken* inexpressible, and that joint state is exactly what
  a comparison view exists to show — a change that introduced the error.
  (2) It forces the host to merge two producers *before* the component, so
  every host reimplements precedence. (3) SystemSketch's own record shows
  the coupling cost: the diff producer landed, and "the lint producer is
  not wired to paint" (`PROJECT - System Sketch` § the round-4 findings) —
  a shared axis serializes two lanes that have no reason to wait on each
  other. (4) The IDE precedent composes, it does not exclude: a line in
  VS Code carries a git gutter decoration *and* a squiggle at once.

Visual calm is preserved by §3's channel discipline and §5's severity
flattening, not by mutual exclusion.

**What this axis needs from the comparison lane** (their states stay
theirs to name — nothing here constrains the names): their marks keep to
the fill/wash/chip/typography channels and stay off outer box-shadows,
corner flags, wavy underlines and cable backdrops; where both lanes need
severity ink they use the same three `--bbox-*` tokens; and when both
mark one element, the diagnostic halo renders outside their outline.

## 7 · Stock parts, element by element

| element | today | off-the-shelf part (exact name) | behaviour that must survive |
|---|---|---|---|
| hover message | none | `Tooltip`/`TooltipContent` (`@base-ui/react/tooltip` via `tooltip.tsx`) | rich children; glanceable, no actions |
| click popup | none | `Popover` (`@base-ui/react/popover`, via a new stock `popover.tsx` copy) | click-open, Escape/outside dismiss, no menu semantics |
| editor squiggle | none | `setDiagnostics` / `linter` (`@codemirror/lint`) | per-range severity, message carried to hover |
| resting-text squiggle | none | CSS `text-decoration: underline wavy` (no library) | label text metrics unchanged; underline only |
| halo / glow | `hinting`'s halo layer (`port.tsx:127-129`) | plain `box-shadow` layers (no library) | state rings keep their colours; skins keep their shadow slot |
| severity icon | none | `lucide-react` `octagon-x` / `triangle-alert` / `info` via `Glyph` | resolver-context pattern (`glyph.tsx`) — no new icon plumbing |
| rule-id chip | none | `Badge` `variant="outline" size="sm"` | authored characters rendered verbatim |
| **unchanged (stock seam)** | `PortState` enum (`port.tsx:37`), `STATE_TOKENS` (`port.tsx:53`), skin token table (`skin.ts:89`), Trace variant dashes (`trace.tsx`) | — | untouched by this axis, by design |

## 8 · Deliberately not in scope

- **The linter engine** — external, per Zach's ruling and the SystemSketch
  governing call ("no linting by default… anything that can be *wrong*
  lives on the Python side").
- **Gutter marks, overview ruler, Problems panel** — editor-chrome-scale
  surfaces; this kit stops at the component-scale marks.
- **Persistence** — `diagnostics` is never written to a document, same as
  `received`/`dimmed`/`hinting`.
- **Naming the diff states** — the comparison lane's call; §6 states only
  the composition contract.
- **Owed to the editor-component kit** (2026-09-18, "final spec" lane,
  ruling 9): an IDE-style issue navigator over `LintFinding[]`/
  `SurfacedFinding[]` — gutter, overview ruler, click-to-next-issue — Zach:
  "like the IDE, where you can quickly click to any of the issues."
  `src/scene/bubble.ts`'s `surfaceFindings` is what such a navigator would
  read; not built in this wave.

---

## Appendix — JointJS highlighters, and the one gap they expose

Zach, 2026-09-17: *"here is a cool reference that we should support:
<https://docs.jointjs.com/learn/features/highlighters/>"*

Fetched and read rather than recalled. JointJS ships **five** highlighter
types, and the correspondence with what this plan proposed independently is
close enough to be worth stating — two designs reaching the same
decomposition from different directions is evidence the decomposition is the
domain's, not ours:

| JointJS | What it does | This plan's equivalent |
|---|---|---|
| `addClass` | applies a CSS class to the element's SVG node | how the skin system already works (`data-bbox-skin` + tokens) |
| `opacity` | changes the node's opacity | `dimmed` — already exists, `port.tsx:169-181` |
| `mask` | stroke outline via SVG masking, **equidistant padding** | the halo |
| `stroke` | the same outline, cheaper and less precise | the halo's fast path |
| `list` | arbitrary SVG overlaid — their stated use case is status badges | `DiagnosticFlag` |

**Three things worth taking, beyond the validation.**

1. **`mask` vs `stroke` is a real trade-off, and they document which is
   which.** `mask` gives a genuinely equidistant outline around an arbitrary
   shape — hard to hand-roll, which is why they reach for SVG masking — at a
   performance cost. `stroke` is the cheap approximation. A `box-shadow`
   halo is closer to `stroke`: fine on a rectangle, wrong on a capsule or a
   cable. Since this kit has both (the Value preset is a pill, traces are
   paths), plan for the mask technique where the shape is not a rectangle,
   and say which each component uses.

2. **Highlighters target a SELECTOR, not the element.** `{ port: 'port-id' }`
   marks one port of a node; a markup selector marks a sub-shape or a label.
   That is the same conclusion this plan reached from the other end — a
   diagnostic is a judgement *about* something, addressed to it — and it
   means the mark must be addressable at `portKey(nodeId, portId)`
   granularity, which the scene kit already has (`scene.ts:145`).

3. **THE GAP — now closed: JointJS holds N highlighters per element, added
   and removed by id.** An earlier draft of §1 proposed a single
   `diagnostic` prop, one mark per component, so a block with a type error
   *and* a duplicate-edge warning could not be expressed. That was not
   hypothetical — both are on Zach's own lint list. §1 now specifies
   `diagnostics?: Diagnostic[]` with an `id`; this paragraph is what
   changed it, and Appendix B's convergence table plus a peer session's
   independent reading of the same libraries both agreed.

   So the prop should take a **list**, not a scalar, and each entry needs a
   stable id so a producer can add and remove its own marks without
   disturbing another producer's. That matters because the plan already
   establishes there are two producers (lint and diff) sharing one visual
   language: without ids they would clobber each other, which is precisely
   the failure the split-props decision exists to prevent.

   Severity then resolves per-element for the summarising marks (a halo shows
   the worst severity present) while the flag popover lists all of them —
   which is also what the VS Code hover does when several diagnostics overlap
   a span, and Zach's reference screenshot is that hover.

**Not taken:** JointJS's imperative `add(cellView, selector, id, opts)` API.
This kit is declarative — props in, DOM out — so the equivalent is a list
prop whose entries carry the id, not a registry the caller mutates.

---

## Appendix B — three libraries read, and what they change

Zach, 2026-09-17: *"I feel actually there are so many ideas out there
potentially we could use for showing error states, linting. Can you scrape
these to see if there are other ideas we can take?"* — maxGraph, JointJS
(deeper than the highlighters page), and Vyuh Node Flow. Read, not recalled;
every claim below carries the API name it came from.

### The reframe, which matters more than any single feature

**All three libraries spend their budget on PREVENTION; this plan spends its
budget on ANNOTATION.** They validate at drag time and, having refused, show
nothing at rest — JointJS core has no in-place error decoration at all, and
Vyuh has no diagnostics model whatsoever. Neither stance is wrong: prevention
suits an editor that owns every mutation, annotation suits a *linter*, which
by definition reports on state that already exists and was not necessarily
created by a gesture.

But they are complements, not alternatives, and we currently have only one.
**Adopting the prevention layer converts most would-be diagnostics into
non-events**, which is strictly better than rendering them well.

### What three independent designs agreed on — take these

| Convergence | Where | Our position |
|---|---|---|
| A mark on an edge is addressed by a **1-D coordinate along the path** | maxGraph `x ∈ [-1..1]` + orthogonal offset; JointJS `distance` (px, `'50%'`, **negative counts from the END**) + `offset` + `rotate` | We have **no** along-path addressing. Adopt it — and the negative form pins a diagnostic at the *broken end* of a dangling edge, which is our hardest case. |
| The badge sits at a **corner, half outside the box** | maxGraph `defaultOverlap: 0.5`; JointJS `Button` `x:'100%'` / `calc()`; Vyuh "top-right, -8px offset" | Confirms `DiagnosticFlag`'s placement. Three traditions converged; stop deliberating it. |
| **N marks per element** | all three | Only ours has **stable ids**. maxGraph's `setCellWarning(cell, null)` deletes *every* overlay on the cell — the exact clobbering our ids prevent. |

### Genuinely new — ranked by what they change

1. **Three-valued refusal, carrying its own message.** maxGraph's
   `getEdgeValidationError` returns `null` (valid) / `''` (**invalid but
   silent**) / `"message"` (invalid and explained) — *"for empty error
   messages, the event is silently dropped."* Vyuh independently shaped the
   verdict as a value object, `deny(reason:, showMessage:)` — then never
   consumed it (verified in their source: `reason` is dropped on the floor).
   **Combine them:** a refusal severity axis *independent* of diagnostic
   severity, where the explained case carries the same message vocabulary the
   at-rest diagnostic uses. Vyuh declared this loop; nobody has closed it.
2. **Show the legal move set during the gesture.** JointJS `markAvailable`
   paints every valid target the instant a drag starts, and `snapLinks` pulls
   only toward valid magnets — validity as *physics*, not colour. Rejection
   then shows nothing because invalid targets were never attractive. This is
   the prevention layer, and it is the single strongest thing we lack.
3. **Errors bubble through folds.** maxGraph's `containsValidationErrors`:
   a collapsed group whose hidden children failed wears its own badge. Blocks
   collapse here and nothing in this plan covers error visibility across a
   fold.
4. **Motion as a severity channel.** Vyuh sets a per-edge runtime effect
   (`PulseEffect`, `FlowingDashEffect`) — their own example variable is named
   `criticalConnection`. Orthogonal to colour, so it survives colour-blindness
   AND remains legible zoomed out, where a thin red stroke does not.
5. **A zoom policy for marks.** Vyuh's LOD tiers hide labels and ports below
   thresholds. A wavy underline and a corner flag are full-detail chrome that
   vanish exactly when a zoomed-out overview most needs to show where the
   problems are. **State which marks survive each tier — error indication
   should be the last chrome to go.**
6. **Dual-channel validity.** maxGraph's connect preview is green *and* 3px
   for valid, red *and* 1px for invalid. Validity survives colour-blindness
   with no extra thought.
7. **`focusOpacity`** (JointJS `dia.ToolView`) — while one mark is engaged,
   the siblings dim. Cheap, and it solves the crowded-element case.
8. **Our own list design, finished.** JointJS's `list` highlighter **binds to
   a model attribute** and diffs **per item** — `createListItem` is not called
   for unchanged entries. That is this plan's diagnostics-array-with-ids as a
   rendering contract, plus an optimisation we had not specified.
9. **`mask` with `deep: true`** falls back to `getBoundingClientRect()` when
   the target is HTML inside a `foreignObject` — they solved halo-ing
   DOM-in-SVG, which is exactly this kit's rendering situation.

### Confirmed gaps — nobody has these, so they are ours to invent

- **No invalid-PORT rendering anywhere.** maxGraph's `ConstraintHandler`
  highlights only *valid* points; Vyuh's port highlighting is positive-only
  and its in-flight cable carries no validity state at all. Ports are where
  Zach says the key interactions live, and there is no prior art.
- **No gutter, minimap summary, or dim-the-valid focus mode** in any of the
  three. "Where are my errors on a board I cannot see all of" is unanswered.
- **At-rest invalid edges** are weakly served everywhere. JointJS's
  `linkPinning` defaults to *true* — a dangling end is a legal state, which
  supports the `drop | dangle | park` decision already taken here — but
  nothing renders it as diagnosed.

### The contradiction Appendix B exposed — and §1 lost

Appendix B's convergence table (*"N marks per element — only ours has
stable ids"*) and item 8 (*"this plan's diagnostics-array-with-ids"*) both
describe a list. §1 as first drafted specified a scalar. They cannot both
be true, and **the appendix was right**: §1 has been amended to
`diagnostics?: Diagnostic[]` with an `id`, and the reasoning now lives
there rather than here.

What does *not* change is where the ranking sits. The component reads
`max(severity)` for its chrome and shows every message in the popover; a
producer that wants to suppress, group or re-rank its own findings still
does that before handing the list over. The distinction is only that it
hands over a list it may not have pre-collapsed.

### Deliberately not taken

maxGraph's `validationAlert` (a `window.alert` by default) and JointJS's
prevent-by-revert `Validator` (paid, and its docs' own example logs to the
console). Both replace in-place annotation with a modal or a revert, which is
the stance this plan exists to reject.
