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
