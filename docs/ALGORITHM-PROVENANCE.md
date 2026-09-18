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

| File | Class | Donor / prior art | Verified how |
|---|---|---|---|
| `skin/sketchPath.ts` | (a) + (c) | (a) tldraw 5.3.2 `rng` ported verbatim; `toDrawD`'s displacement model from `lib/shapes/shared/PathBuilder.mjs`, `lib/shapes/geo/GeoShapeBody.mjs`. (c) `sketchWobbleFor`, `SKETCH_EDGE_POINTS`, `smoothThrough`, `flattenPathData` are ours — marked `DEVIATION` in-file with the calibration reasoning | In-file header cites the exact tldraw module paths; deviations self-declared |
| `skin/sketchOutline.tsx` | (a) | `packages/bbox-ui/src/sketchOutline.tsx` @ `c83c8b2`, byte-identical body | Header states the verbatim port |
| `skin/sketchAtEdge.ts` | (c) + model | (c) the DOM walk, the twin protocol and the measured seeding are **ours, ad hoc**. Model only: SystemSketch keeps hand-drawn at the host renderer via tldraw's own `dash: "draw"` shape prop — `/home/bam/systemsketch/src/inspector/inspectorModel.ts:742`, read read-only 2026-09-17 | Donor line opened; SystemSketch confirmed to carry **zero** custom sketch geometry — no roughjs, no `feTurbulence` |
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
||||||| fe7386d
## `apps/storybook-basics/src/layout` — fit to content (2026-09-18, fit-to-content lane)

New directory. `src/layout/` holds geometry that is about a Block's **box**
rather than about one component's internals — see the report for why it was
kept out of `src/components` (a concurrent lane owned that directory) and for
the recommendation that it eventually move beside `blockPort.layout.ts`.

| File | Class | Donor / prior art | Verified how |
|---|---|---|---|
| `layout/fitToContent.ts` | (c) + spec | **(c) every line of arithmetic is ours**, derived from this kit's own exported constants (`PORT_EDGE_SLOT_MIN_PX`, `RAIL_GAP_PX`, `RAIL_MAIN_INSET_PX`, `CONTAINER_BORDER`/`CONTAINER_PADDING`). The donor computes over tldraw shape props and its own `NODE_ROW_HEIGHT_PX = 44`, none of which exists here, so nothing could be copied even in principle. **Spec only**, from SystemSketch, all read read-only 2026-09-18: `blockPortViewHeightForSlots` → `layoutBlock.ts:495-517` (the "inverse of the clamp" idea and its own coupling warning, quoted verbatim in the code); `portViewSlotCount` → `layoutBlock.ts:461` (`planBodySlots`, `outputStart = slot + inputs.length`) via `blockPortSlotCount` (`:490`); `railPitchForBand` → `layoutBlock.ts:1434` (`pitch = Math.min(NODE_ROW_HEIGHT_PX, available / plan.slotCount)`), reproduced as a **detector**, not as a layout step; `fitBoxToMembers` → `blockAutoResize.ts:87-118` (`Box.FromPoints` + a uniform pad) and its empty-container rule at `:220-223`. `gapCountFor`'s four cases are read off CSS Box Alignment Level 3's normative definitions, already quoted in `portEdge.layout.ts`'s `mainAxisPositions` docblock (§1 of this file). `resolveBlockHeight` is **(c), ad hoc — no prior art claimed**; it is three `Math.max` expressing Zach's "floored, never overridden". | Every donor range opened with `sed -n` on `/home/bam/systemsketch/src/blocks/` (read-only; nothing written there). `layoutBlock.ts` is 1,674 lines and `:1434` really is the `Math.min` clamp; `blockAutoResize.ts` is 276 lines and `:27` really is `BLOCK_AUTO_RESIZE_PADDING_PX = 56`. **The 56 is deliberately NOT ported** — the donor's own `:21-27` says it is sized for tldraw's single-scalar `fitFrameToContent` and a 48px header, which is a stock-API workaround rather than a design value; see that function's WHY. |

### The one number this lane could not take from anywhere

`railBandHeightForSlots`'s `distribution` parameter has **no donor**. It exists
because `fitToContent.test.ts`'s "holds the full pitch in EVERY distribution"
failed on its first run — measured 33px where 42px was expected on
`space-around` — which established that the space-* schemes spend gap on the
container's **ends** and therefore need a taller band than `aligned` does for
the same visual pitch. The donor has no equivalent because it has no
distribution concept: it places rows arithmetically at a single computed
`pitch`. Ours, ad hoc, found by testing rather than by reading.
||||||| fe7386d
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
||||||| fb7b12d

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
| `definitions/port.ts` — `emitPortPrimitives`'s structure | (a) rationale, (c) mechanism | `packages/adapter-tldraw/src/detach/portPrimitives.ts` — "bottom of the hierarchy, invoked per port" framing (`:1-13`) carried over as prose; the STATE→colour table (`STATE_STOCK_RING`) reproduces the donor's `STATE_STOCK_RING` (`:79-86`) for the three states it shares | Opened in full; donor is 141 lines |
| `definitions/port.ts` — `received` state → stock `"green"` | (c) | **Ours, no donor precedent** — the donor's own `PortState` excludes `received` as runtime-only (see that file's own doc); this app's `PortState` persists it. A fresh judgement call, stated as one in the code, not dressed up as a port | — |
| `definitions/block.ts` | (a) rationale, (c) mechanism | `packages/adapter-tldraw/src/detach/blockPrimitives.ts` — "card first, ports NOT drawn here, invoke the port reduction per port" (`:1-13`, `:90-96`) carried over as the file's own organizing rule; **not one line of the donor's actual geometry math is ported**, because this app's Block/BlockPort has no closed-form layout function to copy from (see `stockShapes.ts`'s header) — every box here comes from `getBoundingClientRect`/`Range` measurement of the LIVE DOM instead | Opened in full; donor is 219 lines |
| `editorContainer.ts` | (c) | Ours, ad hoc — no donor equivalent (the donor never mounts more than one `Editor` on a page at once) | Found by a real, reproduced defect: see this file's own header and `DetachToPrimitive.stories.tsx`'s mutation-test note in the lane report |

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
