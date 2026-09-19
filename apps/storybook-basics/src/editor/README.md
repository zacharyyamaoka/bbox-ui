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

See `src/stories/EdgeDropMenu.stories.tsx` for the host-adapter pattern
this establishes: the story owns the pointer gesture and the demo catalog;
the kit component owns none of either.
