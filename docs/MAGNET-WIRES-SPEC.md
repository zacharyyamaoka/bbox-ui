# Magnetic wire proposals — the spec as built

> Lane worktree `worktree-wf_90bee8a9-bb2-8`, cut from `fe7386d`.
> Report: `file:///home/bam/bbox-ui/reports/media/magnetic-wires-2026-09-18.html`
> Provenance rows: `docs/ALGORITHM-PROVENANCE.md`, section `src/magnet`.

Zach's ask, verbatim: *"if you move a node close enough… then it should kinda
like automatically propose a connection… different ports basically could have
like magnet radius. if those radius are in range, and then a data validation
thing bases. then it can make a trace proposals so it just automatically draws
it (dotted line)… if you move out of range then it disappears… if many
possible connections then just go to the nearest one… Please check prior art
jointjs, maxgraph, etc."*

## The shape

A **pure scan** (`scanMagnets`) answers *"which stationary port could the
dragged port connect to right now?"* as data: a **ranked list** of proposals
plus a list of **explained refusals**. Geometry proposes, an **injected judge**
disposes, and the two are evaluated **interleaved in distance order** so an
illegal near candidate can never shadow a legal far one. A **React binding**
(`useMagnetDrag`) drives it off the drag lane's existing intent reducer,
measuring the DOM exactly **once per gesture**. A **paint layer**
(`MagnetProposalLayer`) draws the top proposal as a dotted `Trace` and stamps
every fact a play function needs onto `data-magnet-*`.

| File | What | Purity |
|---|---|---|
| `apps/storybook-basics/src/magnet/magnetProposals.ts` | `scanMagnets`, `topProposal`, `magnetProposalId`, `translatePorts`, `effectiveMagnetRadius`, `pairMagnetRadius`, `composeJudges`, `magnetTypeJudge`, `sameMagnetScan` | pure |
| `apps/storybook-basics/src/magnet/magnetPortTypes.ts` | `arePortTypesCompatible`, `normalizePortType`, `WILDCARD_PORT_TYPES` — the SystemSketch port | pure |
| `apps/storybook-basics/src/magnet/useMagnetDrag.ts` | binding: composes `useDragIntent`, measures once, scans per move | React |
| `apps/storybook-basics/src/magnet/magnetProposalLayer.tsx` | SVG overlay: dotted `Trace`, radius dev overlay, `data-magnet-*` | React |
| `apps/storybook-basics/src/stories/MagnetProposals.stories.tsx` | six stories, controls on the canvas | — |

`src/magnet/` and not `src/scene/`: `src/scene/` is `F(scene) = numbers` and
its header states the kit imports no React, so a `.tsx` there breaks the
invariant. `src/interaction/` already set the precedent of a sibling directory
holding a pure reducer plus its React binding — and a fresh directory makes
the collision surface with the three concurrent `src/scene/` lanes zero.

## The five requirements, and where each is proved

| | Requirement | Proof |
|---|---|---|
| R1 | per-port magnet radius, toggleable | unit A1 (zoom stops, cap, `max` commutativity over 100 seeded pairs) · story `RadiusAndToggle` |
| R2 | proximity **and** validation | unit A2 (spy-judge call count == in-range count) · story `RefusalPreview` |
| R3 | dotted line, tracks, vanishes | story `TracksAndVanishes` (A7/A8) · A9 reads the real computed dash |
| R4 | type filtering decides between two candidates | unit A4/A5 · story `TypeDecides` |
| R5 | nearest wins, deterministic, efficient | unit A3 (100 shuffles, byte-identical) · the measurement below |

## Decisions that are load-bearing

**No spatial index.** Measured, not argued: the grid-vs-linear crossover is at
n≈500-1000 and our regime is tens to low hundreds of ports; at 10× our regime
a linear scan still costs ~6-8 µs/frame. JointJS, maxGraph, React Flow and
SystemSketch all ship brute force for this exact query. What pays instead is
measuring the DOM **once** per gesture — `getBoundingClientRect` was always
the cost, not the arithmetic. A `// WHY:` on `scanMagnets` carries the
crossover so this is not "fixed" into a grid later.

**Nearest-LEGAL, not nearest.** SystemSketch and JointJS judge candidates
interleaved with the distance scan; React Flow picks the nearest handle and
only then validates it. Under React Flow's order Zach's own worked example
fails whenever the wrong-type port is nearer. `TypeDecides` puts the wrong-type
sink strictly nearer and **measures that it is** before asserting the outcome.

**Identity-keyed tie-break** (`distance`, then `portKey(to)`, then
`portKey(from)`) — a deliberate divergence from all three libraries studied,
each of which breaks ties by array/enumeration order and therefore changes its
answer when the candidate list is rebuilt. It is rebuilt every frame here.

**`max(ra, rb)` for the pair radius** — the only commutative choice, so "out of
range → it disappears" fires at the same distance whichever end moves.

**Opt-in, default off** — `components/trace.layout.ts:283-287`'s own recorded
lesson ("on-by-default proved too loud"), independently matched by maxGraph
gating its whole connect gesture on one boolean.

## Owed, and not glossed

1. **`PortEdgeItem.hinting?: boolean` + forwarding in `nodeViews.tsx`** — the
   real eligible-port paint through `DomCanvas`. Both files are another lane's
   write set, so this feature is demonstrated on a story-local bench and is
   **not proven through the real host composition**. `Lint.stories.tsx:23-36`
   hit the identical wall for the identical reason.
2. **`variant="delayed"` is borrowed for a transient meaning.** Its stroke IS
   the dotted form and its label is literally "Dotted", but a future reader
   will reasonably assume a magnet proposal *is* a delayed connection. A
   `variant:"proposed"` belongs in `trace.tsx`, which is fenced.
3. **A `type-mismatch` rule in `src/scene/lint.ts`**, so at-rest boards can be
   linted for it too. `magnetTypeJudge` is exported so that lane can absorb it.
   **If it ships its own type rule concurrently there will be two judges, and
   that merge is owed.**
4. **Zoom is NOT VERIFIED IN-APP.** `DomCanvas` has no viewport by design; A1
   covers `effectiveMagnetRadius` by unit test only.
