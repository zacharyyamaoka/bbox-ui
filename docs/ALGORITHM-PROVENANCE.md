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
