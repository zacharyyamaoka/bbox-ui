# 0003 — A collapse mutates the document; only the query projects

- **Status**: accepted
- **Date**: 2026-09-18
- **Decided by**: the `lane:grouping` lane, which built both readings far
  enough to test them, against a parallel lane that advocated the losing
  side mid-task citing a shipped implementation (maxGraph). Landed at merge
  per `docs/peps/README.md`; the lane correctly staged the argument in
  `docs/GROUPING-ALGEBRA.md` §1 and left the record for merge time.
- **Seam**: `apps/storybook-basics/src/scene/collapse.ts:319` carries a
  `WHY:` pointing here. `classifyBoundary` / `promoteBoundary` are the
  non-mutating half and are governed by the same ruling.

## The ruling

**`collapseToRegion` rewrites edge endpoints in the document. The
classification and promotion that decide *what* it would do mutate
nothing.** The fork was resolved differently for the operation and for the
query, and that split is deliberate rather than a compromise.

## The alternative, at its strongest

maxGraph resolves this entirely at render time and never touches the
document: `GraphView.ts:1656-1679` walks up from a hidden terminal to the
nearest visible ancestor and draws to that, using perimeter geometry for
the landing point. Collapse there is a boolean on a cell; children and
their edges stay exactly as authored. **~15 lines, a pure projection, and
it cannot corrupt anything.** That is a real virtue, it is shipped, and it
deserved weighing rather than dismissing.

*(Honestly noted: that file was not opened by the deciding lane — it was
reported by a lane that did read it. No code here is attributed to it.)*

## Why we diverge

Three of Zach's rulings from 2026-09-18 are **unsatisfiable** by a
render-time projection:

1. *"100% its a node. its just a unique type of node that is different from
   block."* A collapse **mints a node that did not exist**. A projection has
   nothing to project onto.

2. *"100% region is isolated. Regions in code are not linked, so our regions
   shouldn't be either!"* If edges still name the inner nodes, the region is
   a box drawn *around* things that remain globally wired — isolation
   becomes a rule someone must remember rather than a property of the
   record. The split edge makes it **structural**: after a collapse, no edge
   outside the region names anything inside it, and `collapse.test.ts`
   asserts exactly that.

3. *"If you delete a block, then the cables can remain wired if they go
   through the ports on the parent edge!"* A projection over members has
   nothing left to project once the member is gone — the cable dangles. It
   survives only if it names the **port**, which requires the endpoint
   rewrite.

A fourth, raised by the parallel lane and agreed: **a container's port list
is a manifest, not a live view over its children.** That position is
*incompatible* with projection and *implied by* the split edge.

## What we give up

- Collapse is no longer undone by flipping a boolean. It is undone by
  `dissolveRegion` — which is why that function is a correctness
  obligation, not a convenience, and why its round trip is the most heavily
  tested thing in the lane. The round trip is asserted as scene
  **equality** including array index, not set equality.
- The edge list grows by one stub per promoted port while a region exists.
- "Preview this fold without committing" cannot come from
  `collapseToRegion`. **It comes from `classifyBoundary` +
  `promoteBoundary`**, which derive and mutate nothing — maxGraph's stance,
  kept for the query.

## What would reopen this

**If folding ever becomes per-viewer or per-lens state** — two people on one
board with different things collapsed — a document mutation is the wrong
substrate and the projection reading wins outright. Nothing in the kit needs
that today. Treat that sentence as the tripwire.
