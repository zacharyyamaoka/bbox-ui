# Port → LabeledPort → PortEdge plan (2026-09-16)

Source of truth for landing the three port components in `apps/storybook-basics`.
Mirrors the AI comment in the vault note `bbox ui Components.md` (marker
`ai-comment:port-edge-plan-2026-09-16`). Zach's brief: Port is just the circle
("take the most recent design from bbox-ui"), LabeledPort adds the two slots
with wire-safe placement, PortEdge stacks ports with the dnd-lab's
interactions — "this robust port edge that I can place anywhere and get the
desired interactions... we don't need to repeat again!" — plus a multi-line
codefield editor bound to the **port edge** (not the block), vertical
orientations only.

**Headline:** everything Port and LabeledPort need already exists in
`packages/bbox-ui/src` and ports over by the same copy-and-strip move that
produced this app's `TextBox`; the PortEdge interactions exist in the dnd lab
(the best state is one unmerged commit on `claude/dndkit-lab`); and the
multi-line lines-are-ports editor **exists in SystemSketch, not in bbox-ui** —
`reconcilePortLane` + a `multiline` CodeField pinned to the row pitch is that
product's *default* port editor, and porting its reconciliation is the one
genuinely new build in this repo. Nothing below is built.

### Where it actually stands — measured in the tree, not from memory

| Piece | State | Where |
|---|---|---|
| Port geometry | **Shipped, newest design.** `Port` = disc + 2px surface ring + 3px state ring + lit core + 40px hit halo. `hidden` returns `null` — no DOM at all. Diameters sm 8 / md 12 / lg 18, and `PortSize` already admits a bare `number` ("Exact"). | `packages/bbox-ui/src/port.tsx:492-546`, `port.layout.ts:31-32` |
| LabeledPort | **Shipped.** Composite of `Port` + label slot (single-line `CodeField`) + secondary slot, on the unified `SlotOrigin`/`SlotAlign`/offset placement model. Both slots host-overridable (`labelSlot`/`secondarySlot`, present-beats-absent). | `port.tsx:819-1060`, `port.layout.ts:483-670` |
| `portLabelLift()` | **Does not exist any more.** Deleted 2026-09-15 with four siblings; the offset lift is now *structural*: `align: "end"` anchors the label's bottom edge on the dot's centre line and a static `offsetY: -PORT_LABEL_GAP` clears the wire at any label height. The brief's mention of this function is stale. | `port.layout.ts:644-661`; vault marker `bbox-ui-unified-placement-2026-09-15` (the "reference-edge idea" update) |
| PortEdge (core) | **Thin.** A flex lane: `edge`, `layout: "evenly"\|"custom"`, cascades `textLayout` via `cloneElement`, `+N more` row. No dnd, no grouping, no spacing controls. Not the thing Zach means. | `portEdge.tsx:147-183` |
| PortEdge (lab) | **The real richness.** Stage 5 two-edge board on this branch; Stage 6 "Single port edge" — every control on one edge (Row/Column, Auto Distribute/Aligned vs Custom free drag, edge size, Show ports/container/center line, edge-owned Groups syntax, Grouped/Collapsed) — is **one commit further, on unmerged `claude/dndkit-lab`** (`5898ecb`: `SinglePortEdgeStage.tsx` 356 lines + `groupSyntax.ts` 72 lines, `Container.tsx` gains `trackStyleOverride`). | `demos/dndkit-lab/src/*`; `git show claude/dndkit-lab` |
| 4 edges around a box | **Shipped in the lab.** Stage 3 `PortBoard`: one `DndContext` over four containers around a centre block; orientation and polarity are derived from whichever container holds the card. | `demos/dndkit-lab/src/PortBoard.tsx:30-58` |
| Portable edge math | **Already extracted.** `portPlacement.ts` is the lab's `mainAxisPositions`/`computeSlots` re-stated as a zero-dependency per-port placement model (`evenT`, `groupSlots`, auto/custom `t`-vs-`order` flip). Not consumed by any storybook surface. | `packages/bbox-ui/src/portPlacement.ts:1-25,145,379` |
| Multi-line = ports | **Exists — in SystemSketch only.** `formatPortLane`/`reconcilePortLane` (LCS over lines, ids survive moves/edits; a new line is a new port, a deleted line a removed port) + `BlockInlineEditor`'s `portLane` branch: `multiline` CodeField, `lineHeightPx={placement.linePitch}` so lines sit on the rows, caret opens at the clicked line/column. It is the **default** editor there (`portEditor: 'multi-line'`). **bbox-ui has zero consumers of `multiline`/`lineHeightPx`** outside `codeField.tsx` itself — the binding is net-new here. | `systemsketch/src/blocks/portLane.ts:102-176`, `BlockInlineEditor.tsx:386-474`, `portLanePrototype.ts:1-32` |
| CodeField machinery | **Shipped, and already speaks the lane dialect.** `multiline` (Enter = new line, Ctrl/Cmd+Enter = exit), `lineHeightPx` ("pin every line to this height so lines can sit on a host's own rows"), IDE keys (Alt+↑/↓ move line, Shift+Alt copy, Ctrl variants, history), single-line newline guard. | `codeField.tsx:72-78,366-368,386-395,420-428`, `codeFieldGuards.ts` |
| systemsketch vendored copies | **Older — bbox-ui wins.** `src/bboxUi/core/port.tsx` is 687 lines vs 1060, last touched 09-14, pre-split, zero hits for `SlotOrigin`/`slotPlacementStyle`/`secondarySlot`. The drift is one-directional staleness, not divergent product need; production's own dot (`src/blocks/ui/PortDot.tsx`) is a separate tldraw-bound lineage. Confirms "take the most recent design from bbox-ui." | `systemsketch/src/bboxUi/core/`, git dates both repos |
| storybook-basics | The destination. House style: plain props, `cn()`, `data-slot`, no FieldSpec/presets/cascade, no `@bbox-ui/core` import; `TextBox`/`Glyph` were ported by copying and stripping. **No `--bbox-*` tokens** in `globals.css`, and no dnd-kit or CodeMirror in its `package.json` (all already in the workspace lockfile via other packages). | `apps/storybook-basics/src/components/`, `globals.css`, `package.json` |

### The crux — what the reset lane keeps, drops, and rebuilds

The mature `port.tsx` is 1060 lines because it is wired into the
FieldSpec/preset cascade (`resolveField` for `size`→`diameter`/`textSize`,
placement ladders as `PresetSpec`s so the inspector's provenance stays
honest). None of that machinery is *geometry*. The reset components keep the
pixels and drop the schema:

- **Ports over verbatim:** `portDotClass`/`portDotStyle`/`portCoreStyle`
  (minus tone), the ring/halo/core constants, `SlotOrigin`/`SlotAlign`/
  `SlotPlacement`/`slotPlacementStyle`, `TEXT_LAYOUT_AS_PLACEMENT`,
  `SECONDARY_LAYOUT_AS_ORIGIN`, `inwardTextLayout`,
  `defaultSecondarySlotLayout`, `flexOffsetTransform`, `originFlexDirection`.
  The `??`-fallback chain `LabeledPort` already runs at render time
  (`labelOrigin ?? TEXT_LAYOUT_AS_PLACEMENT[textLayout].origin`, port.tsx:901-912)
  IS the preset behaviour with no schema layer — in plain props the
  "materialised default outranks the preset" bug (`port.presets.ts:56-81`)
  cannot exist, because an omitted arg stays `undefined`.
- **Left behind:** `resolveField`, `LABELED_PORT_FIELDS`/`PORT_FIELDS`,
  `PORT_PRESETS` + both placement ladders, `portResolutionSubject`, the
  `size` rung (it exists so a *header* can cascade one size onto its leaves —
  no header in these stories), `tone`/`lens`/`reveal`/`producers`-driven
  badge, `cascadeInto` (the `cloneElement` cascade that white-screened
  /create — port.tsx:76-92's crash history; the reset PortEdge renders from
  data, so the whole family is structurally unreachable), `anchored` (wall
  geometry for real Blocks; the standalone flex pairing is exactly what a
  Storybook specimen is, per port.tsx:204-214's anatomy note).
- **Rebuilt simpler:** the label field. Real cost stated below (D1).

What that costs, honestly: no inspector provenance ("driven by · Right
Offset"), no cascade from a future header, no tone tinting, and no
`producers`-count fallback — the secondary slot is whatever ReactNode the
story passes. All four are re-addable later; none is geometry.

### The contracts

**Port** (`src/components/port.tsx` + `port.layout.ts`, ~150 lines total):

| prop | type | default | sketch state it answers |
|---|---|---|---|
| `state` | `"empty" \| "valueSet" \| "wired" \| "received"` | `"empty"` | Empty · w/ Value Set · Wired (orange ring + orange core) · Data Received (solid green) |
| `dimmed` | `boolean` | `false` | **Out of Focus** — deliberately *not* a fifth state: host-set, composes over the resting paint at 45% with a grey ring, so a dimmed wired port still reads "wired, unfocused" (port.tsx:296-314) |
| `hinting` | `boolean` | `false` | drop-target preview (wears `wired`'s ink + halo) |
| `diameter` | `"sm" \| "md" \| "lg" \| number` | `"md"` | Large/Med/Small rungs; a bare number IS **Exact** — already in the type (`port.layout.ts:32`). The mature repo defers Exact only because no `FieldKind` combines segments+number (`port.fields.ts:150`); plain props have no FieldKinds, so it is free here |
| `hidden` | `boolean` | `false` | **Hidden** — `if (hidden) return null` (port.tsx:503). Genuinely absent: no element, no 40px halo, no pointer events — exactly the sketch's "if you just set 0 opacity it could not be there but still capture mouse clicks" annotation, already honoured |

Colour: state→token table inlined from `appearance.ts:65-70`
(`STATE_TOKENS`), tone channel removed so `toneColor` collapses to
`var(--token)`. Two tokens added to `globals.css`: `--bbox-primary`
(wired orange, `oklch(0.65 0.19 48)`) and `--bbox-received` (green,
`oklch(0.60 0.19 145)`) — without them `wired` paints near-black
(`--primary` in this app's neutral shadcn theme) and `received` paints
nothing. Values copied from `packages/bbox-ui/src/theme.css:21,27`.

**LabeledPort** (`src/components/labeledPort.tsx`, geometry in the shared
`port.layout.ts`): `Port`'s props plus `children` (the one-line label
string), `direction`, `edge` (drives `inwardTextLayout` default),
`textLayout` (the six named placements — the Simple preset), `textSize`,
expert reach-past props `labelOrigin/labelAlign/labelOffsetX/labelOffsetY`
and `secondarySlotLayout` + `secondaryOrigin/Align/OffsetX/OffsetY`,
`labelSlot?`/`secondarySlot?: ReactNode` (present-beats-absent, port.tsx:917-937
— an emptied slot must stay empty, so `!== undefined`, never `??`),
`onLabelWrite`, `placeholder`, `disabled`.

How placement resolves — the part the stories must make visible:

1. `textLayout ?? inwardTextLayout(edge)` — left edge → label flows right,
   top edge → label flows down (`port.layout.ts:193-204`).
2. The named layout is a row in `TEXT_LAYOUT_AS_PLACEMENT`
   (`port.layout.ts:644-661`): `right` = `{origin: right, align: center,
   offsetY: 0}`; `rightOffset` = `{origin: right, align: "end", offsetY:
   -PORT_LABEL_GAP}`. **The offset lifts in Y, never X** — settled in the
   vault (marker `bbox-ui-port-offset-and-slots-2026-09-15`): the wire
   leaves the dot along its own centre line, so extra X distance leaves the
   label impaled, just later. `align: "end"` pins the label's *bottom edge*
   to the centre line so the clearance is height-independent — the fix that
   replaced the computed lift after the real label measured 26.2px where
   `textSize × 1.25` predicted 23.
3. `slotPlacementStyle(placement, dotBox, gap)` emits the CSS; the gap is
   measured from the **painted ring** (`PORT_RING_OVERHANG_PX` = 5, because
   the rings are box-shadow outside the layout box, `port.layout.ts:42-47`),
   label gap 8px, secondary gap 6px.
4. Secondary slot defaults to the corner **opposite** the label
   (`defaultSecondarySlotLayout`, `port.layout.ts:317-330`).

Both slots are "real slots" in /create's instance-tree sense (deletable
members — Zach's overrule, vault marker `bbox-ui-port-slots-shipped-2026-09-15`).
The reset lane has no instance tree; `ReactNode` props with
present-beats-absent are the same semantics at this altitude, and the
stories prove them (pass `secondarySlot={<></>}` → no badge, ever).

**PortEdge** (`src/components/portEdge.tsx` + `portEdge.layout.ts`): a new
component whose *logic* is the lab's Stage 6, restated as props instead of
stage-local `useState`:

| prop | meaning | donor |
|---|---|---|
| `edge` | `"left" \| "right" \| "top" \| "bottom"` — axis + inward text layout derived (`AXIS_FOR_EDGE`, `INWARD_TEXT_LAYOUT`) | lab `PortEdge.tsx:9-27` |
| `items` + `onItemsChange` | controlled port order (each item: id, label, state…) | `PortEdgeStage.tsx:39` |
| `distribution` | `{mode:"distribute", scheme}` \| `{mode:"aligned", anchor, gap, edgePadding}` — the spacing controls | `types.ts:20-52`, `layout.ts:80-105` |
| `mode` | `"auto" \| "custom"` + `freeOffsets` — Custom locks cards to the edge line, free on the main axis | Stage 6 `handleModeChange`/`FreeSlotCard` |
| `groups` + `groupMode` | edge-owned grouping text (`"args, kwargs"` per line) parsed by `parseGroupSyntax`; `"off" \| "grouped" \| "collapsed"` (`×N` chip) | branch `groupSyntax.ts`, `grouping.ts:computeSlots` |
| `showPorts` | **the focus toggle Zach named**: off = bare cards only, interactions unchanged | `PortEdgeStage.tsx:45`, `Card.tsx` |
| `showContainer` / `showCenterLine` | dev guides (a real Block draws its own outline and IS the line) | `Container.tsx:36-43`, `EdgeLineMark` |
| `renderItem?` | optional card content override — "the port edge doesn't actually care what goes inside its card"; default renders a `LabeledPort` with the inward text layout | new, one line |

`DndContext` ownership: **the component mounts its own only when it is not
inside one** (`useDndContext()` from `@dnd-kit/core` answers that) — so a
single-edge story just renders `<PortEdge/>`, while the two-edge and
four-edge stories wrap several in one board-level `DndContext` and own the
cross-edge move, exactly the lab's split (Stage 5/PortBoard own
`handleDragEnd`; the edge owns nothing cross-container). That is Zach's "the
interactions for the port edge happen at a higher level" made literal: **the
4-around-a-box arrangement belongs to the story, never to PortEdge.**

Packages: `@dnd-kit/core@^6.3.1`, `@dnd-kit/sortable@^10.0.0`,
`@dnd-kit/utilities@^3.2.2` added to `apps/storybook-basics/package.json` —
all three already resolved in `pnpm-lock.yaml` (via `demo-dndkit-lab`), so
this changes no lockfile resolution.

Which lab state this builds on: **Stage 6 (`5898ecb`) by copying its logic,
without merging `claude/dndkit-lab`.** The branch stays a demo and stays
Zach's to merge; note that its `SinglePortEdgeStage.tsx` predates the
Port/LabeledPort split (`362b9cc`) and passes `size`/children to `Port`, so
merging it as-is fails typecheck — a mechanical `Port`→`LabeledPort` rename
if/when he wants the demo itself updated.

**PortEdgeLaneEditor — the multi-line codefield (the net-new build).**
Answering the brief's question first: an implementation where editing lines
moves/creates ports **exists today, in SystemSketch, as the default port
editor** — and does not exist anywhere in bbox-ui. What ports over and what
is new:

- **Ported (adapted, not invented):** `reconcilePortLane`'s algorithm
  (`systemsketch/src/blocks/portLane.ts:102-176`) — LCS over the before/after
  line lists; an unchanged line keeps its port id (so Alt+↑/↓ *moves* the
  port), an edited line pairs positionally with the port that sat there (a
  rename never recreates the port under the caret), an unmatched new line is
  a new port, a missing line a removed one. The systemsketch version is
  entangled with `BlockShapeProps`/header/effect ports; the port strips that
  to `(items, text) → items`. `formatPortLane` is trivial (`join("\n")`).
- **Ported:** the stripped `CodeField` (see D1) with `multiline` +
  `lineHeightPx` — both already built for exactly this
  (`codeField.tsx:72-78`), just never consumed in this repo.
- **New wiring:** binding it to `PortEdge`. `editing: boolean` on PortEdge
  (or a lane-level pencil affordance) mounts one `CodeField` overlay per
  edge, `value = items.map(label).join("\n")`, `onWrite` runs the reconcile
  and calls `onItemsChange` per keystroke — live, so ports appear/move as
  you type, matching systemsketch (`BlockInlineEditor.tsx:208-211` "every
  keystroke reads the whole lane back"). While editing, each card's
  single-line label field is **hidden** (the card still renders the dot),
  which is what "the single line codefield hidden" means — the lane IS the
  labels for the duration.

"Text aligned properly with the ports", geometrically: line pitch must equal
port pitch. `lineHeightPx` pins every CodeMirror line to one height
(`codeField.tsx:282-290`), so the lane requires a **uniform** pitch:
supported in `aligned` mode (pitch = card height + `gap`, the overlay's top
anchored at the first card) and in `distribute` modes (equal cards ⇒ equal
pitch, computable from `mainAxisPositions`' closed form, `layout.ts:39-77`).
**Not supported**, and honestly declined rather than approximated: `custom`
free positions (non-uniform pitch — CodeMirror cannot vary per-line height
that way) and `collapsed` groups (a `×3` chip is one row for three ports —
no line↔port bijection; Zach pre-conceded this: "it won't be supported in
all modes, say if all ports are grouped into one"). Vertical (`column`)
orientations only, per the brief — the enable control greys out otherwise.

"IDE hotkeys", concretely — already in the ported field, zero new code:
Alt+↑/↓ and Shift+Alt+↑/↓ (CodeMirror `defaultKeymap`), Ctrl+Arrow
variants for window managers that eat Alt (`codeField.tsx:386-395`),
Ctrl/Cmd+Z history, Enter = new line in a lane (`:366-368`), Ctrl/Cmd+Enter
= exit. `completionMenu.ts` is the *autocomplete popup*, not the hotkeys —
it stays behind (721 lines, needs a grammar and a completion source neither
of which these stories have).

### Stock parts, element by element

| Element | Today | Off-the-shelf part (exact name) | Behaviour that must survive |
|---|---|---|---|
| Reorder within an edge | lab `SortableSlotCard` | `useSortable`, `SortableContext`, `arrayMove`, `verticalListSortingStrategy`/`horizontalListSortingStrategy` (`@dnd-kit/sortable`), `CSS.Transform.toString` (`@dnd-kit/utilities`) | drag ghost at 0.35 opacity; 4px `activationConstraint` so a click is never a drag |
| Cross-edge move | lab `PortBoard`/`PortEdgeStage` | `DndContext`, `useDroppable`, `closestCenter`, `PointerSensor` (`@dnd-kit/core`) | card crosses edges; orientation/text-layout flip comes from the receiving container, never the card |
| Custom free drag | Stage 6 `FreeSlotCard` | `useDraggable` (`@dnd-kit/core`) | locked to the edge line, free on the main axis; delta applied on drag end |
| Even spacing | lab `distributionStyle` | CSS `justify-content: space-between/evenly/around` (browser) | switching to Custom seeds from where flexbox actually put things |
| Line moves / history / new line | systemsketch lane | `moveLineUp`, `moveLineDown`, `copyLineUp`, `copyLineDown`, `history`, `defaultKeymap`, `historyKeymap` (`@codemirror/commands`) | Alt+↑/↓ moves the port with the line; one undo step per gesture |
| Line↔row pinning | systemsketch lane | `EditorView.theme` `.cm-line` height (already wrapped as `CodeField`'s `lineHeightPx`) | typed text lands beside the dot it belongs to |
| Lines→ports identity | systemsketch `reconcilePortLane` | ported donor algorithm (LCS) — not a package | a moved line keeps its id; an in-place edit keeps its id; Enter makes a new port |
| Story assertions | `Bar.stories.tsx` pattern | `expect` from `storybook/test`, play functions | Hidden asserts absence from the DOM, not opacity |
| Port geometry / slot placement | `packages/bbox-ui/src/port.tsx`, `port.layout.ts` | **unchanged (stock seam)** — copied by value, originals untouched | the mature package stays the design authority; drift is visible in the copy's header comment |
| `demos/dndkit-lab`, `claude/dndkit-lab` branch, `apps/storybook` (opt-in Storybook), all of systemsketch | — | **unchanged (stock seam)** | the lab stays the interaction reference; nothing here edits it |

### Phases — each independently demoable in Storybook

**Phase 1 · Port.** `port.tsx` + `port.layout.ts` (constants) into
`src/components/`; two tokens into `globals.css`. Stories (`Basics/Port`):
`Default`, `AllStates` (the sketch row: Empty · Out of Focus (`dimmed`) ·
Value Set · Wired · Received), `Diameters` (sm/md/lg + `diameter={25}` for
Exact), `Hidden`. Acceptance in the browser: hover scales the dot 1.1×;
Hidden's play function proves `[data-slot="port-dot"]` **does not exist**
and a click at its coordinates hits the canvas backdrop — the sketch's
annotation, asserted.

**Phase 2 · LabeledPort.** `labeledPort.tsx` + the slot-placement half of
`port.layout.ts`; the stripped `CodeField` port (D1) with `multiline`
dormant. Stories (`Basics/LabeledPort`): `Default`, `FourEdges` (edge=left/
right/top/bottom, label auto-inward), `OffsetClearsTheWire` — the key one: a
horizontal line drawn through the dot centre (one absolutely-positioned div
standing in for the trace), `right` showing the wire through the label,
`rightOffset` showing it passing clean underneath, per the vault sketches —
`SecondarySlot` (badge and an `Event 4` pill, all four corners, auto
opposite-the-label default), `EditableLabel` (play function clicks, types
`pose: Pose = None`, asserts the write). Acceptance: label gap measures 13px
from ring on `right` and identical on `rightOffset` with the bottom edge
clear of the centre line; typed text survives blur via `onLabelWrite`.

**Phase 3 · PortEdge.** `portEdge.tsx` + `portEdge.layout.ts` (lab's
`types`/`layout`/`grouping`/`groupSyntax` logic) + dnd-kit deps. Stories
(`Basics/PortEdge`): `SingleEdge` (Stage 6 parity: orientation, Auto/Custom,
spacing, size, Show ports/container/center line, groups text, Grouped/
Collapsed), `LeftAndRight` (two edges, one story-owned `DndContext`, drag a
card across), `AroundABox` (four edges around a plain `Block` rectangle —
the final sketch; the story owns the arrangement and the cross-edge
`onDragEnd`), `EvenlySpacedVsCustom`, `CardsOnly` (`showPorts` off).
Acceptance: every Stage-6 control works by direct manipulation in the story;
dragging between edges flips the card's text layout to the new edge's inward
direction.

**Phase 4 · Multi-line lane.** `portLane.ts` (ported reconcile, pure, unit-
testable) + the `editing` wiring into PortEdge; `CodeField.multiline` +
`lineHeightPx` go live. Stories: `MultiLineEditing` (vertical edge, aligned
spacing, editor on: single-line fields hidden, lane text beside the dots),
plus play-function coverage. Acceptance, each observable: type Enter → a new
port dot appears at the new line's row; Alt+↓ on a line → that port's dot
moves down one pitch with its id (colour/state) intact; select-all + delete →
empty edge; toggling the editor off restores the single-line fields with the
edited labels; the enable control is disabled in `row` orientation, `custom`
mode, and `collapsed` group mode.

Sequencing constraint: another agent is mid-flight in
`apps/storybook-basics/src/` (header primitives, per the vault's
`burger-menu-and-extras-queued-2026-09-16` note). Phases 1-2 create only new
files (`port*.tsx`, `labeledPort.tsx`, new story files) and touch
`globals.css` in one append — start after that pass lands or coordinate the
one shared file.

### Decisions — each with the default taken if you say nothing

- **D1 · SUPERSEDED 2026-09-16 — the label field is a plain-text placeholder
  here, and integrates with the CodeEditor another lane is porting.** Zach:
  *"I have another agent that is starting to port over the codefield, so I
  don't think you need to focus on that, for now you can just use plain text
  as a placeholder, etc and then you can integrate correctly with the
  codefield once that work is done."* So Phase 2 ships `LabeledPort` with its
  label slot taking arbitrary content and a plain editable text control
  (`EditableText`) as the default fill — the slot boundary is what Phase 2 is
  really proving, and it does not care what sits in it. The swap to the real
  editor is then one import in one file, not a rewrite. Phase 4's lane still
  needs CodeMirror and still waits on that lane landing. **This also voids the
  "one ported field serves both" argument below** — do not port a second
  editor into this app. The original reasoning is kept for the record:
  ~~You said~~
  "single line codefield" and "multi line codefield editor" by name, and
  Phase 4 needs CodeMirror regardless — so one ported field serves both,
  stripped to: no `grammar`/`codeGrammar.ts`, no `mode`/rendered rows
  (`codeFieldRows.tsx` stays behind), no `completionMenu.ts`, keeping
  `fieldGesture.ts` (112 lines), `singleLineGuard`, the keymap, and
  `codeField.css` trimmed. ~400 lines + five `@codemirror/*` deps (already
  in the lockfile). The alternative — this app's existing `TextBox` control
  (`textBox.tsx:97-260`) — would satisfy "looks like text, editable" with
  zero new deps but cannot do the lane, IDE keys, or the single-line-guard
  contract, and would make Phase 4 a second editor. Default: CodeField.
- **D2 · Lab branch: copy Stage 6's logic, do not merge `claude/dndkit-lab`
  first.** Merging is Zach's call, the demo predates the Port split (would
  need the `Port`→`LabeledPort` rename to typecheck), and the storybook
  component wants the logic as props, not the stage's `useState`. Default:
  copy; branch untouched.
- **D3 · Drop `tone` (and `lens`/`reveal`/`producers`) from the reset Port.**
  The sketch's six states don't include them; each is re-addable. The
  secondary-slot badge becomes explicit story content instead of a
  `producers >= 2` fallback. Default: drop.
- **D4 · Drop the `size` cascade rung; `diameter` + `textSize` are direct
  props.** The rung exists for headers handing size down — no header here,
  and the cascade machinery is what the reset bans. Default: drop.
- **D5 · Multi-line lane scope: `column` orientation + uniform-pitch modes
  only** (aligned, and the three distribute schemes); disabled in `custom`
  and `collapsed`. Extending to `row` or custom pitch is a different editor,
  not a flag. Default: as stated.
- **D6 · The four-edge arrangement is story-owned.** PortEdge stays one
  edge; `useDndContext()` decides whether it mounts its own `DndContext`.
  Default: yes.
- **D7 · Two `--bbox-*` tokens appended to `globals.css`** (values from
  `theme.css`), rather than importing `theme.css` or leaving wired/received
  on stock tokens that paint wrong. Default: append two tokens.

### What this plan deliberately does not do

- No component code written; nothing merged; `claude/dndkit-lab`,
  `packages/bbox-ui`, `demos/`, `apps/storybook` and systemsketch all
  untouched.
- No FieldSpec/preset re-entry through the back door — the reset PortEdge's
  controls are Storybook args and story-local UI, not a schema.
- No autocomplete/grammar in either codefield (the `name: Type = default`
  grammar, completion, diagnostics — `PortSignatureField.tsx` shows what
  that costs; it belongs to a later pass, if ever, in this lane).
- No `Block` integration ("get working separately and then we can add it to
  the block") and no persistence — `portPlacement.ts`'s arrangement model is
  the named convergence target for when a real Block adopts this, and is
  deliberately not dragged into the stories now.
