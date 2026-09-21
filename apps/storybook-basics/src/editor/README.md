# `src/editor/` — the editor kit

The third kit in this repo's own vocabulary, alongside `src/components/`
(the view kit: props in, DOM out, no state of its own) and `src/scene/`
(the scene kit: pure functions over a `BlockScene`, no React). Zach,
2026-09-18, on where the focus-view floating toolbar belongs: "the floating
toolbar that should go inside editor components." This directory is that —
created for the first time by that ask, not an accident.

## What belongs here

Stateful, editor-chrome-shaped React components that sit ON TOP of a
canvas/board and drive it: floating toolbars, selection HUDs, inline
control panels. A file here typically:

- holds local React state (or takes it as controlled props) for something
  the VIEW kit has no business owning — which direction slider is being
  dragged, whether a panel is open;
- reads a pure result from the SCENE kit (e.g. `scene/focus.ts`'s
  `focusSnapshot`) and turns it into props/callbacks a component can act
  on;
- composes leaf primitives from `src/components/` (`Button`, the vendored
  `Slider`) into one purposeful control surface.

## What does not belong here

- **No canvas engine import.** Same rule the repo-level `CLAUDE.md` states
  for `packages/bbox-ui`: a file here takes callbacks and plain data as
  props (`onStepsChange`, `seedId`, a `BlockScene`) — never a tldraw
  `Editor`, never `@xyflow/react`'s store hooks. A host wires those calls to
  its own engine; this kit stays engine-agnostic so the same toolbar mounts
  over a `DomCanvas`, a `ReactFlowHost`, or a future tldraw shape without a
  fork. The donor this kit ports from (`PropagationFocusControls.tsx`) is
  the cautionary example — it hard-codes `useEditor()`/`useValue` from
  `tldraw`, which is exactly why it could not be copied, only re-expressed.
- **No pure graph/geometry algorithms.** Those are the scene kit's job
  (`src/scene/*.ts`) precisely so they can be unit-tested with a plain
  object literal and no React at all. A file here calls into `scene/`, it
  does not reimplement it.
- **No presentational leaf components.** A styled button, an icon, a
  tooltip — those are `src/components/`. A file here composes them; it
  does not define new ones from scratch unless the composition itself is
  the deliverable (e.g. `focusControls.tsx` IS the deliverable, but it
  imports `Button`/`Slider` rather than hand-rolling either).

## `nodeCatalog.ts` + `edgeDropMenu.tsx` — the edge-drop menu (card 14)

"A cable that landed on nothing is a question, not a mistake" — dropping a
loose wire end on empty canvas opens a type-filtered node search anchored
to the loose end. Zach, 2026-09-18: "agree this is nice. Let's please add
this to editor-components. We already have the implementation in
SystemSketch." Ported as BEHAVIOUR from SystemSketch's
`src/blocks/ui/OnCanvasBlockPicker.tsx` and its caller
`ConnectionShapeUtil.tsx`'s `offerBlockForLooseTerminal` — see
`docs/provenance/edge-drop-menu.md` for the line-by-line citations.

Split the same way this kit already splits pure-vs-chrome:

- **`nodeCatalog.ts`** — the PURE half. `NodeCatalogEntry` (a thing a host
  could insert) and `catalogFor(catalog, want)`, which answers "which
  entries can supply the polarity/type a loose cable end needs." No React,
  no DOM — same discipline `scene/lint.ts` follows, but it lives here
  rather than in `src/scene/` because it filters a host-authored CATALOG,
  not a `BlockScene`.
- **`edgeDropMenu.tsx`** — the chrome. `EdgeDropMenu` takes `anchor`/
  `viewport` (plain data, no editor handle), `entries`, and — the one
  non-negotiable part, card 23's rule — a `judge: (entry) => boolean`
  callback the host wires to `scene/edgeValidation.ts`'s
  `validateConnection`. An entry the judge refuses is never rendered, not
  merely disabled: "one gate, no second entry point," because JointJS's
  own `Connect` tool skipping `validateMagnet` while the raw press gates
  it is exactly the failure this rule exists to rule out (cited in full in
  the provenance doc). `placeEdgeDropMenu` is the donor's flip-then-clamp
  placement math, re-expressed as a pure function of an already-measured
  size instead of a live tldraw reactor.

See `src/editor/EdgeDropMenu.stories.tsx` for the host-adapter pattern
this establishes: the story owns the pointer gesture and the demo catalog;
the kit component owns none of either.

## `portOverflowChip.tsx` — the "+X more" chip (ruling 7)

Zach, 2026-09-21: *"ideally this just comes from the port edge
implementation... but YOu do need to provide the chrome to do this... should
be in bbox-editor."*

The split that sentence describes, and where each half lives:

| Half | Owner | Why it cannot live on the other side |
|---|---|---|
| Which slots are cut, and how many PORTS that hides | `components/portEdge.layout.ts`'s `splitByMaxVisible` (pure, unit-tested) | Grouping means a cut slot can hold several ports — only the component that built the slots knows the real count |
| Where the marker lands on the track | `components/portEdge.tsx`'s `useMoreIndicatorPosition` | It measures the last visible port's real box off the track's own ref |
| The chip, and the list of hidden ports behind it | **here** | It is chrome, and `components/` may not import `editor/` |

The seam is `PortEdgeProps.renderOverflow`, a render prop — the only shape
that respects the DAG. `PortEdge` still draws a bare, inert `+N more` line
when no chrome is supplied, because a capped edge that drew nothing would
silently swallow ports; that fallback is a truthfulness floor, not a second
chip.

`src/editor/PortOverflowChip.stories.tsx` is the reference host wiring, and
its `GroupedCut` story is what makes the split falsifiable: one slot is cut,
three ports go with it, and the chip reads **+3**. A chip counting anything
for itself would say +1.

## `sourceActions.ts` — the pyblocks-gated source actions

"Convert to code" and "Expand to blocks" — the two gestures of the
source-code view's Rung A (`docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md` §5.5).
Zach, item 4 of the 2026-09-18 ask: "add the menu items… that could appear
if pyblocks is enabled."

Pure, like `nodeCatalog.ts` and for the same reason: `sourceActionsFor`
takes a backend ref, a selection (`nodeIds` plus a pre-bound
`scene/codeCell.ts` `isCodeCell`) and the host's two handlers, and returns
`MenuAction`-shaped rows. No React, no DOM, no `BlockScene` — it filters a
host-authored action set, not a scene, which is why it lives here rather
than in `src/scene/`.

**The gate is one string.** `backend.kind === "pyblocks"`
(`PYBLOCKS_BACKEND_KIND`) is the entire contract with the pyblocks-backend
stream, which owns the backend object; this file reads that one field and
nothing else, so a richer backend — request functions, a version, a socket —
satisfies it structurally with no adapter.

**Absent, never disabled.** With no backend, or any other `kind`, the
function returns `[]` and the host renders no group at all. That is
`edgeDropMenu.tsx`'s judge rule applied to a menu instead of a picker ("an
entry the judge refuses is never rendered, full stop, not merely disabled"),
and the reason is sharper here: a greyed-out "Convert to code" teaches a
reader that the gesture exists and then refuses to say why it will not run,
because the reason lives in a backend that is not connected. There is no
honest tooltip to write. The same rule decides the two rows against each
other — `convert-to-code` needs at least one selected node that is not
already a cell, `expand-to-blocks` needs exactly one that is, and a
selection earning neither gets an empty list rather than two dead rows.

**Where the chrome lives: not here.** One `MenuAction[]` feeds a
`ContextMenuGroup` *and* a dropdown *and* a `FloatingToolbar` cluster, so
they cannot drift apart (`docs/menus/MENU-KIT-DESIGN.md` §5). This file
never names a component. `src/editor/SourceActions.stories.tsx` is the
reference host: it owns the right-click gesture, the selection model, the
story-local scene adapter, and a bottom-right backend switch so both sides
of the gate are visible without a URL flag — and its three play functions
assert the negative against a menu that is genuinely open, because a menu
that never opened satisfies "the group is absent" vacuously.

## `sceneCompare.ts` + `sceneDiffMarks.tsx` — the compare view (ruling 10)

Zach, 2026-09-21: *"we want to support the Compare view."*

The compare SURFACE (`components/compareDialog.tsx` → `compareReview.tsx` →
`propertyTable.tsx` → `codeView.tsx`) and the compare ENGINE
(`scene/sceneDiff.ts`'s `diffScene`) were both already built, tested and
storied — and could not meet, because `components/` may not import `scene/`.
These two files are that meeting, and they are here for the DAG reason rather
than a taste one: this is the only kit allowed to import both.

| Half | What it is |
|---|---|
| **`sceneCompare.ts`** | Pure. `compareScenes(before, after, options)` runs `diffScene` and turns its rows into the `BoardCompare` the dialog already consumes. It decides only NAMING and SUBJECT; every judgement about what changed stays in the engine, so a surface can never hold a second opinion about it. |
| **`sceneDiffMarks.tsx`** | Chrome. An outline over every node a comparison names, measured off the node's REAL rendered box (`getBoundingClientRect`) through the `data-scene-node` attribute `hosts/domCanvas.tsx` already stamps — a convention, not an import, so any host can opt in. |

Two rules worth knowing before touching either:

- **A mark whose node is not on this side is skipped, never drawn at a guessed
  position.** That is what lets the same layer run on the `before` and `after`
  panes with no per-side filtering: an `added` node is legitimately absent from
  the baseline.
- **`omitNodeFields` exists because a host keeps its port vocabulary in
  `data`.** `diffScene` promises a port insertion is a port row and not a
  modification of its block — but both host families store port ids in
  `node.data.ports`, so the insertion changes the node's own data too, and the
  surface would report one fact twice: once readably, once as a JSON blob.
  It is deliberately NOT defaulted; a host names its own key.

`SceneCompare.stories.tsx` is the reference host wiring, and the one that
measures: `MarksOnTheBoards` checks a mark's rectangle against the node's own,
inflated by the exported `DIFF_MARK_INSET`, rather than against a literal.
`apps/systemsketch/src/chrome/CompareView/` is the same composition in the real
app, reachable from the burger.
