# Algorithm provenance — `apps/storybook-basics/src/scene/containment.ts`

Repo rule (`.claude/feedback.md`, `docs/ALGORITHM-PROVENANCE.md`): a citation
earns its place only if it names a path and line range **that exists on this
disk and was opened**, or a URL fetched while writing this. Where that is not
possible, the honest label is "ours, ad hoc" — never a citation from memory.
This file is new (per the containment lane's own instructions), so it does not
touch `docs/ALGORITHM-PROVENANCE.md`.

## An honest provenance chain, stated up front

**Neither maxGraph's nor Vyuh's own source is vendored anywhere in this
repository** — confirmed by search (`find / -iname "*maxgraph*"`, `find /home
-iname "*vyuh*"`) before writing this file: nothing came back outside this
worktree's own docs. So the citations below to `CellsMixin.ts`,
`SwimlaneMixin.ts`, `ConnectionsMixin.ts`, `AbstractGraph.ts`, and
`group_node.dart` / `groupable_mixin.dart` are **not** files this lane opened
itself. They are lines an earlier session in this same repo *did* fetch and
open — real npm installs / a real pub package fetch, per that session's own
header (`docs/REFERENCE-IMPLEMENTATIONS.md`: "compiled ... from three oracle
sessions that **ran the libraries** ... rather than recalling them") — and
recorded, with those exact line ranges, in two files that this lane *did* open
directly on this disk:

- `docs/build_prior_art_visuals_fragments.py` (the diagram source, lines
  340-403 for card 07's lifecycle figure and card 08's policy figure)
- `docs/fragments/prior-art-visuals-container.html` (the rendered figures'
  own caption text and citation lines, e.g. line 218 and line 243)

Both were opened in full by this lane before writing `containment.ts`. Citing
them is honest in a way citing maxGraph/Vyuh directly would not be — this lane
is relying on a **prior verified record inside this repository**, not on
memory of a library it has never itself fetched. If that prior record is ever
found to be wrong, this file is wrong the same way and by the same amount.

## `judgeContainment` — the shape (card 09)

**Class: (b) ours, known shape.** The two-case discriminated-union verdict
(`{allowed:true; effect}` / `{allowed:false; refusal}`) is not ported from
anywhere — it is the same shape `edgeValidation.ts`'s `ConnectionVerdict`
already uses in this repo, reused deliberately (opened `edgeValidation.ts` in
full before writing this file; `ConnectionMessage` is imported from it, never
re-declared).

The donor for "containment and wiring are the same *shape* of question, one
gesture apart" is maxGraph's own API surface: `isValidDropTarget(cell, cells,
evt)` for containment beside `isValidConnection(source, target)` for wiring —
per the provenance chain above, `SwimlaneMixin.ts:219-226` and
`ConnectionsMixin.ts:530-532`
(`docs/fragments/prior-art-visuals-container.html:243`).

## `ContainmentPolicy` — three independent booleans (card 08)

**Class: (b) ours, known decomposition.** `extendParent` / `constrainChild` /
`allowOverlapParent` as three independently-resolved booleans, never one flag,
mirrors maxGraph's own per-cell predicates (`isExtendParent`,
`isConstrainChild`, `isAllowOverlapParent`), composed on add and on resize —
per the provenance chain above: `CellsMixin.ts:672-681` (compose on add),
`:1077-1081` (on resize), `AbstractGraph.ts:1159-1175` (`allowOverlapParent`
feeding `getOverlap`)
(`docs/fragments/prior-art-visuals-container.html:218`, and the figure source
at `docs/build_prior_art_visuals_fragments.py:363-397`, which spells out the
same three field names against the same three behaviours: "parent grows to
keep it" / "child clamped back inside" / "child may straddle the edge").

The field NAMES were chosen to match that cited vocabulary directly rather
than invent a parallel one, which is the whole value of citing it — a reader
who already knows maxGraph's containment model recognizes this file's shape
on sight. Nothing about maxGraph's `Cell`, `Geometry`, or `AbstractGraph`
classes was ported; only the three-predicate decomposition and the three
names.

## `emptyContainers` / `pruneEmptyContainers` — the lifecycle (card 07)

**Class: (b) ours, known decision.** The one-boolean-per-container-kind
decision, defaulting to KEEP, is Vyuh Flow's own
`shouldRemoveWhenEmpty = explicit && !preserveWhenEmpty` — per the provenance
chain above: `group_node.dart:330-334` and `groupable_mixin.dart:150-166` (the
hook pair)
(`docs/fragments/prior-art-visuals-container.html:193`, figure source
`docs/build_prior_art_visuals_fragments.py:340-357`).

Zach's own ruling ("most things I want to keep around even if their children
are all gone") maps onto that donor shape directly: `removeWhenEmptyOf`
resolved per node, defaulting `false` for every kind, is this repo's
`!preserveWhenEmpty` defaulting to persist. The donor's *second* signal —
`group_node.dart:229-246`'s `addNode`, cited in the same figure set as
inserting into a group **with no ancestor walk at all** — is not something
this file ported; it is cited as the *negative* case that motivates card 03's
guard existing as a write-time check rather than something inherited for
free from a "how do I add a child" code path. Verified by absence: the donor
figure's own caption records "no check" at that line range
(`docs/fragments/prior-art-visuals-container.html:93`).

Edge resolution on removal (`drop` / `dangle` / `park`) is **not** from Vyuh
or maxGraph at all — it is this repo's own `linking.ts`'s
`DeletedNodeEdgePolicy`, opened in full (`linking.ts:540-622`) and reused via
`deleteNode`, never reimplemented here.

## `findContainmentCycles` — the write-time cycle guard (card 03)

**Class: (c) ours, ad hoc, built from parts already in this repo.** No
external donor is cited for the guard's *mechanism* — it is a projection of
the `parentId` relation into `scene.ts`'s existing `SceneEdgeEnds` shape (one
synthetic child→parent edge per node with a parent), then handed to
`findCycles` (Tarjan, `scene.ts:288`, opened in full) unmodified. No second
SCC algorithm is written here.

The *decision* to guard at all — Zach, 2026-09-17: "agreed on detecting these
infinite loops so you don't walk forever" — is his own ruling, not a ported
finding; the Vyuh absence noted above (`group_node.dart:229-246`) is cited
only as independent evidence that a real shipped library has this exact gap,
not as the source of the fix.

`judgeContainment`'s own guard reuses `region.ts`'s pre-existing
`descendantsOf` (opened in full, `region.ts:95-110`) rather than writing a
second walk — that function was already cycle-safe (a visited-set fixpoint,
not recursion) before this lane touched anything.
