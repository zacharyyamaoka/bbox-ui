# The grouping algebra — collapse to region, and its inverse

Lane: `lane:grouping`, 2026-09-18. Pure functions over `BlockScene` in
`apps/storybook-basics/src/scene/`. Nothing here imports React, the DOM or a
canvas engine.

> **"This is going to be the bread and butter of what we are doing here!!!"**
> — Zach, on collapse-to-region and its inverse
>
> *"A lot of design is basically just changing how we are grouping and
> ungrouping things."*

This document carries the one argument that does not fit in a file header.
Everything else — every rule, every quote, every limit — lives at the seam it
governs, which is this repo's normal practice.

---

## 1. The fork: does a collapse CHANGE the document, or only the picture?

**This is the decision that should become `docs/peps/0003` when this lane
merges** (per `docs/peps/README.md`: records land at merge, not before). It
is a genuine fork with a plausible losing option that someone will be tempted
by again — a parallel lane advocated the losing side mid-task, citing a
shipped implementation.

### The alternative, stated at its strongest

maxGraph resolves this at **render time** and never touches the document.
`GraphView.ts:1656-1679` walks up from a hidden terminal to the nearest
visible ancestor and draws to that, using perimeter geometry for the landing
point. Collapse there is a boolean on a cell; the children and their edges
stay exactly as authored. It is ~15 lines, it is a pure projection, and it
cannot corrupt anything. That is a real virtue and the reason it deserved
weighing rather than dismissing.

*(Noted honestly: that file was **not opened by this lane** — it was reported
to us by a lane that did read it. Nothing in our code is attributed to it.)*

### Why we diverge

Three of Zach's own rulings this week are unsatisfiable by a render-time
projection:

1. **"100% its a node. its just a unique type of node that is different from
   block."** A collapse *mints a node that did not exist*. A projection
   cannot; it has nothing to project onto. The brief's own signature —
   `collapseToRegion(scene, nodeIds) → scene` — is already a document
   transform.

2. **"100% region is isolated. Regions in code are not linked, so our regions
   shouldn't be either!"** If the edges still name the inner nodes, the
   region is not isolated — it is a box drawn *around* things that remain
   globally wired, and isolation is a rule someone has to remember rather
   than a property of the record. Splitting the edge makes it structural:
   after a collapse, **no edge outside the region names anything inside it**,
   and `collapse.test.ts` asserts exactly that.

3. **"If you delete a block, then the cables can remain wired if they go
   through the ports on the parent edge!"** A projection over members has
   nothing left to project when the member is gone — the cable dangles. The
   cable survives only if it names the **port**, not the child. That requires
   the endpoint rewrite.

A fourth consideration, raised by the same parallel lane and which we agree
with: **a container's port list is a manifest, not a live view over its
children.** That position is *incompatible* with render-time projection and
*implied by* the split edge. We took the manifest reading.

### What we give up

- Collapse is no longer free to undo by flipping a boolean. It is undone by
  `dissolveRegion`, which is why that function is not a convenience but a
  correctness obligation — and why its round trip is the most heavily tested
  thing in the lane.
- The edge list grows by one stub per promoted port while a region exists.
- A host that wanted "preview this fold without committing" cannot get it
  from `collapseToRegion`. **It can get it from `classifyBoundary` +
  `promoteBoundary`**, which are pure derivations that mutate nothing — i.e.
  we kept maxGraph's stance for the *query* and rejected it only for the
  *operation*. That split is deliberate.

### What would reopen it

If folding ever needs to be a per-viewer or per-lens state (two people
looking at one board with different things collapsed), a document mutation is
the wrong substrate and the projection reading wins outright. Nothing in the
kit needs that today.

---

## 2. The split edge, drawn

```
before   outerNode/o ──────────────────────────────────► innerNode/i

after    outerNode/o ──► region/p          region/p ──► innerNode/i
          (the SAME edge — id, data and     (a new STUB edge, minted id,
           array index all preserved,        removed again on dissolve)
           only the inner end re-pointed)
```

Dissolve splices the two halves back through `p`, restoring the original
record rather than an equivalent one. That is what lets the round trip be
asserted as **scene equality**, not set equality.

**Round trip, measured.** Exact for: every edge id, ends, handles, `data`,
array index; every node id, `type`, `data`, `definitionId`, array index; and
positions with integer coordinates. Inexact for: positions with *fractional*
coordinates, by at most one relative ulp — `(a − r) + r ≠ a` in IEEE-754.
Found by search, not assumed: 3.3M pairs, 16% inexact, worst absolute error
5.8e-11 at magnitude 3.7e5. It does not compound past the first trip.

---

## 3. The data shape the rendering lane consumes

`PromotedPort`, from `scene/boundary.ts`. One per **inside endpoint**, not
one per crossing edge — two outside members reading the same inner output is
one thing leaving the container, drawn once and fanned.

| Field | Meaning |
|---|---|
| `id` | Port id on the container. Caller-minted; default `portKey(inner.nodeId, inner.portId)`. **Never a display name** — litegraph keys its rows by name and renaming silently orphans every reference; this repo's `portKey` rule already forbids it. |
| `side` | `BlockSide` — `"left" \| "right" \| "top" \| "bottom"`. Already resolved, so a host need not run `portSideForDirection` itself. |
| `direction` | `"source" \| "sink"` — `lint.ts`'s vocabulary, **not** `port.layout.ts`'s `"input" \| "output"`. Two spellings already exist in this repo; the scene layer speaks the one `PortDirectionOf` returns. Map at the view boundary: `source → output → right`. |
| `seat` | `"header"` — the header band's centre line, Zach's chosen mechanism. `"rail"` — an ordinary `PortEdge` slot. |
| `band` | `RailBand`, `"block"` for a promoted port (the band that spans the header; `"body"` cannot reach header height, `blockPort.layout.ts:155`). |
| `t` | 0..1 along the wall, in the wall's reading direction. **Present only when a policy actually measured it.** Absent means "the rail distributes it" — not a number to invent. |
| `inner` / `outer` | The endpoint inside, and every endpoint outside now reaching through this port. |
| `edgeIds` | The edges that collapsed into it, scene order. |
| `portType` | The inner endpoint's declared type, when `typeOf` states one, narrowed to one string (`arePortTypesCompatible` compares one to one). |
| `by` | `"polarity"` (a real direction was read) / `"gesture"` (the DAG assumption did the work) / `"geometry"` (measured off the cable). |

### The one thing the rendering lane must add

`seat: "header"` names the **right-wall twin of `functionPortCenterPx`**
(`blockPort.layout.ts:456`), which today computes only the left one:

```ts
// exists today — the reserved pin-1 seat, LEFT wall
{ x: bands.blockLeft, y: (bands.headerTop + bands.bodyTop) / 2 }

// does NOT exist — what a promoted output port needs
{ x: bands.blockLeft + bands.blockWidth, y: (bands.headerTop + bands.bodyTop) / 2 }
```

We emit the seat; we do not paint it. Note also that a lane landed
`collapsedWallCenterPx(bands, edge) → {x, y}` elsewhere — **not present in
this worktree**, so we could not match its signature. The layers differ
anyway: ours is `{side, t}` in **scene space** (`src/scene/` has no bands and
no px); theirs is a point in wrapper-local px. The natural seam is ours
feeding theirs.

---

## 4. Where Zach's v1 heuristic first breaks

His rule, in his words: *"if it's connecting to an input port of an outside
member then it should go out the right side of the header! (this assumes
functional DAG, which is most of our cases!!!)"* — plus its inbound mirror.

**The first genuine break is a feedback edge.** v1 reads polarity and calls a
source "right". Under a DAG that is also *downstream*, so right is where the
cable goes. On a feedback edge the consumer sits *upstream* — to the left on
the canvas — so **the polarity stays correct and the side is wrong**. This is
reachable in a scene the judge will happily commit:
`DEFAULT_CONNECTION_POLICY.allowCycles` is `true` and `findCycles` treats a
cycle as "the linter's real input". `crossingGeometryPolicy` gets it right
because it measures the wall the cable actually meets, and
`collapse.test.ts` renders the disagreement as an assertion.

**Two predictions we tested and could not reproduce.** A parallel lane
predicted v1 "first fails when **both ends of an edge are folded**, or when
**folds nest**." Both cases were built and **both land correctly** under this
scene contract — because each container is classified *independently*, and
the endpoint rewrite *preserves orientation*, so the second fold's DAG
assumption is still reading a true fact.

What *does* degrade at a second fold is the **provenance, not the answer**:
the far end is now a promoted port id, which the caller's `directionOf` does
not know, so the verdict drops from `by: "polarity"` to `by: "gesture"`.
Composing `promotedDirectionOf(regionId, ports)` into the resolver restores
the reading — same answer, honest provenance. That composition is a test, not
a suggestion.

---

## 5. Files

| File | What it is |
|---|---|
| `scene/portEdgeCrossing.ts` | "Trace in, location out." An **adapter** over `components/elbow/boundaryCrossing.ts`, which already had the Liang–Barsky clipper and already named this use case. Adds the along-the-wall `t`, the route/chord provenance, inset-consistent normalisation. |
| `scene/region.ts` | Region as a `SceneNode.type`, plus `descendantsOf` / `selectionRoots` / `absolutePosition` / `ancestorsOf` / `boundsOfNodes`. |
| `scene/boundary.ts` | `classifyBoundary` (Zach's sentence, one class per clause) and `promoteBoundary` with swappable `PromotionPolicy`. |
| `scene/collapse.ts` | `collapseToRegion` / `dissolveRegion` (= `deleteNodeRewiring`). |
| `scene/boundaryWiring.ts` | The wire helpers and the auto-port toggle, default **off** — *"having it off is nice cause then you think in terms of public api first."* |

`src/components/**` and `src/hosts/**` are untouched.
