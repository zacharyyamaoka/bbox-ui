# 0001 — The sketch skin is a boundary transform, not a core concern

- **Status**: accepted
- **Date**: 2026-09-17
- **Decided by**: Zach's ruling ("nothing inside the code base should ever be
  driven by it"); design and evidence by the reasoner lane
  `worktree-agent-a1a67d67ec29ad7ba`, base commit `064be4b`
- **Seam**: `apps/storybook-basics/src/skin/sketchAtEdge.ts` (the transform)
  and `apps/storybook-basics/src/skin/SketchAtEdge.tsx` (the shell that
  drives it). Both carry a `WHY:` header pointing back here.

## The ruling

The hand-drawn "sketch" look is produced **entirely outside
`src/components/`**, by reading the core's already-rendered crisp DOM and
drawing over it. No core component imports the skin, computes sketch
geometry, or ships a hidden sketched twin. The core emits crisp geometry and
its ordinary semantic `data-slot` attributes; the skin selects on that
existing DOM contract from the edge.

Token-driven styling stays exactly as it is. Reading
`var(--bbox-skin-radius, …)` in a component's own `style` is *not* a leak —
it is CSS resolving a value the edge supplied, which is how skins are
supposed to work. Only **geometry computation** moves.

## What forced it

Zach, 2026-09-17, on a lane's claim that tunnel and sketch must coexist
inside `trace.tsx`:

> "I don't want the code base to be affected by the skin. Sketch skinning
> should be something very much done just like at the edges of the code base
> as a final rerender persay. nothing inside the code base should ever be
> driven [by it]."

This is `CLAUDE.md`'s own governing rule — *the core is props in, DOM out* —
applied to a concern that had drifted inward. Three measurements make the
drift concrete rather than stylistic. All three were taken on the live
rendered DOM at base commit `064be4b`.

**1. The core pays for the skin even when no skin is set.** In a subtree
carrying no `data-bbox-skin` attribute anywhere, the core still renders:

| | measured |
|---|---|
| sketch path nodes | **10** |
| bytes of sketched `d` string data | **5,124** |
| `sketch-outline` SVG elements | **7** |
| of those, actually painted | **0** |

5,124 bytes of hand-drawn geometry computed and shipped into a board that
has no skin turned on, painting nothing. That is the ruling's own words made
numeric.

**2. The core cannot measure, so the in-core version is geometrically
wrong.** `sketchOutline.tsx`'s `stretch` mode exists because the core is
forbidden from self-measuring (the rule that keeps it server-renderable).
It authors the path at a *nominal* size and stretches it with
`preserveAspectRatio="none"`. Measured on two `Badge`s in the same row:

| | real px | viewBox | x-scale | y-scale |
|---|---|---|---|---|
| narrow chip, in-core | 41.7 × 22 | `0 0 40 20` | 1.04 | 1.10 |
| **wide chip, in-core** | 121.2 × 22 | `0 0 40 20` | **3.03** | **1.10** |
| narrow chip, boundary | 41.7 × 22 | `0 0 41.66 22` | 1.00 | 1.00 |
| wide chip, boundary | 121.2 × 22 | `0 0 121.2 22` | 1.00 | 1.00 |

The wide chip's "hand-drawn" wobble is stretched **2.75× more horizontally
than vertically**. The same defect hits any auto-height `Block`: authored at
a nominal 200 tall, rendered at 77, so the wobble is squashed to 38%.

A boundary pass runs after layout, where `getBoundingClientRect()` is
ordinary. It draws at true pixels — 1.00/1.00 above. **Moving this out of
the core removes a compromise rather than trading correctness for purity.**
That is the single strongest argument for the decision and it was not
anticipated when the work started.

**3. The entanglement that triggered the ruling is not real.** `trace.tsx`
runs two path rewriters, but strictly in sequence:

```
points → tunnelMouths(…) → drawnPath → sketchedTracePath(…) → sketched
```

Tunnel is *semantic* — `tunnel: "hidden" | "preview" | "revealed" | "off"`
decides which geometry is painted. Sketch is *cosmetic* and consumes only
the final `d` string. `sketchedTracePath` has signature `string → string`
and reads nothing else. So the claim "U5 must assert one element is both
tunnelled and sketched" describes a DOM coincidence, not a coupling: the
boundary sketches whatever string came out, knowing nothing about
tunnelling. Verified — a tunnelled cable is two subpaths in one `d`,
`sketchPathData` treats each `M` as its own run and pins that run's two
ends, so both mouths stay anchored with zero tunnel awareness.

## Options weighed

Criteria, weighted for this situation: **(a)** satisfies the ruling — no
core component driven by the skin; **(b)** preserves the approved look
exactly; **(c)** keeps the `Styles` gallery and live toolbar picker working;
**(d)** migration is mechanical; **(e)** honest about its limits.

### Chosen — a boundary DOM pass that appends drawn twins

Crisp geometry stays in the core, untouched. `<SketchAtEdge>` reads the
subtree after layout and appends a sketched sibling into the *same* parent,
so it inherits the parent's `viewBox` and every enclosing transform — no
camera to replicate. Crisp suppression is pure CSS keyed on the core's
existing `data-slot` attributes.

Satisfies (a) completely. (b) is **provable, not eyeballed**: the generator
seeds from the path string itself (`seed: d`), so the same `d` yields the
same output wherever the call lives. Measured on the live DOM — the core's
own twin and the boundary's twin, same subtree, same props: 6 of 6
byte-identical, 656 characters each. The shipped implementation is the
oracle; nothing was re-derived.

### Rejected — an SVG `feTurbulence` / `feDisplacementMap` filter

The most appealing option on paper: genuinely a final re-render, zero JS,
zero geometry knowledge anywhere. It is a **different look wearing the same
name**, and three things say so:

1. **No second pass.** `sketchPath.ts`'s own reading of tldraw 5.3.2
   (module doc, point 3) is that drawing the outline *twice* is "doing most
   of the work, not the wobble". A displacement filter perturbs one
   rendered result and cannot produce two independent laps of a pen.
   Countable, and asserted in the story: a drawn cable's `d` carries ≥2 `M`
   commands; a filtered path has exactly the 1 it started with.
2. **Endpoints move.** `sketchPathData` deliberately pins the first and last
   point of every run so a trace cannot detach from its port dots — its own
   header calls a wandering endpoint "a correctness bug wearing a style's
   clothes". A filter displaces every pixel, ends included, with no
   exemption.
3. **It catches everything.** A filter applies to its whole subtree — labels
   and badge text included — so it cannot be scoped to geometry.

Rendered beside the chosen transform in
`Skin/At the edges → RejectedFilterAlternative` rather than dismissed in
prose, so the rejection is reproducible.

### Rejected — one injected primitive (core renders through a swappable `<Path>`)

Core imports a neutral primitive; a provider supplies the implementation.
One seam instead of six, and coordinate-space-exact.

It **relocates the violation rather than removing it**. The core would still
have a sketch-shaped hole in every component, still route geometry through
a skin-aware indirection, and still run sketch math inside its own render
path during a drag. It satisfies the letter of "the core imports no skin"
and fails "nothing inside the code base should ever be driven by it". Also
loses the measurement win entirely — a primitive rendered from inside the
core still cannot measure itself.

### Rejected — keep the twins in the core, compute them at the boundary

Half a step. The core keeps emitting twin *elements* and the permanent DOM
tax with them (10 nodes / 5,124 bytes above), and still needs
`display: var(--bbox-skin-crisp, …)` — the core knowing it might be hidden
by a skin. Strictly dominated by the chosen option, which needs no twin
element from the core at all.

## What we give up

Two limits, both inherent to "a final re-render at the edges". They follow
from the same fact — **a pass that runs after the frame cannot be inside
it** — so neither is fixable by a better implementation. They are the price
of the ruling, not of the code, and they should be known rather than
discovered.

1. **In-flight geometry trails by one frame.** While a trace is dragged or a
   block resized, crisp geometry updates in React's commit and the drawn
   twin updates in the effect after it — ~16ms of the twin being one step
   stale. The in-core design had no such gap; it computed the sketch during
   the same render. Mitigation, and what production should do: show crisp
   while a gesture is live, redraw on gesture end. That is what tldraw
   itself does, and it is cheaper than sketching 60 paths a second.
2. **First paint is crisp under SSR.** The pass cannot run on the server or
   before hydration, so server-rendered HTML paints crisp for one frame and
   then swaps. The in-core design shipped the sketched twin in the SSR
   output and was correct in the very first painted frame. A FOUC-class
   artifact: invisible in a client-only app like Storybook, real in
   `apps/docs`.

Neither affects a static canvas, which is how these components are looked at
essentially all of the time.

A third, smaller cost: **semantic seeds need one attribute to travel.**
`badge.tsx` seeds `badge:${size}:${shape}` and `port.tsx` seeds
`port:${state}:${diameter}` — props the edge cannot see. The boundary
derives a geometry seed instead, so the wobble *pattern* differs while its
character and amplitude do not. Closing it properly means each component
emitting `data-bbox-seed` — one added attribute, no skin import, no skin
knowledge. `block.tsx` already needs nothing: its default seed is already a
geometry string.

## What would reopen it

- **A host that is not the DOM.** The whole design rests on the core's
  rendered output being inspectable. A canvas/WebGL host has no DOM to read
  back, and the injected-primitive option becomes the right answer there.
  This record governs the DOM hosts only.
- **Sketch on a live drag becoming a real requirement.** If the one-frame
  trail is ever visible enough to matter, the honest fix is not a faster
  pass — it is accepting sketch math inside the render path for that
  interaction, which means revisiting this.
- **`apps/docs` needing sketch correct in the first painted frame.** SSR is
  the one context where the in-core design was strictly better.
- **A measurement showing the boundary pass costs more than the twins it
  deletes** on a realistically large board. The DOM-tax numbers here were
  taken on a small gallery; they should scale in the boundary's favour, but
  that is an expectation, not a measurement.
