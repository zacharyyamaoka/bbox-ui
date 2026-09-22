# Algorithm provenance — `apps/storybook-basics/src/components`

Where every piece of real math in this app came from, and — just as
importantly — which pieces came from nowhere but here.

Written 2026-09-17 in response to Zach's note on the trace tidy pass:

> "If we are writing ourself thats ok, but like you should be referencing the
> specific source code lines you are reading for the math, etc. we wanted
> references for all of these algorithms."

## The rule this document is held to

A citation earns its place only if it is **a path and line range that exists on
this disk and was opened**, or **a URL fetched while writing this**, with the
sentence being relied on quoted. Nothing is cited from memory.

Where prior art is suspected but could not be verified that way, it is recorded
as an *unverified resemblance* at the bottom of this file — never as a citation
in the code. **Five honest "ad hoc, no prior art claimed" labels beat one
invented reference**, because a fabricated citation survives review and an
honest admission invites it.

## Classification

- **(a) Ported** — a donor exists on this disk; the code is a copy or a
  near-copy.
- **(b) Ours, known algorithm** — written here, but implementing a technique
  with real, verifiable prior art.
- **(c) Ours, ad hoc** — invented here. No prior art claimed.

| File | Class | Donor / prior art | Verified how |
|---|---|---|---|
| `elbow/*.ts` (13 files) | (a) | Excalidraw (MIT) via SystemSketch `src/blocks/elbow/` | Byte-for-byte copies under a "zero code edits" banner; attribution enforced by `elbow/provenance.test.ts` as a **runnable test**, mutation-tested red |
| `trace.tidy.ts` | (a) | SystemSketch `src/blocks/connections/tidyEdges.ts:51-96`, `:128`, `:159-233` | Opened all three ranges at rev `10748b8c` |
| `trace.routing.ts` | (a) | SystemSketch `connectionRouting.ts:1-134,204-248`; `systemSketchArrow.tsx:424-502` | Header pre-existing; donor paths confirmed present |
| `trace.layout.ts` | (a) | `packages/bbox-ui/src/trace.layout.ts` @ `b5b2778` ← SystemSketch `connectionPresentation.ts` (two hops, stated) | Header pre-existing |
| `portLane.ts` | (a) + (b) | SystemSketch `src/blocks/portLane.ts:62-86`, `:102-176`; LCS prior art below | Opened both ranges; confirmed `BlockInlineEditor.tsx:15` really is the importer, and the babble twin at `portTextShared.ts:186` really is a different function |
| `portEdge.layout.ts` | (a) + (b) | `demos/dndkit-lab/src/{layout,grouping,groupSyntax}.ts` @ `5898ecb`; CSS Align 3 below | Read via `git show 5898ecb:…`; line spans pinned |
| `blockPort.layout.ts` | (c) | Behaviour spec'd from SystemSketch `layoutBlock.ts`, **not one line ported**; vocabulary from `blockModel.ts:96` | Confirmed `:96` is exactly `BLOCK_PRESENTATION_VIEWS` |
| `sideEffects.layout.ts` | (b) + (c) | `sideEffectWallLayout`: (b) — each half of the top wall is CSS Align 3 `space-evenly`, computed by CALLING `portEdge.layout.ts`'s `mainAxisPositions` (§1 below), not re-implemented; the split at the midpoint is Zach's own rule (2026-09-22, "Splits down the middle"). `mutationRoute`: **(c), ad hoc — no prior art claimed**; a two-segment horizontal-then-vertical polyline plus a triangle, the route Zach drew | `sideEffects.layout.test.ts` asserts each half equals `mainAxisPositions(n, half, 0, "space-evenly")` directly; `SideEffectPorts.stories.tsx` measures the rendered dots and line. Mutation-tested 2026-09-22: divider +6px and dots +4px off the wall each turned the story red, restored |
| `returnDividers.ts` | (c) | "Multiple returns" (2026-09-22): the rail divider position model (`sanitizeDividers`), the authoring round trip, and the union-return-type -> port-groups translation (`returnPortGroups`) are ALL ours, ad hoc — no prior art claimed for any of the three. `formatRailLane`/`reconcileRailLane` do not re-implement `portLane.ts`'s LCS matching; they DELEGATE the port-identity question to `reconcilePortLane` itself (called, not copied) after stripping divider lines out of the text, the same "call, don't re-derive" relationship `sideEffects.layout.ts`'s own `sideEffectWallLayout` has with `mainAxisPositions` on the row above | `returnDividers.test.ts` (30 cases): sanitize's interior-only invariant, the format/reconcile round trip (rename-keeps-id, consecutive dividers collapse, a boundary divider trims), and the union parser (same-type collapse, bracket-safe split, a repeat anywhere folds). `MultipleReturns.stories.tsx` measures the two rendered drawings and the authoring editor in a real browser |
| `port.layout.ts` | (a) | `packages/bbox-ui/src/port.layout.ts:31`, `:40-41`, `:508`, `:549`, `:590+` | Opened; line numbers pinned |
| `glyph.layout.ts` | (a) | `packages/bbox-ui/src/glyph.layout.ts:11`, `:20-43`, `:45-52` | Opened; donor is 53 lines |
| `codeEditorLayout.ts` | (a) | `codeBlock.layout.ts:111`, `:112`, `:116`, `:135` on branch `claude/code-block-primitive` | Read via `git show`; constants confirmed identical |
| `codeEditorGesture.ts` | (a) | `packages/bbox-ui/src/fieldGesture.ts` | Header pre-existing |
| `codeEditorGuards.ts` | (a) | `packages/bbox-ui/src/codeFieldGuards.ts` | Header pre-existing |
| `codeEditorHighlight.ts` | (c) | Measured *against* `@lezer/highlight` 1.2.3 — cites `node_modules` and pins versions | Header pre-existing, already exemplary |
| `codeEditorTheme.ts` | (c) | — | Palette data + one resolver |
| `trace.bends.ts` | (c) | Model (not code) from the ported `elbow/elbowPins.ts` | Header pre-existing, already honest |
| `trace.handles.ts` | (c) | Model from SystemSketch `ConnectionShapeUtil.tsx:556-631` | Header pre-existing, already honest |
| `editableText.layout.ts` | **(c)** | **none** | Lookup tables and one ternary. Now says so explicitly |
| `src/scene/focus.ts` | (a) + (b) | SystemSketch `src/propagation/propagationGraph.ts` (full file, 134 lines, near-verbatim: `edgeId`/`sourceId`/`sinkId` → this repo's own `id`/`source`/`target`); `propagationFocus.ts:16-28` (`normalizePropagationSteps`/`clampPropagationSteps`) copied; `:266-345` (`rootsFor`/`getPropagationFocusStepLimits`/`stepLimitsFor`/`snapshotFor`) re-expressed as (b) — same decision policy, ported from an `Editor`+`TLShapeId` API to a plain `BlockScene`+seed-id one (no shape lookups, no store) | Opened all four ranges 2026-09-18; `focus.test.ts` ports `propagationGraph.test.ts`'s `walkPropagationGraph` suite verbatim (id/field renames only) plus new tests for the re-expressed policy layer |

## The verified prior art, in full

### 1. CSS content-distribution → `portEdge.layout.ts`'s `mainAxisPositions`

Fetched 2026-09-17 from <https://www.w3.org/TR/css-align-3/>. The three
branches match their normative definitions:

- **space-between** — "The first alignment subject is placed flush with the
  start edge of the alignment container, the last alignment subject is placed
  flush with the end edge" → first position `0`, gap `free/(n-1)`.
- **space-evenly** — "with a full-size space on either end" → gap
  `free/(n+1)`, first at `gap`.
- **space-around** — "with a half-size space on either end … the spacing
  before the first and after the last alignment subject is half the size of
  the other spacing" → gap `free/n`, first at `gap/2`.

The `count === 1` case is the one branch the spec does not settle, and the
donor's own comment says it "Matches browser behaviour". Not re-measured.

### 2. Longest common subsequence → `portLane.ts`'s `commonLines`

The textbook **quadratic-time, quadratic-space** dynamic program — not one of
the refinements. Best statement of exactly that baseline:

> D. S. Hirschberg, "A linear space algorithm for computing maximal common
> subsequences", *Communications of the ACM* 18(6):341-343, 1975 —
> "The problem of finding a longest common subsequence of two strings has been
> solved in quadratic time and space."

That sentence describes our function; the paper then improves the space, which
a lane of tens of lines does not need. Ancestor recurrence: R. A. Wagner and
M. J. Fischer, "The String-to-String Correction Problem", *JACM* 21(1):168-173,
1974.

Venue, volume, pages and year confirmed against dl.acm.org's own records
(`10.1145/360825.360861`, `10.1145/321796.321811`). **The full texts were not
read** — nothing here depends on them beyond the baseline they name.

### 3. Channel assignment → `elbow/nudge.ts`, reached from `trace.tidy.ts` step 5

This is the algorithm Zach's question was really about, and the answer has a
legal component worth stating plainly.

`elbow/nudge.ts:60-110` carries a ~50-line PROVENANCE section naming the
lineage — the vertical-constraint graph of VLSI channel routing, Hashimoto &
Stevens' left-edge algorithm (1971) — and comparing against **ELK**
(`OrthogonalRoutingGenerator.java`, EPL-2.0), **MSAGL-js**
(`CombinatorialNudger.ts`, MIT) and **Mermaid** (`orthogonalRouter`, MIT).
That file is a byte-for-byte port, so those are the *donor's* comparisons,
carried intact. They have **not** been independently re-verified against the
upstream sources.

**libavoid — the obvious comparator, and why there is no line number for it.**
libavoid (Adaptagrams; the router draw.io uses) has a directly corresponding
stage. Fetched 2026-09-17 from
<https://www.adaptagrams.org/documentation/namespaceAvoid.html>:

> `idealNudgingDistance`: "This parameter defines the spacing distance that
> will be used for nudging apart overlapping corners and line segments of
> connectors. By default, this distance is set to a value of 4."

That is the role our `spacing` (default 14) plays. Its algorithms are published
in M. Wybrow, K. Marriott and P. J. Stuckey, "Orthogonal connector routing",
GD '09, LNCS 5849, pages 219-231 — citation read the same day at
<https://www.adaptagrams.org/documentation/libavoid.html>.

**The source was deliberately not read.** libavoid and its TypeScript port
`obstacle-router` are **LGPL**, which is not an attribution licence — a credit
in a comment would not discharge it. The donor derived the ordering rule from
the geometry and checked it against MIT/Apache-2.0/EPL-2.0 implementations
instead (`elbow/nudge.ts:63-68`). So there is no libavoid code in this pipeline
and **no libavoid line number to cite**; the resemblance is convergence on a
well-known problem, not lineage. The papers remain fair game; the source does
not.

## Unverified resemblances — deliberately NOT cited in code

- **`computeSlots`** (`portEdge.layout.ts`) is a stable group-by preserving
  first-appearance order. It resembles a stable partition/`groupBy`, but that
  is a pattern, not a citable algorithm. Left as (c).
- **The leftover-zipping rule** in `reconcilePortLane` — pair unmatched lines
  positionally by rank, so an in-place rename keeps its port id — smells like
  the heuristics real diff tools use for rename detection (git's similarity
  index, Myers' diff post-processing). **Not verified**, so it is labelled a
  local product rule in the code, with no algorithm claimed.
- **Pupyrev et al., "Edge Routing with Ordered Bundles"** (GD 2011, pages
  136-147; arXiv 1209.4227) is quoted inside the ported `elbow/nudge.ts` on
  coincident paths being "ordered arbitrarily". The paper's existence,
  authorship and venue were confirmed; **the quoted sentence was not verified
  against the paper's text**. It stays as the donor wrote it because that file
  is a byte-for-byte port — but it should not be relied on as though this repo
  checked it.

## What this pass changed

Comments and this document only. No behaviour, no logic, no test. Baselines
held: **179 unit tests, 121 story tests**.

A note on the premise: the audit that prompted this work reported zero
references in `trace.tidy.ts`, `portEdge.layout.ts` and `portLane.ts`. Two of
those three were already carrying accurate, line-level donor citations —
re-verified here, every range opened, all correct. The real gap was narrower
than it looked: missing **line numbers** on four intra-repo ports, missing
**prior-art names** on the two files implementing published techniques, and no
explicit "this is ours" on the one file that genuinely has no donor.

## `apps/storybook-basics/src/scene` additions (2026-09-17, comparison-view port S1/S2)

This document's title says `src/components`; these four files live in
`src/scene` instead, so they get their own table rather than being folded
into the one above. Donor is the SystemSketch checkout at
`/home/bam/systemsketch`, read-only, at revision
`10748b8ccdb374e71714f3d351abc43947ecfb0e` — the same revision
`docs/COMPARISON-VIEW-PLAN.md` was written against. S1/S2 are that plan's
§6 sizing table, rows 1–2.

| File | Class | Donor / prior art | Verified how |
|---|---|---|---|
| `scene/wordDiff.ts` | (a) | SystemSketch `src/diff/wordDiff.ts` (197 lines) | Opened whole file; body diffed byte-for-byte against the donor after the port banner — identical |
| `scene/fieldDiff.ts` | (a) | SystemSketch `src/diff/fieldDiff.ts` (208 lines) | Opened whole file; body diffed byte-for-byte against the donor after the port banner — identical |
| `scene/lineDiff.ts` | (a) | SystemSketch `src/compare/lineDiff.ts` (163 lines) | Opened whole file; body diffed byte-for-byte against the donor after the port banner — identical |
| `scene/sceneDiff.ts` | (a) + (c) | (a) the three-state MODEL and its WHY reasoning from SystemSketch `src/compare/compareModel.ts:1-42, 264-420`; the `withoutDiffState` RULE (not code) from `src/diff/clearDiffStates.ts:1-13`. (c) the actual code: `BlockScene`-shaped input, `asText`/field-diff helpers, and the two-resolver `portsOf` shape are new, written for this app's own scene contract | Opened all cited ranges; `compareModel.ts`'s tldraw-record-reading half (`RecordMap`/`recordsOfSnapshot`) was read and deliberately left behind, not ported — see the module's own header for why |

**Tests.** `scene/wordDiff.test.ts` is a **verbatim port** of SystemSketch's
`src/diff/wordDiff.test.ts` (the donor combines `wordDiff.ts` and
`fieldDiff.ts` coverage in one file; both import specifiers resolve
unchanged because both ported modules land as siblings here too) —
diffed byte-for-byte against the donor after its own port banner,
identical; 15/15 pass (`pnpm exec vitest --project=unit run
src/scene/wordDiff.test.ts`). `scene/lineDiff.test.ts` and
`scene/sceneDiff.test.ts` are **not** donor ports — verified 2026-09-17 that
no dedicated test file for `lineDiff.ts` exists in the donor at all (`grep
-rl "lineDiff\|stableJson\|collapseContext" src --include=*.test.ts` inside
`/home/bam/systemsketch` returns nothing; it is exercised only indirectly
through the tldraw-bound `CodeView.tsx` and through fixtures in
`compareModel.test.ts`), and `sceneDiff.ts` has no donor file to have a test
at all, being a re-expression. Both are written fresh against the ported/
re-expressed source: 13/13 and 18/18 pass respectively. This closes the gap
`docs/COMPARISON-VIEW-PLAN.md`'s own "What I could not verify" section
named: "I did not run the donor's own test suites... green is not claimed."

---

## `src/skin` — the sketch skin

Added 2026-09-17 by the skin-at-the-edges lane, which found this document
scoped to `src/components` and therefore covering **none** of `src/skin/`.
That was a gap in the index, not in the code: `sketchPath.ts` already
carries an unusually thorough in-file header naming exact tldraw module
paths, with every divergence marked `DEVIATION` and reasoned. The rows
below make it findable from here.

**Updated 2026-09-18 by the build lane** that executed
`docs/SKIN-AT-THE-EDGES-MIGRATION.md` (M1-M8, all landed): `skin/sketchOutline.tsx`
is DELETED, not merely unreferenced — `block.tsx`, `badge.tsx`, `port.tsx`,
`portEdge.tsx` and `traceTerminal.tsx` all imported `SketchOutline`; none
of the six guilty files import anything from `../skin` any more
(`grep -rl 'from "\.\./skin' apps/storybook-basics/src/components/` returns
nothing). `sketchAtEdge.ts` is now the ONLY place sketch geometry is
computed for any host of this app.

| File | Class | Donor / prior art | Verified how |
|---|---|---|---|
| `skin/sketchPath.ts` | (a) + (c) | (a) tldraw 5.3.2 `rng` ported verbatim; `toDrawD`'s displacement model from `lib/shapes/shared/PathBuilder.mjs`, `lib/shapes/geo/GeoShapeBody.mjs`. (c) `sketchWobbleFor`, `SKETCH_EDGE_POINTS`, `smoothThrough`, `flattenPathData` are ours — marked `DEVIATION` in-file with the calibration reasoning | In-file header cites the exact tldraw module paths; deviations self-declared |
| ~~`skin/sketchOutline.tsx`~~ | (a) | DELETED at migration M8 (2026-09-18). Was `packages/bbox-ui/src/sketchOutline.tsx` @ `c83c8b2`, byte-identical body, while it existed | `SketchOutline`/`SketchLine` confirmed to have zero remaining consumers in this app (`packages/bbox-ui/src/bar.tsx` still uses `SketchLine`, but that package is frozen v1 and out of scope) before deletion |
| `skin/sketchAtEdge.ts` | (c) + model | (c) the DOM walk, the twin protocol and the measured seeding are **ours, ad hoc**. Model only: SystemSketch keeps hand-drawn at the host renderer via tldraw's own `dash: "draw"` shape prop — `/home/bam/systemsketch/src/inspector/inspectorModel.ts:742`, read read-only 2026-09-17 | Donor line opened; SystemSketch confirmed to carry **zero** custom sketch geometry — no roughjs, no `feTurbulence`. Build lane addendum: the M4 build additionally moved the Port-ring `expand`/`pen` numbers from a `box-shadow`-parsing fallback to two data attributes `port.tsx` now publishes directly (`ringExpansion`'s docstring, updated); the M5b build added a dedicated `RING_SELECTOR` loop for TraceTerminal's ring — a fourth measured shape class, kept separate from `BOX_SELECTOR`/`DOT_SELECTOR` because `upsertBoxTwin`'s child-append strategy does not render inside an SVG leaf shape (measured: `{width:0,height:0}`) and self-contaminates when targeted at the parent `<g>` instead (measured: an 18×18 ring's `<g>` inflated to 57×57 on its own first pass) — see the build report for the full measurement |
| `scene/batchWire.ts` | (a) + (c) | (a) every DECISION from SystemSketch `batchWiring.ts` + `wireIntoState.ts` — `resolvePair`'s name-match-then-single-legal-then-refuse rule (:156-215), `wireIntoTargetKeys`' per-SOURCE (not per-port) eligibility (:407-425), the refusal precedence and words (:80-102), `describeBatchWireOutcome`'s four sentence shapes (:257-271), the selection read (:350-366), and the arm-only-if-the-ring-is-non-empty pre-check (`wireIntoState.ts:78-82`). (c) all the code: the donor is tldraw-`Editor`-bound line by line, so nothing compiled across. `batchWireEdges`/`applyBatchWire` are ours — the donor's `createBatchConnections` (:281-338) is binding creation and history marking, of which only the plan-then-re-judge ORDER survives | Opened both donor files in full at `/home/bam/systemsketch/.claude/worktrees/vision-consolidated/src/blocks/connections/`. **The donor is UNTRACKED there** — `git log` for those paths is empty, so these citations are against working-tree files and cannot be pinned to a rev. Line numbers verified by `sed -n` on that disk copy, 2026-09-17 |
| `scene/batchWire.standIn.ts` | (c) | **None claimed.** A stand-in availability predicate, written here, to be DELETED when the sibling lane's `edgeValidation.ts` lands. Only the refusal-reason VOCABULARY is borrowed — SystemSketch `connectionRules.ts:37-45`'s `ConnectionRefusal` union — so the two taxonomies agree; the rule bodies are not ported (the donor's judge reasons over tldraw shape faces and per-regime cycle policy, neither of which exists here) | `connectionRules.ts:37-45` opened and confirmed to be exactly that eight-member union; `judgeConnection`'s body (:102-147) read and deliberately NOT ported |

**Why `sketchAtEdge.ts` is honestly "ours".** No library was found that
does this: a post-layout DOM pass that appends drawn twins keyed on a
`data-slot` contract. The alternative that *does* exist — an SVG
`feTurbulence` displacement filter — was built and rejected on measured
grounds, not taste: it erodes the stroke into a thin broken line, cannot
produce a second pass (countable: tldraw's look needs two or more `M`
commands, a filter yields exactly one), cannot pin endpoints, and visibly
distorts label text. See `docs/peps/0001-sketch-skin-at-the-boundary.md`.

---

## `src/magnet` — magnetic wire proposals

Added 2026-09-18 by the magnetic-wires lane. Classes are this document's own:
**(a)** ported, **(b)** a real named technique with verified implementations,
**(c)** ours, ad hoc. `src/magnet/magnetProvenance.test.ts` is the runnable
half — it `existsSync`s every donor path these rows cite and asserts the
donor's own words still travel in the headers, the same way
`src/components/elbow/provenance.test.ts` does for the Excalidraw port.

| File | Class | Donor / prior art | Verified how |
|---|---|---|---|
| `magnet/magnetPortTypes.ts` | (a) | `/home/bam/systemsketch/src/blocks/connections/connectionModel.ts` — `arePortTypesCompatible` :138-153, `PortTypeVerdict` :155, `WILDCARD_PORT_TYPES` :158, `isWildcardPortType` :160-162, `normalizePortType` :164-166. Branch for branch, including the ORDER (undeclared checked before wildcard) and the donor's stated reason for case-insensitivity | Opened on disk 2026-09-17/18 (`sed -n` on the real file, donor tree read-only). `magnetPortTypes.test.ts` is table-driven against the donor's own branches, 15/15; the branch-order case is pinned separately because swapping the two branches passes every other row |
| `magnet/magnetProposals.ts` | (a) + (b) + (c) | **(a)** the radius form — `connectionHit.ts` `targetPageUnits` :133-137 (`pageUnits ?? screenPx / safeZoom`, then `Math.min(raw, MAX_HIT_TARGET_PAGE)`; `MAX_HIT_TARGET_PAGE = 24` at :102) and `blockPorts.ts:516-527` (`getBlockPortDotsNear`; `CONNECTION_PORT_MAGNET_RADIUS = 13` at :39); the per-candidate bounds±radius reject `blockPorts.ts:538-541`; `if (port.hidden) continue` :551 → `inert`; and the NEAREST-LEGAL ordering, `connectionRules.ts:337-360` (*"An illegal dot never shadows a legal one behind it: refusal is judged per candidate, in distance order"*). **(b)** fixed-radius near-neighbour search by linear scan with an axis-aligned early reject and a squared-distance test — four independent implementations, cited in the `scanMagnets` header. **(c)** the tie-break ladder (lexicographic `portKey`, a deliberate divergence from all three libraries studied), `MAGNET_DEFAULT_RADIUS = 48`, `MAGNET_RADIUS_MAX_SCENE = 240`, `ConnectionJudge`/`composeJudges`, and PER-PORT radius itself | All four donor paths opened on disk. React Flow read in the version installed in THIS worktree (`@xyflow/system@0.0.82`, `dist/esm/index.mjs` — `getNodesWithinDistance` :2367, `ADDITIONAL_DISTANCE = 250` :2386, `getClosestHandle` :2387-2419, `isValidHandle` :2618), and `magnetProvenance.test.ts` asserts that version against the real `package.json` so a bump fails the citation instead of rotting it. The "no spatial index" decision is a MEASUREMENT, not a reading: grid-vs-linear crossover at n≈500-1000, our regime tens-to-low-hundreds, linear ~6-8 µs/frame at 10× our regime |
| `magnet/useMagnetDrag.ts` | (c) | **None claimed for the code.** The composition target (`interaction/useDragIntent.ts`) is this repo's own; measure-once is derived from the measurement above, not from a donor. Only the CONVENTION is borrowed — transient drag state kept host-scoped, reset on cancel/end, never written to the document — which `/home/bam/systemsketch/src/blocks/ports/portState.ts` and `/home/bam/systemsketch/src/behaviorTree/treeDragRefusal.ts:1-23` establish independently of each other | Both donor files exist on disk (asserted by the provenance test). The "host measures, the model never self-measures" contract is `/home/bam/systemsketch/src/behaviorTree/liveDragWires.ts:1-31`, opened and quoted |
| `magnet/magnetProposalLayer.tsx` | (c) | **None claimed.** It invents no renderer: the dotted line is `components/trace.tsx`'s existing `variant="delayed"` (`traceStrokeStyle` :322-326, from `DELAY_DOT_PX`/`DELAY_DOT_GAP_PX` at `trace.layout.ts:307-308`; `TRACE_VARIANT_LABELS.delayed` is literally `"Dotted"`), and the dev overlay reuses `components/hitRegion.ts`'s tokens. Borrowing `delayed` for a transient meaning is honest borrowing of a semantically wrong name and is owed upstream | The dash is MEASURED, never inferred from the prop: story A9 reads `getComputedStyle(...).strokeDasharray` (`0.1px, 6px`) and `strokeLinecap` (`round`) off the live DOM, and `docs/capture_magnet_shots.mjs` re-reads it under a real mouse on every capture |

**What is honestly OURS, said plainly** (the brief asked for prior art, and two
of the five requirements have none in the libraries actually read):

1. **Per-port magnet radius (R1) has no library precedent.** JointJS's
   `SnapLinksOptions` is a single global-per-paper `radius`
   (`types/dia.d.ts:1728-1730`), and maxGraph's `graph.tolerance` is one
   graph-global scalar. SystemSketch is the only donor for the
   scene-radius-with-a-screen-floor *form*, not for its per-port-ness.
2. **Node-proximity, not cursor-proximity.** Every proximity system read this
   run resolves candidates from the live POINTER — React Flow
   (`index.mjs:2537`), litegraph.js, tldraw. Zach asked for *"if you move a
   node close enough"*: distance from the dragged node's OWN ports, which sit
   at an arbitrary offset from wherever the user grabbed. `MagnetPort.at` is
   the right primitive for that, and it is a different problem.
## `apps/storybook-basics/src/layout` — fit to content (2026-09-18, fit-to-content lane)

New directory. `src/layout/` holds geometry that is about a Block's **box**
rather than about one component's internals — see the report for why it was
kept out of `src/components` (a concurrent lane owned that directory) and for
the recommendation that it eventually move beside `blockPort.layout.ts`.

| File | Class | Donor / prior art | Verified how |
|---|---|---|---|
| `layout/fitToContent.ts` | (c) + spec | **(c) every line of arithmetic is ours**, derived from this kit's own exported constants (`PORT_EDGE_SLOT_MIN_PX`, `RAIL_GAP_PX`, `RAIL_MAIN_INSET_PX`, `CONTAINER_BORDER`/`CONTAINER_PADDING`). The donor computes over tldraw shape props and its own `NODE_ROW_HEIGHT_PX = 44`, none of which exists here, so nothing could be copied even in principle. **Spec only**, from SystemSketch, all read read-only 2026-09-18: `blockPortViewHeightForSlots` → `layoutBlock.ts:495-517` (the "inverse of the clamp" idea and its own coupling warning, quoted verbatim in the code); `portViewSlotCount` → `layoutBlock.ts:461` (`planBodySlots`, `outputStart = slot + inputs.length`) via `blockPortSlotCount` (`:490`); `railPitchForBand` → `layoutBlock.ts:1434` (`pitch = Math.min(NODE_ROW_HEIGHT_PX, available / plan.slotCount)`), reproduced as a **detector**, not as a layout step; `fitBoxToMembers` → `blockAutoResize.ts:87-118` (`Box.FromPoints` + a uniform pad) and its empty-container rule at `:220-223`. `gapCountFor`'s four cases are read off CSS Box Alignment Level 3's normative definitions, already quoted in `portEdge.layout.ts`'s `mainAxisPositions` docblock (§1 of this file). `resolveBlockHeight` is **(c), ad hoc — no prior art claimed**; it is three `Math.max` expressing Zach's "floored, never overridden". | Every donor range opened with `sed -n` on `/home/bam/systemsketch/src/blocks/` (read-only; nothing written there). `layoutBlock.ts` is 1,674 lines and `:1434` really is the `Math.min` clamp; `blockAutoResize.ts` is 276 lines and `:27` really is `BLOCK_AUTO_RESIZE_PADDING_PX = 56`. **The 56 is deliberately NOT ported** — the donor's own `:21-27` says it is sized for tldraw's single-scalar `fitFrameToContent` and a 48px header, which is a stock-API workaround rather than a design value; see that function's WHY. |

**Moved 2026-09-22 (lane `trace-defaults`):** `railBandHeightForSlots` (with
`gapCountFor` and `RailBandMetrics`) now lives in
`components/blockPort.layout.ts`, verbatim, docblock and all;
`scene/fitToContent.ts` re-exports it. Same classification as above. Beside
it:

| File | Class | Donor / prior art | Verified how |
|---|---|---|---|
| `components/blockPort.layout.ts` — `minBlockHeightFor` | (c) | **Ours — a composition, no new arithmetic.** It runs the renderer's own `railPlanFor` for each side wall and sizes the band with `railBandHeightForSlots` (above); the only rules of its own are "a lone dot needs one slot and no end gaps" and "a `body`-band rail adds the MEASURED header/footer". The rule it enforces is SystemSketch's `blockPortViewHeightForSlots` (`layoutBlock.ts:495-517`), already cited above for `blockPortViewMinHeight`, which is its port-view special case. | `minBlockHeight.test.ts` (12 cases) checks the headline case against an independent placement — `alignedFirstCentrePx` + one `railPitchPx` per port — not a restated formula: at the floor the last slot meets the body bottom exactly, 1px under it does not. Mutation-tested: `n - 1` slots turns 9 of 12 red. |
| `components/trace.tsx` — `traceRingGapPx` / `traceDefaultGapPx`; `skin/portVariants.ts` — `portDotRingRadiusPx` | (c) | **Ours, ad hoc** — "end the line on the painted ring": outer radius = dot box / 2 + the variant's gap + ring (the same `portVariantRingOverhangPx` the table already published), plus half the stroke for the round cap. No prior art claimed. | `TraceDefaults.stories.tsx` reads the ring off the dot's COMPUTED `box-shadow`, never off these functions; restoring the old fixed 16px turns it red (9.00px off the ring). |

### The one number this lane could not take from anywhere

`railBandHeightForSlots`'s `distribution` parameter has **no donor**. It exists
because `fitToContent.test.ts`'s "holds the full pitch in EVERY distribution"
failed on its first run — measured 33px where 42px was expected on
`space-around` — which established that the space-* schemes spend gap on the
container's **ends** and therefore need a taller band than `aligned` does for
the same visual pitch. The donor has no equivalent because it has no
distribution concept: it places rows arithmetically at a single computed
`pitch`. Ours, ad hoc, found by testing rather than by reading.
## Validation stack (2026-09-18) — the story lane's own rows

Added by the story lane (worktree `wf_166de375-080-8`) per D7/D8 of the
"final spec" — that spec's own write-set table assigns this shared file's
new rows to the story lane; the scene and component lanes carried their
provenance in file headers only (`edgeValidation.ts`, `lint.ts`,
`availability.ts`, `bubble.ts`, `trace.layout.ts`, `traceMark.tsx`,
`traceBadge.tsx`, `port.tsx` — read those headers for the full citations;
this table indexes them, it does not restate them).

| File | Class | Donor / prior art | Verified how |
|---|---|---|---|
| `scene/edgeValidation.ts` — `ConnectionVerdict` (two-outcome union) | (c) | Behaviour-derived from maxGraph `getEdgeValidationError`'s three-valued contract (Apache-2.0, `ValidationMixin.ts:59-130` @ v0.24.0) — the silent (`''`) case is deliberately NOT ported (Zach, 2026-09-17: "everything should connect and everything after that should have a reason"), and RUNNING maxGraph's own `validateGraph` showed the silent case is invisible even to its own audit (`\|\| ''` at `:182-187`) — the architectural argument this override rests on | Header pre-existing, cites the fetched file and the live repro |
| `scene/lint.ts` — `type-mismatch` rule + `typesIntersect` | (a) shape, (c) wiring | Blockly `ConnectionChecker.doTypeChecks` (Apache-2.0, fetched `github.com/google/blockly` main `core/connection_checker.ts:203-219`) — list-intersection compatibility, adopted after maxGraph `Multiplicity.check` was RUN and found to silently no-op for every ordinary edge (`checkTerminal` receives the edge, not a type, in the `terminal` parameter — `Multiplicity.ts:147-150` vs the call site `:204-208`, v0.24.0) | Header pre-existing; this session re-verified the rejected-donor repro against this tree's own `lint.test.ts` |
| `scene/availability.ts` — `connectionAvailability` | (c), lifecycle (a) | Once-per-gesture contract behaviour-derived from JointJS `markAvailable`/`_markAvailableMagnets`-`_unmarkAvailableMagnets` (MPL-2.0, dist `joint.js:31927-31952`, run live: an incompatible magnet under the pointer mid-drag changed nothing) — no JointJS source copied, the MAP itself is ours | Header pre-existing |
| `scene/bubble.ts` — `surfaceFindings`/`visibilityFromHides` | (a) inverted | maxGraph `validateGraph`'s recursive walk + collapsed-parent bubbling (Apache-2.0, `ValidationMixin.ts:140-206`, bubbling at `:173-179`) — inverted (flat lint list climbed UP to a carrier, not a top-down re-validate) and deliberately does NOT repeat two observed maxGraph defects: folding every descendant into one generic string, and `setCellWarning(cell,null)`'s `removeCellOverlays` deleting unrelated overlays (`OverlaysMixin.ts:89-155`, reproduced) | Header pre-existing; this lane's `FoldBubbling.stories.tsx` restates the mechanical "no view name anywhere in this file" claim as a live assertion (`EngineIsViewNameFree` story) rather than a static grep, since a browser test cannot read its own repo's source |
| `components/trace.layout.ts` — `resolvePathAddress` | (a) `{px}` form, (c) fraction form | `{px}` negative-from-end behaviour-derived from JointJS `Path.pointAtLength`'s negative branch (MPL-2.0, dist `joint.js:7780-7830`, run live: `distance:-20` landed ~28px from the target end). Negative FRACTION semantics (`t = 1 + f`) are OURS — JointJS's own percent form clamps negatives to 0 instead (dist `joint.js:8042-8069`, run live) — never claimed as a port | Header pre-existing; `trace.address.test.ts` reproduces both findings as its own R4a describe block |
| `components/trace.layout.ts` — `separateAlongPath` | (c) | Ours, ad hoc — the observed gap that justifies it: JointJS `ToolsView` positioning has ZERO collision avoidance (two `distance:'50%'` tools rendered at the identical pixel, dist `joint.js:37752-37820`, run live) | Header pre-existing; this lane's `TraceMark.stories.tsx` (`PillCollisionYield`) exercises it end-to-end through the real component, not just the pure function |
| `components/traceMark.tsx` | (c), composes (a)/(c) above | New component; composes `resolvePathAddress`/`tangentAtFraction`/`separateAlongPath` (above) with the pre-existing `DiagnosticFlag` (`highlighter.tsx`) | Header pre-existing |
| `components/port.tsx` — `availability` paint (`resolveAvailabilityPaint`) | (c) | Ours — the precedence rule (`availability > hinting > dimmed > state`) is a product decision (ruling 5), not a port; JointJS's own `available-magnet`/`available-cell` are CSS class names only (dist `joint.js:31927-31952`), no precedence model to port | Header pre-existing |
| `components/blockPort.tsx` — `renderItem`/`renderCollapsed` now forward `diagnostics`/`availability` | (c) | Ours, ad hoc — a genuine integration gap this lane's own stories surfaced: `PortEdgeItem` has carried `diagnostics`/`availability` since the component lane's `port.tsx`/`portEdge.tsx`/`labeledPort.tsx` work landed, but `blockPort.tsx` (untouched by either implementation lane; not in either lane's declared write set) never forwarded either field from an item to the `Port`/`LabeledPort` it renders — so `decorate`'s paint seam could set every field correctly and the rendered dot still showed nothing. `collapsedDiagnostics` (concatenate) and `collapsedAvailability` (`"available"` wins) are new, ad hoc aggregations for the one-dot-stands-for-many case, modelled on the file's own pre-existing `collapsedState`'s "any wired wins" shape | Found via `ValidityPreview.stories.tsx`'s own failing assertion (a live browser test, not a guess) — `pnpm exec vitest --project=unit run` (623/623) and `pnpm test-stories` (243/243, all 56 files) both green after the fix; see this session's own report for the reproduction |
| `hosts/nodeViews.tsx` — `Decorate`/`SceneNodeDecoration` seam | (c) | Ours — the adds-only host paint seam D7/D8 asked for, undefined = byte-identical to every prior story | New file addition, not a port |

---

## Polarity unification (2026-09-18) — `docs/peps/0002-the-judge-owns-edge-orientation.md`

The lane that gave `ConnectionVerdict`'s allowed branch a required
`oriented: ConnectionOrientation`, added the `polarity` gate/lint rule, real
`validateConnectionJudge` behind batch wiring's `WireJudge` seam (deleting
`batchWire.standIn.ts`), and wired `directionOf` into `connectionAvailability`.

| File | Class | Donor / prior art | Verified how |
|---|---|---|---|
| `scene/edgeValidation.ts` — `ConnectionOrientation`/oriented `ConnectionVerdict` | (c) | Ours — no library studied returns orientation as verdict DATA rather than a gesture-time side effect. SystemSketch's own `ConnectionVerdict` ok-case carries explicit `source`/`sink` endpoints (`connectionRules.ts:53-63`, opened) — the SHAPE (verdict owns orientation) is behaviour-derived from that, the TYPE-LEVEL "no allowed verdict without one" discriminant is ours | `docs/peps/0002` records the two independent bug reports (batch wiring's backwards-edge regression, the validation-stack audit) that converged on this; `edgeValidation.test.ts`'s "allowed" describe block asserts every case |
| `scene/edgeValidation.ts`/`scene/lint.ts` — `polarity` gate/rule (`same-polarity` refuse, `reversed` finding) | (c) rule, (a) precedent | SystemSketch `connectionRules.ts:186` (`same-polarity` refusal) and `:222-234` (`decideDirection`, which FLIPS a reversed-but-legal pair rather than refusing it) — both opened on disk. `PortDirection`/`PortDirectionOf` as a caller-SUPPLIED resolver (not a scene-model field) is ours: the donor DERIVES polarity from `portPolarity(port.side, face)` (`connectionModel.ts:99`), and this kit has neither lanes nor faces to derive it from | `lint.test.ts`'s `polarity` describe block; `availability.test.ts`'s `directionOf` describe block reproduces the exact output→output probe (`num1/out` painting `num2/out` "available") before and after the fix |
| `scene/batchWireJudge.ts` — `validateConnectionJudge` | (c) | Ours — the translation `batchWire.ts`'s and `batchWire.standIn.ts`'s own comments promised ("the fix is one line") but did not build; no donor claimed, since the shape being bridged (`WireVerdict` vs `ConnectionVerdict`) is this repo's own | `batchWire.test.ts`'s `judgeWith` describe block (formerly `standInJudge`'s own suite) passes unchanged against the real engine; `BatchWiring.stories.tsx`'s 6 play-function stories pass unchanged |
| `hosts/hostScene.ts` — `hostPortsOf`/`hostPolarityOf` (moved from deleted `batchWire.standIn.ts`) | (c) | Ours, relocated verbatim — host-geometry READERS (wall placement -> polarity), not a rule engine; no behaviour changed in the move | Same test suite as above, now importing from the new location |
| `hosts/validationScene.ts` — `VALIDATION_SCENE` (the shared host-story fixture) | (c) | Ours — extracted from `ValidityPreview.stories.tsx`'s pre-existing `VP_SCENE` (kept, `ValidationHosts.stories.tsx`'s divergent `VH_SCENE` retired) so both host benches judge the identical record | `ValidityPreview.stories.tsx` and `ValidationHosts.stories.tsx`'s play functions both assert `sink/in`/`sink/in2` read the SAME value in both hosts |

---

## `src/hosts/reactFlowHost.tsx` — `TraceEdge`

Added 2026-09-18 by the host-fixes lane (defect 3: the host was drawing
React Flow's stock bezier for every wire — no `edgeTypes` entry ever claimed
a `type`, so none of `trace.tsx`, `wireLayer.tsx`, or any per-edge
`WireStyleData` ever reached this host). This app's own title scopes this
document to `src/components`; `TraceEdge` lives in `src/hosts` instead, but
the brief that reopened this file asked for it here specifically, so it gets
its own section rather than a silent omission.

| File | Class | Donor / prior art | Verified how |
|---|---|---|---|
| `reactFlowHost.tsx`'s `TraceEdge` | (a) | `demos/scene/src/TraceEdge.tsx:1-46` (this repo, same worktree) — the `getBezierPath` + `TraceBody` split and its own stated rule, *"the HOST owns the geometry (`getBezierPath` here, tldraw's arrow info there) and the core owns the paint"* | Opened on disk before writing `TraceEdge`; the donor calls `@bbox-ui/core`'s `TraceBody` (the published package) where this port calls the trunk's own `../components/trace.tsx:376` `TraceBody` — same component, different lineage, cited in-header |
| — the `length` estimate (`Math.hypot` of the two endpoints) | (c) | None claimed — the donor itself passes a hardcoded `length={0}` with the comment "React Flow gives no path length"; using the chord length instead of `0` is this port's own call, not read anywhere | `trace.tsx:316-318` confirmed the async dash PATTERN (`ASYNC_PACKET_DASHARRAY`) is a fixed constant independent of `length` — only the dash PHASE reads it — so the estimate's blast radius is bounded and was reasoned from the code, not measured against a reference length |

---

## `src/hosts/` — `fit-to-content-hosts` lane (2026-09-18)

Wires `layout/fitToContent.ts` (already classified above, "fit to content"
section) into real drag gestures on both canvas hosts. All three new/changed
files are `(c)`, ours, ad hoc, over a documented rule from Vyuh Flow's own
prior art for the one thing that isn't pure wiring — the reentrancy latch.

| File | Class | Donor / prior art | Verified how |
|---|---|---|---|
| `hosts/memberDrag.ts` — `useFreeMemberDrag` | (c) | Ours, ad hoc — plain `PointerEvent` + `setPointerCapture`, shaped like `blockMembers.tsx`'s own `MemberDndBoundary` (one boundary, one active id) but answering a continuous (x, y) rather than `MemberDndBoundary`'s ordering question, so dnd-kit's `PointerSensor`/`closestCenter` do not apply. The live/settle split (`onDragChange` vs `onDragEnd`) restates this repo's OWN existing idiom, not outside prior art: `reactFlowHost.tsx`'s `NodeResizer.onResizeEnd` and `tldrawHost.tsx`'s `onTranslateEnd`/`onResizeEnd`, both already committed here for the same reason (their own comments) | Both cited files opened in this session; `blockMembers.tsx`'s `free` layout confirmed to have zero pointer listeners (`slotStyle`'s `free` branch is a bare `position: absolute`) before writing this hook, so nothing was duplicated |
| `hosts/blockAutoFit.ts` — `useAutoFitHeight` | (c) | Measurement PATTERN (not code) from `FitToContent.stories.tsx`'s own `useBlockChrome` (this repo, same worktree, `apps/storybook-basics/src/stories/FitToContent.stories.tsx:101-132`) — same `[data-slot="block"]`/`[data-slot="block-header"]`/`[data-slot="block-footer"]` targets, same equality-guarded `ResizeObserver`. The **reentrancy latch** (`applyingRef`) is modelled on Vyuh Flow's `_isMovingGroupNodes`/`shouldSkipUpdates` pair, named in this repo's own prior-art report (`reports/media/node-editor-prior-art-visuals-2026-09-18.html`, card 6) for the identical bug class, and on this repo's OWN prior incident: `reactFlowHost.tsx`'s `NodeResizer`, whose `onResizeEnd` comment (`:326-329`) records writing per-move feeding back into XYResizer's gesture math and collapsing the node | `FitToContent.stories.tsx` opened before writing this file; the prior-art report opened for the Vyuh Flow card; **the latch's own necessity was mutation-tested, not assumed** — this lane temporarily deleted the `if (applyingRef.current) return` line, reran `FitToContentHosts.stories.tsx`'s `Drag A Member` stories (both hosts), and they still passed, including the convergence assertion. So in THIS geometry (free members are `position: absolute` from a fixed region origin; the Block only grows downward) the latch is verified-inert insurance, not a fix for an observed bug — documented as exactly that in the code, not oversold |
| `hosts/nodeViews.tsx` — `moveMember` | (c) | Ours — same referentially-honest no-op shape as the file's own pre-existing `reorderNodePorts`/`writeNodeData`. Writes into `SceneNode.position`, whose meaning for a `parentId` node was already documented at `scene/scene.ts:60-72` ("the node's authored at-rest placement, in the PARENT's coordinate space... a host mid-drag owns the moving copy and writes back here at rest") before this lane — nothing read or wrote that meaning until now | `scene.ts:60-72` opened; confirmed no prior caller ever read a member's `position` for placement (`childrenOf`'s only other consumer, `BlockNodeView`'s pre-existing `stack` branch, never referenced `kid.position`) |
| `hosts/nodeViews.tsx` — `BlockNodeView`'s `measureKey` wiring | (c) | Ours, ad hoc — the specific defect it fixes (a live drag moves a descendant's position without changing the observed root's SIZE, so `ResizeObserver` alone never wakes) has no cited prior art; it is a plain fact about the `ResizeObserver` spec, not a technique borrowed from anywhere | **Mutation-tested**: this lane removed the `measureKey` argument from the `useAutoFitHeight` call, reran the same two stories, and both failed with `slot.bottom` exceeding `box.bottom` mid-drag — the exact "member walks past the wall while the gesture is still in flight" symptom this whole feature exists to prevent. Restored and reverified green (60/60 files, 260/260 stories) |

Owed wiring this lane could not do from `src/hosts/**` alone (fenced out of
`src/components/**`, a skin-migration lane owns it this session): the whole
of `hosts/memberDrag.ts` belongs beside `blockMembers.tsx` as `free`
layout's own `onMembersChange` counterpart to `stack`'s dnd-kit boundary,
not a second, host-side implementation. See the lane's own report for the
exact proposed shape.
## `src/detach` — detach-to-primitive (2026-09-18, detach-to-primitive lane)

New directory, `apps/storybook-basics/src/detach/`. This app's own title
scopes this document to `src/components`; the detach kit lives beside it in
`src/detach` for architectural reasons stated in that directory's own
`index.ts` header, so it gets its own section here rather than a silent
omission (the same accommodation `reactFlowHost.tsx`'s section above makes).

Two donors were read in full before writing anything: the pre-reset adapter
still in THIS repo (`packages/adapter-tldraw/src/detach/*`, frozen v1,
1,697 lines) and SystemSketch's generic sweep machinery (`/home/bam/systemsketch/
src/detach/*`, read-only, 964 lines). Only the first is cited below with line
numbers, because only the first shares a live class hierarchy with this app's
own code closely enough to port by value; SystemSketch's sweep is architecture
**prior art** (the phased-sweep rationale, cited in `detachableKind.ts`'s own
header) rather than a source of ported lines — its own kinds match by a
different mechanism again (SystemSketch has genuinely separate shape types per
concept, same as the pre-reset adapter; this app has neither).

| File | Class | Donor / prior art | Verified how |
|---|---|---|---|
| `detachModel.ts` | (a) | `packages/adapter-tldraw/src/detach/detachModel.ts` (this repo) — `toJsonSafe`/`sanitize` (`:91-124`), `detachMeta`/`readDetachedRecord` (`:127-138`) ported near-verbatim; the RECORD SHAPE itself differs (see file header) because this app's `bbox-node` shape carries almost none of its own persisted state | Opened in full 2026-09-18 before writing; donor is 216 lines |
| `detachableKind.ts` | (a) rationale, (c) mechanism | `packages/adapter-tldraw/src/detach/detachableKind.ts` — the phased-sweep INVARIANTS and their justification (`:1-29`) ported near-verbatim as prose; the `matches`/`lowerNode` contract is re-typed around a `SceneReader` this app's kinds need and the donor's did not (donor matched by `shape.type`; this app's one shape type is always `"bbox-node"`, so a kind matches by the SCENE node's `type` instead) | Opened in full; donor is 71 lines |
| `detachPlan.ts` | (a) | `packages/adapter-tldraw/src/detach/detachPlan.ts` — `planDetach`'s walk-and-dedupe and `orderNodes`'s stable sort ported near-verbatim (`:28-70`) | Opened in full; donor is 70 lines; `detachPlan.test.ts` restates its own 4-case suite adapted to the `SceneReader` signature |
| `detachSweep.ts` | (a) + (c) | `packages/adapter-tldraw/src/detach/detachSweep.ts` — the `editor.run` wrapping, single history mark, tool guard and "replace selection with replacements" rule ported near-verbatim (`:26-66`); the scene-removal half (filtering `scene.nodes` after the sweep) is ours — the donor has no scene layer to update | Opened in full; donor is 66 lines |
| `lowerShared.ts` | (a) | `packages/adapter-tldraw/src/detach/lowerShared.ts` — `lowerToGroup`'s rotation math (`:49-62`), the one-child-group fallback and the per-row nested-group device ported near-verbatim; `rekeyReceivedPorts` deliberately NOT ported (see file header — nothing in this app's current wiring computes the runtime flag it would carry) | Opened in full; donor is 133 lines |
| `rebuild.ts` | (a) + (c) | `packages/adapter-tldraw/src/detach/rebuild.ts` — the anchor-based position/rotation recovery (`anchorIdWithin`, the page-transform math, `:88-99`) ported near-verbatim; the scene-node re-creation half (minting the `bbox-node` shape directly AND pushing the node back into `HostScene`) is ours — see file header for the reconciliation gap this closes | Opened in full; donor is 151 lines |
| `stockShapes.ts` — `TLDRAW_TEXT_LINE`, `STOCK_TEXT_BASES`, `stockTextStyle` | (a) | `packages/adapter-tldraw/src/detach/stockPartials.ts:34`, `:72-87` | Opened in full; donor is 368 lines |
| `stockShapes.ts` — `renderedLineMeasureFor` | (a) | `stockPartials.ts:103-123` | Same read |
| `stockShapes.ts` — `textAtDom`'s centering formula | (a) | `stockPartials.ts:311-324` (`textAt`'s `x`/`y` derivation) — this app's version centers on BOTH axes rather than reading an `align` enum; see the function's own doc for why that is a deliberate simplification, not an oversight | Same read |
| `stockShapes.ts` — `geoAtBox` | (a) | `stockPartials.ts:348-368` | Same read |
| `stockShapes.ts` — `measureText`/`truncateToWidth`/`splitGraphemes` | **not ported** | Deliberately omitted — see `stockShapes.ts`'s own header for why this kit never needs to guess a text box's width | — |
| `stockShapes.ts` — `boxRelativeTo`/`textBoxRelativeTo`'s `editor.getZoomLevel()` division (F1 fix, 2026-09-18) | (c) | **Ours, no donor precedent** — the donor's `stockPartials.ts` is a pure layout function over PROPS (`@bbox-ui/core`'s closed-form engine), with no DOM read and therefore no camera/zoom concept to divide out; that need comes entirely from this kit's own DOM-measurement approach (see file header). Confirmed bug fixed here: these two functions used to take `scale = 1` and every call site omitted the argument, so a detach at a non-1 camera zoom baked the screen-space zoom into the model (measured: `z=2` → a 220×140 card detached to 440×280, exactly 2×) | Reproduced directly (`editor.setCamera({z:2})` before detach) and regression-tested — `DetachToPrimitive.stories.tsx`'s `ZoomInvariance` story (z=0.5/1/2) and the `RebuildMenuStates` story's own z=2 integration check; both mutation-verified by reverting the division |
| `stockShapes.ts` — `textAtDom`'s wrap branch (F2 fix, 2026-09-18) | (c) | **Ours, no donor precedent** — the donor never wraps a detached label (`@bbox-ui/core`'s layout contract hands its shapes a pre-computed line count as a prop); this kit derives line count itself from the live DOM's measured ink-box height, because it has no such prop to read. Confirmed bug fixed here: the prior single-branch code floored a text shape's width at tldraw's own single-line measure, which can never wrap — a 3-line live header (a long block name) detached to one 393px-wide line, overhanging the card by ~115px | Reproduced directly and regression-tested — `DetachToPrimitive.stories.tsx`'s `wrapping-header` gallery row, mutation-verified by reverting the branch |
| `definitions/port.ts` — `emitPortPrimitives`'s structure | (a) rationale, (c) mechanism | `packages/adapter-tldraw/src/detach/portPrimitives.ts` — "bottom of the hierarchy, invoked per port" framing (`:1-13`) carried over as prose; the STATE→colour table (`STATE_STOCK_RING`) reproduces the donor's `STATE_STOCK_RING` (`:79-86`) for the three states it shares | Opened in full; donor is 141 lines |
| `definitions/port.ts` — `received` state → stock `"green"` | (c) | **Ours, no donor precedent** — the donor's own `PortState` excludes `received` as runtime-only (see that file's own doc); this app's `PortState` persists it. A fresh judgement call, stated as one in the code, not dressed up as a port | — |
| `definitions/block.ts` | (a) rationale, (c) mechanism | `packages/adapter-tldraw/src/detach/blockPrimitives.ts` — "card first, ports NOT drawn here, invoke the port reduction per port" (`:1-13`, `:90-96`) carried over as the file's own organizing rule; **not one line of the donor's actual geometry math is ported**, because this app's Block/BlockPort has no closed-form layout function to copy from (see `stockShapes.ts`'s header) — every box here comes from `getBoundingClientRect`/`Range` measurement of the LIVE DOM instead | Opened in full; donor is 219 lines |
| `editorContainer.ts` | (c) | Ours, ad hoc — no donor equivalent (the donor never mounts more than one `Editor` on a page at once) | Found by a real, reproduced defect: see this file's own header and `DetachToPrimitive.stories.tsx`'s mutation-test note in the lane report |
| `rebuildContextMenu.tsx` (2026-09-18) | (c) | Ours — tldraw's own `DefaultContextMenu`/`DefaultContextMenuContent`/`TldrawUiMenuGroup`/`TldrawUiMenuItem` (`tldraw` package, `TLUiComponents.ContextMenu` slot, verified against tldraw 5.3.2's own `.d.ts`) compose the one added menu group; no donor precedent (the pre-reset adapter never wired a live context menu) | `DetachToPrimitive.stories.tsx`'s `RebuildMenuStates` story asserts both states (present with rebuild info, absent without) via a real `fireEvent.contextMenu` + click, mutation-verified by forcing the group to always/never render |

### The one geometry step neither donor needed

`definitions/block.ts`'s "shift every measured box into the parent frame by
`shape.x`/`shape.y`" step (the `inParentFrame` map) has a DIRECT donor
precedent in spirit (`blockPrimitives.ts`'s own `origin` parameter, added at
every call site) but was NOT copied mechanically — it was independently
re-derived, got wrong on the first pass (every primitive landed off by
exactly the original shape's own position), and was only caught by the
measurement harness this lane's brief asked to build first. Recorded here
because it is the single most instructive proof that DOM measurement does
not exempt this kit from the donor's own coordinate-frame discipline — see
the lane report's "adversarial loop" section for the full repro (24px error,
one `sed`-sized fix, mutation-verified by reverting it).

## `blockPort.layout.ts` — `collapsedWallCenterPx` (2026-09-18, collapse-wires lane)

Zach, reacting to a screenshot of a Block's view toggle: "expanded view to
simple view is not an issue. All of the ports collapse to one that is
centered in the block body. You can refer to SystemSketch for this right
now." Brief asked for a pure closed form for that midpoint, usable as
`wireLayer.tsx`'s fallback when a wire's port has no rendered dot because the
view collapsed it.

**Measured before writing anything**: that fallback already exists.
`wireLayer.tsx`'s `resolveDot` (`:80-91`) has carried a second
`[data-collapsed-ports]` lookup since Group B wiring landed (`e6aea8e`,
2026-09-17), and `BlockWiring.stories.tsx`'s pre-existing `ViewsWired` story
already exercises it (its "sig,aux" case). `pnpm test-stories` on the
unmodified lane tip: 62 files / 268 tests, all green, including that story.
So this lane's actual gap was proof at the exact tolerance Zach's screenshot
asks for (three cables converging to ONE point, measured, not merely "a wire
exists") plus the missing pure statement of the invariant — not a bug fix.

| File | Class | Donor / prior art | Verified how |
|---|---|---|---|
| `blockPort.layout.ts` — `collapsedWallCenterPx` (left/right case) | (b) | SystemSketch `layoutBlock.ts:1282,1301-1330` (dataflow-lens "simple" collapse: `midpoint = height / 2`, `x: 0` input / `x: width` output — already the citation for `railPlanFor`'s own "simple" branch in this same file) and `blockPorts.ts:141-145` (`projectBlockConnectionPorts`'s `fallback`: `{ x: side === "input" ? 0 : layout.bounds.w, y: layout.bounds.h / 2 }`, the donor's OWN "nothing placed here, use one shared anchor" rule) | Both opened on disk 2026-09-18; the citations pre-date this lane in the first case (this file's own `railPlanFor` docblock) and were freshly read in the second |
| `blockPort.layout.ts` — `collapsedWallCenterPx` (top/bottom case) | (c) | None — the donor's own ports never populate a horizontal wall, so there is no `layoutBlock.ts` line to point at for it. This repo's `railPlanFor` DOES collapse a horizontal wall in "simple" view (`blockPort.layout.test.ts`'s pre-existing "still collapses on a horizontal wall" case), so the symmetric extension (swap axis, same "space-evenly over the whole `block` band" derivation) is this lane's own, stated as such in the function's own header | `blockPort.layout.test.ts`'s new `collapsedWallCenterPx` describe block cross-derives this case against `railBoxFor`'s real arithmetic for all four edges, not just asserted numbers |
| `wireLayer.tsx`'s existing `[data-collapsed-ports]` fallback (`:86-90`) | — not touched — | Landed 2026-09-17 by the Group B wiring lane (`e6aea8e`); this lane did not modify it | **Mutation-verified this session** anyway: temporarily replaced the loop with `return null`, reran `CollapseWireEndpoints.stories.tsx` — both `SideBySide` and `ToggleLive` failed (wire count 4→1, `data-unresolved-wires` naming the three collapsed inbound wires), confirming the new stories actually exercise this path rather than passing vacuously. Reverted; `git diff` on `wireLayer.tsx` is empty |

**Why `collapsedWallCenterPx` is NOT wired into `wireLayer.tsx` as a runtime
fallback, despite the brief asking for exactly that**: every wall
`railPlanFor` can collapse already renders a real, measurable stand-in dot in
every view (`blockPort.tsx`'s `renderCollapsed`/`renderItem`, both always
called for any populated edge regardless of `view`), so `resolveDot`'s
existing DOM lookup already covers 100% of "the view collapsed this port" —
there is no case left over for a computed answer to catch, and `wireLayer.tsx`'s
own module doc states the reason not to add one speculatively: *"WireLayer
never invents a point... An end that cannot be found is skipped, not guessed
at."* Adding an always-dark fallback branch would either sit as dead code or,
worse, mask a genuinely different unresolved case (e.g. a wire into an
unrendered child) behind a plausible-looking synthetic point. `collapsedWallCenterPx`
is instead the PROOF surface: `blockPort.layout.test.ts` derives it from
`railBoxFor`'s real arithmetic (not just asserted numbers), and
`CollapseWireEndpoints.stories.tsx`'s play functions measure the real
rendered DOM against it. Flagged here rather than silently narrowed, per this
lane's own brief on not silently widening or narrowing scope.

New story: `apps/storybook-basics/src/stories/CollapseWireEndpoints.stories.tsx`
(`area:blocks`, `lane:collapse-wires`) — `SideBySide` rebuilds Zach's own
screenshot (two rows, one scene, port then simple); `ToggleLive` is the
rigorous half, flipping ONE hub instance's view live and asserting the wire
count is unchanged across the toggle before measuring convergence.
## `apps/storybook-basics/src/scene` — the grouping algebra (2026-09-18, lane:grouping)

Five new files implementing collapse-to-region and its inverse. The headline
provenance fact is a **negative** one and it is the most useful line here:
the "line intersection logic with the port edge" Zach asked to be written as
a pure function **already existed in this repo** and was not rewritten.
`src/components/elbow/boundaryCrossing.ts` is a byte-for-byte SystemSketch
copy whose own docstring already names the use case verbatim — *"a group or
frame boundary port, for a cable that crosses in or out of a collapsed
group"*. `scene/portEdgeCrossing.ts` is an adapter over it, not a second
clipper.

| File | Class | Donor / prior art | Verified how |
|---|---|---|---|
| `scene/portEdgeCrossing.ts` | (c) over (a) | The intersection itself is **not ours**: `components/elbow/boundaryCrossing.ts`'s `boundaryCrossings` (Liang–Barsky), class (a), Excalidraw→SystemSketch, already carrying its own "zero code edits" banner and its own donor suite. Ours and class (c): `alongSide` (a linear remap of a point on a known wall to 0..1 along that wall — the donor computes position along the *segment*, never along the *wall*), the route/chord `by` provenance, and the inset-consistent normalisation | Read `boundaryCrossing.ts` and `geometry.ts` in full on disk 2026-09-18 before writing a line. `portEdgeCrossing.test.ts` (18 tests) checks the crossing point against an **independent oracle** — similar triangles, `y = y0 + (X−x0)(y1−y0)/(x1−x0)` — not against the clipper's own parametric form. Mutation-tested: replacing the inset-aware bounds with the raw box turns the inset test red (`expected +0 to be close to 0.0417`), restored |
| `scene/region.ts` | (c) | None claimed. `descendantsOf` is the same containment fixpoint `linking.ts`'s `deleteNode` already runs inline (made public and cycle-safe); `absolutePosition`/`ancestorsOf`/`selectionRoots` are new because nothing before this lane re-parented a node. `REGION_NODE_TYPE` rests on `SceneNode.type` already being React Flow's `nodeTypes` key — Zach's ruling, not a borrowed design | `region.test.ts` (18 tests), including a terminating-walk test per function against a malformed `parentId` cycle |
| `scene/boundary.ts` | (c) | None claimed, and none exists to claim: the classification is Zach's own sentence partitioned one clause per member, and `dagPolarityPolicy` is his own stated v1 heuristic. Cited compositions rather than reimplementations: `lint.ts`'s `PortDirectionOf` `source`/`sink` vocabulary, `edgeValidation.ts`'s `ConnectionOrientation.by` words (`"polarity"`/`"gesture"`), `blockPort.layout.ts:155`'s `RailBand`, and `blockPort.layout.ts:456`'s `functionPortCenterPx` as the seat the promoted port names | `boundary.test.ts` (22 tests), written as his sentence read back — one `describe` per quoted clause. Mutation-tested: inverting `outerIsSink ? "right" : "left"` turns 5 tests red, restored |
| `scene/collapse.ts` | (c) | The split-edge structure (one hierarchical pin, a net on each side) is the standard shape of a hierarchical netlist; **no specific source is claimed because none was read for this file** — it was derived from the requirement that dissolve be derivable rather than remembered. Cited compositions: `linking.ts`'s `DeletedNodeEdgePolicy` (`"drop"`/`"dangle"`/`"park"`) verbatim for the unbacked-port remainder, and `edgeValidation.ts`'s `CROSS_SCOPE` code for the refusal | `collapse.test.ts` (27 tests). The load-bearing one asserts `collapse → dissolve` returns a scene **deep-equal to the input**, array order included. Mutation-tested: dropping the position rebase turns 7 tests red, restored. The IEEE-754 position loss was found **by search** (3.3M pairs, 16% inexact, worst 5.8e-11 at magnitude 3.7e5), not assumed |
| `scene/boundaryWiring.ts` | (c) | None claimed. The lowest-common-ancestor walk is textbook over two explicit parent chains. Cited compositions: `portEdgeCrossing.ts` for placement (Zach: "placed via the intersection function"), `edgeValidation.ts`'s `CROSS_SCOPE`, `lint.ts`'s `typesIntersect` shape | `boundaryWiring.test.ts` (15 tests), including that the refusal message **names every boundary** that needs a port |

**What was deliberately NOT read, and why it is not cited.** maxGraph's
`GraphView.ts:1656-1679` collapsed-terminal resolver was described to this
lane by a parallel lane but was **not opened here**, so no behaviour in these
files is attributed to it. Its reported *stance* (promotion as a render-time
projection) was evaluated and **diverged from** — see
`docs/GROUPING-ALGEBRA.md` for the reasoning and the three Zach rulings that
force a document mutation instead. Citing it as a donor would be citing
something this lane never read.

## `components/regionViews.layout.ts` — region views (2026-09-22, lane `region-views`)

Zach's six region-view sketches (port · expanded tab/full-width · expanded
opaque · wall crossings · branches). Two geometry pieces: where the line
splitting control ports from ordinary ports goes, and where a wire crosses a
region frame's wall.

| File | Class | Donor / prior art | Verified how |
|---|---|---|---|
| `components/regionViews.layout.ts` — `regionControlSplitPx`, `regionRailBandPx`, `regionHeaderBandPx` | (c) | None claimed. This is the rail pitch arithmetic `blockPort.layout.ts` already states (`railPitchPx`, `offsetEdgePaddingPx`, `alignedFirstCentrePx`), read back as "the midpoint of the gap between slot n-1 and slot n". `regionRailBandPx` restates `scene/fitToContent.ts`'s `railBandHeightForSlots` because `src/components` may not import `src/scene` | `regionViews.layout.test.ts`: the split is checked against an **independent oracle**, `railPlanFor` + `alignedFirstCentrePx` plus one pitch per slot, not against this file's own formula. `regionRailBandPx` is checked equal to `railBandHeightForSlots` for 0-8 slots. Measured in the browser too: `RegionViews.stories.tsx` asserts that the painted line lies between the control dots and the ordinary dots. Mutation-tested: moving the painted line 30px down fails that story (`expected 156.5 to be greater than 169`); restored |
| `components/regionViews.layout.ts` — `wallCrossings` | (c) over (a) | The intersection is **not ours**: it is `components/elbow/boundaryCrossing.ts`'s `boundaryCrossings` (Liang–Barsky, Excalidraw→SystemSketch, a byte-for-byte donor copy), called as-is. Ours is only the translation into frame-local coordinates | Read `boundaryCrossing.ts` in full on disk before writing. `regionViews.layout.test.ts` checks a diagonal crossing against similar triangles (`y = y0 + (X−x0)(y1−y0)/(x1−x0)`), plus the enter/exit/elbow/none cases. In the browser, `RegionViews.stories.tsx` asserts that every marker centre sits on the measured frame border (±1px) and that there is one marker per crossing edge (the count comes from the fixture, independently of the geometry). Mutation-tested: offsetting the markers 6px fails that story (`marker at (154.0, 1098.8) is not on the frame border`); restored |
