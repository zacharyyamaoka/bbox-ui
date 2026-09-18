# Trace port plan (2026-09-17)

Source of truth for landing the Trace component and its galleries in
`apps/storybook-basics`. Mirrors the AI comment in the vault note
`bbox ui Trace Component.md` (marker `ai-comment:trace-plan-2026-09-17`).
Zach's brief: port SystemSketch's trace work — control points, the math for the
line types (curved, multi-edge elbow…), the tidy-edges pass — keeping the
copied-from-Excalidraw-etc. documentation with the functions; a Trace
component whose input is "a point in space and the tangent direction" plus
fake circle-with-arrow endpoints (never real Ports); styling per
`reports/trace-edge-primitive-proposal-2026-09-14.html`; a draggable
badge label; before/after tidy stories.

**Headline, three findings:**

1. **The paint half already exists in this repo.** `packages/bbox-ui/src/trace.tsx`
   (277 lines) + `trace.layout.ts` (263) landed 2026-09-15 as `b5b2778`
   "Implement the Trace edge primitive" — data/async/delayed dash mechanics,
   the chevron marker, collision-free marker ids, and the *label-drag math*
   (`pointAtFraction`, `fractionNearest`, `clampLabelPosition`,
   `trace.layout.ts:88-148`) are all done and pure. It ports here by the same
   copy-and-strip that produced this app's `Port`. The routing half — all four
   line types — exists in SystemSketch as pure or nearly-pure functions; the
   elbow folder alone is ~2,324 lines of zero-dependency math that ports
   **verbatim**.
2. **The draggable badge does NOT exist in SystemSketch as custom code.**
   Its arrow labels are stock tldraw `labelPosition` (confirmed:
   `src/inspector/inspectorModel.ts:894-904` — "Stock, and draggable only by
   pointer"); its custom connections have **no** label support, only the z⁻¹
   pill riding `pillPosition`. What DOES exist is the pill's drag mechanism —
   `pillPosition: clampPillPosition(fractionNearest(points, handle))`
   (`ConnectionShapeUtil.tsx:658`) — and that math is already ported into this
   repo's `trace.layout.ts`. The DOM badge, its pointer drag, and
   double-click-to-create are **net-new, ~180 lines**.
3. **SystemSketch's third-party notice file is missing.**
   `elbowRouter.ts:15` promises "The full MIT permission notice travels with
   this repository in `THIRD_PARTY_NOTICES.md`" — that file does not exist
   anywhere in `/home/bam/systemsketch` (verified by `find`, 2026-09-17). The
   port must not copy the dangling reference: the full MIT notice gets inlined
   into the ported file's own header (D9). A task chip was raised to fix the
   donor separately.

### Where it actually stands — measured in both trees, not from memory

| Piece | State | Where |
|---|---|---|
| Trace paint (dash mechanics, marker, split) | **Shipped in `packages/bbox-ui`.** `TraceBody` takes a finished `path` + `length`; variants `data`/`async`/`delayed`; opt-in marching ants; `splitAtLabel`; hex-bijective `safeElementId` (three rounds of adversarial review documented in its comment — keep it). Wired into FieldSpec (`tone`, `PaintToken`, `Pill`, `trace.fields.ts`) so a port is copy-and-strip. | `packages/bbox-ui/src/trace.tsx:31-256`, `trace.layout.ts:61-263`, `trace.fields.ts` |
| Label-position math | **Shipped, pure.** `polylineLength`, `pointAtFraction`, `fractionNearest` (the drag projection), `clampLabelPosition` (0.05..0.95, SystemSketch's own `PILL_POSITION_MIN/MAX`). | `trace.layout.ts:79-148`; donor `connectionModel.ts:47-55` |
| Marching-ants CSS | **Shipped** with `prefers-reduced-motion: reduce → animation: none`. Copies into this app's `globals.css`. | `packages/bbox-ui/src/theme.css:115-133` |
| curved / straight + bend | **Pure except tldraw's `Vec`/`clamp`.** Default cubic leaving each end along its face normal (`getConnectionControlPoints`), bent quadratic through the dragged waypoint at t=0.5, quadratic→cubic converter. Note: SystemSketch's `straight` with a dragged control point *becomes* the bent quadratic — same `bentCurvedPath` call (`connectionRouting.ts:212-214`). | `systemsketch/src/blocks/connections/connectionRouting.ts:65-134,204-248` |
| slanted | **Pure except `Vec` + one editor lookup.** Axis-aligned lead then one diagonal; departure from the source face; control scalar `elbowT` ∈ [0,1] along the lead axis. Provenance comment cites ELK's POLYLINE option and React Flow's `sourcePosition` — keep it. Degenerates to a straight line when `dx` or `dy` < 0.001. | `systemsketch/src/systemSketchArrow.tsx:424-502` |
| elbow core | **Pure, zero deps, ports verbatim.** `geometry.ts` (188) + `binaryHeap.ts` (74) + `elbowPins.ts` (129) + `elbowRouter.ts` (1028) + `elbowPath.ts` (104) + `softClearance.ts` (195) + `nudge.ts` (606) = 2,324 lines. Header: "must stay importable from a plain node script" (`geometry.ts:1-5`) — and it is. Eight `@ported Excalidraw \`…\`` tags in `elbowRouter.ts` (191, 274, 290, 359, 441, 454, 505, 561). | `systemsketch/src/blocks/elbow/` |
| collision routing (tidy's engine) | **Pure, 222 lines, imports only `../elbow`.** `planOrthogonalRoute`, `stabilizeOrthogonalRoute`, `routeClearsInput`, `routeClearsObstacles`, `nudgeRoutesWithoutObstacleCollisions`, `routesHaveSamePoints`. | `systemsketch/src/blocks/connections/collisionAwareRouting.ts:30-222` |
| tidy orchestration | **Editor-bound; stays behind.** `tidyEdges.ts` (332) is "orchestration only" by its own header: selection scope, page transforms, `updateShapes` persistence. The pipeline it runs (`:159-233`) — baseline plan → soft-clearance re-plan with deterministic priority → stabilize → clears-check → bundle nudge → reject nudges that undo soft-clearance wins — re-states as a **pure function over fixture data, net-new ~120 lines**. | `systemsketch/src/blocks/connections/tidyEdges.ts:130-271` |
| obstacle collection | **Editor-bound; not ported.** `routingObstacles.ts` translates live Blocks/Branches into rects ("deliberately knows nothing about A*…"). Story fixtures ARE the rects, so nothing replaces it here. | `routingObstacles.ts:1-45` |
| tidy evidence | The report Zach remembers: **`systemsketch/docs/layout-comparison-2026-09-02.html`** — 46 cases, 20 edge-channel scenarios, idempotence + orthogonality + endpoint checks; plus `tidy-soft-clearance-2026-09-03.html`. Fixture boards under `systemsketch/sketches/review/tidy-*.systemsketch`. Landed `d581b3b1`. | those files |
| badge / edge label | **Custom implementation does not exist in SystemSketch** (finding 2). Net-new DOM here; math already in `trace.layout.ts`. | `inspectorModel.ts:894-904`, `ConnectionShapeUtil.tsx:573,658` |
| authored multi-elbow routes | **Pure** (`elbowAuthoredRoute.ts`, 399, imports only `../elbow`) but its dongles hardcode right→left (`dongleEndpoints`, `:87-96`) and it exists for drag-to-grow-rails editing — a canvas gesture these stories don't have. **Deliberately out of scope** (D5). | `elbowAuthoredRoute.ts:1-96` |
| reset edges | Editor-bound bookkeeping over shape props (`resetEdges.ts:29-33`). In a story, "reset" is `setState(initial)` — nothing to port. | `resetEdges.ts` |
| storybook-basics destination | Committed at `16b1243`. `--bbox-primary`/`--bbox-received` already in `globals.css:126-127`; **no march keyframes yet**; **no unit-test vitest project** — `vitest.config.ts` has only the `storybook` browser project; no `*.test.ts` anywhere in the app. dnd-kit installed but unused by this plan (D6). | `apps/storybook-basics/` |

### The endpoint contract — frozen here so lanes never negotiate

The fake endpoint is a glyph, not a Port: an amber circle with an arrow inside
(reuses `--bbox-primary`, the orange already in `globals.css:126`). Its arrow
draws the **flow tangent** — the direction data travels through that point.

```ts
// trace.layout.ts (Lane A writes it; every lane codes against this text)
export interface Point { x: number; y: number }
/** Flow tangent at a terminal — the direction the arrow glyph points.
 *  Same vocabulary as the elbow router's ElbowSide ('top' = flow upward). */
export type TraceDir = "top" | "right" | "bottom" | "left";
export const OPPOSITE_DIR: Record<TraceDir, TraceDir> = {
  top: "bottom", right: "left", bottom: "top", left: "right",
};
export interface TraceTerminalSpec { x: number; y: number; dir: TraceDir }
export type TraceRouting = "straight" | "slanted" | "curved" | "elbow";
```

**The 8-vs-4 question, answered.** Zach's correction is **right at the level
of the glyph and the API**, with one nuance worth having on record. A port's
(face, polarity) pair maps onto a flow tangent exactly 2-to-1: an output emits
along its face normal (`tangent = face`), an input receives against it
(`tangent = opposite(face)`) — so *input-on-top-face* and
*output-on-bottom-face* both draw as a circle with a ↓ arrow, which is his
"top input is the same as bottom output". Eight (face × polarity) pairs
quotient to **four glyphs**, so the component takes only `{x, y, dir}` — no
polarity prop at all. The nuance: the *route* still knows which end is which,
because that comes from the prop slot (`from` vs `to`), not from the glyph —
`from` is where the marker-free end sits, `to` gets the arrowhead, and the
router side derives as:

```
side(from) = from.dir                    // wire leaves along the flow
side(to)   = OPPOSITE_DIR[to.dir]       // wire arrives traveling to.dir,
                                        // so its free space is behind it
```

matching the router's own doc: "an output port leaves 'right', an input
enters 'left'" (`elbowRouter.ts:78`) — output-right ⇒ side `right`,
input-left ⇒ flow `right`, side `left`. The polarity gallery therefore has
**four entries**: source fixed (`dir: "right"`, at the left), target's `dir`
permuted through all four values.

### Routing × target-tangent matrix — settled now, not at implementation time

Fixed source `dir:"right"` on the left; target on the right, `dir` permuted.

| routing | target `right` (classic) | target `top` (enter from below) | target `bottom` (enter from above) | target `left` (wrap around) |
|---|---|---|---|---|
| `straight` | looks right (chord happens to align) | **tangent-blind** | **tangent-blind** | **tangent-blind** |
| `slanted` | honors source lead; target arrival is the diagonal | tangent-blind at target | tangent-blind at target | tangent-blind at target |
| `curved` | ✓ | ✓ (`sides.end = "bottom"`) | ✓ | ✓ (S wraps) |
| `elbow` | ✓ one riser | ✓ descends, runs under, rises in | ✓ | ✓ multi-bend wrap |

`straight` is tangent-blind *everywhere* — it never reads a `dir`; it merely
looks correct when the chord aligns. `slanted` honors exactly the **source**
tangent (its departure axis) and never the target's; it also degenerates to a
straight line when either delta < 0.001 (`getSlantedArrowPoints:484-486`).
`curved` and `elbow` honor both ends for all four values — curved because
`ConnectionExitSides` already takes both ends (`connectionRouting.ts:39-49`),
elbow because that is the whole point of the router.

**What a story renders for an unsupported cell (D7): the honest path, never an
omission.** The cell renders exactly what the function returns, with
`data-supported="false"` and a muted caption ("does not honor this tangent").
Zach pre-conceded the limitation ("for some lines that won't be supported like
straight/slanted"); hiding the cell would hide the *reason* elbow exists.

### Control points — what "center control point moved" means per routing

| routing | control type | default | "moved" means | donor |
|---|---|---|---|---|
| `straight` | `{dx, dy}` (offset of visible midpoint from endpoint midpoint) | `null` (pure line) | becomes the **bent quadratic** — literally the same `bentCurvedPath` as curved (`connectionRouting.ts:212-214`); worth one caption in the gallery | `ConnectionCurve`, `connectionRouting.ts:29-32,110-120` |
| `slanted` | `slantT: number` ∈ [0,1] | `null` → automatic lead (`min(\|control.x\|, span/2)` via the shared control-point helper) | the elbow vertex slides along the departure axis: `lead = span * clamp(slantT, 0, 1)` | `elbowT`, `systemSketchArrow.tsx:479-500` |
| `curved` | same `{dx, dy}` | `null` → default cubic along both face normals | quadratic control at `mid + 2·(dx,dy)` so the path **passes through** the waypoint at t=0.5 (`:115-120`); `getBentCurveCubicControlPoints` converts for anything that wants a cubic | `connectionRouting.ts:110-134` |
| `elbow` | `ElbowPin { index, axis, t, offset }` — a scalar in the frame spanned by the two endpoints, **never** an absolute point | `[]` | `pinElbowSegment(input, segmentIndex, pointer)` re-routes, finds the segment, captures perpendicular coordinate as a pin (`elbowRouter.ts:1016-1028`); center control = pin on the middle pinnable segment | `elbowPins.ts:1-129` |

`elbowPins.ts`'s header is load-bearing provenance: it explains **why not
Excalidraw's `fixedSegments`** (absolute-point pins made "dragging the box"
leave the elbow behind — Zach's quoted rejection) and the
`mid + (t − 0.5)·span + offset` frame math. It travels verbatim.

### Styling — Zach's five names onto the shipped variant vocabulary

The report (`reports/trace-edge-primitive-proposal-2026-09-14.html`) is the
authority; every value below is already constants in `trace.layout.ts`.

| Zach's name | props | concrete paint |
|---|---|---|
| **Data** (plain grey) | `variant:"data"` | solid stroke, `color` default `var(--muted-foreground)` (D2), round caps, chevron marker |
| **Async** | `variant:"async"` | dasharray `56 4 10 4` (`ASYNC_PACKET_DASHARRAY`), butt caps, `asyncDashOffsetForLength` centres one packet on short paths |
| **Animated** | `variant:"data" animated` | dasharray `5` + class `bbox-trace-march` (keyframes copied from `theme.css:115-133` into `globals.css`, `prefers-reduced-motion` guard intact) — opt-in, never default (the recorded 2026-09-14 "too loud" lesson) |
| **Red line** | `variant:"data" color:"var(--destructive)"` | colour is a plain prop; the marker inherits it via `context-stroke` so there is never a second derivation |
| **Dotted line** | `variant:"delayed"` | zero-length dash + round cap = discs (`DELAY_DOT_PX 0.1`, gap 6); `splitAtLabel`/`labelPosition` ride along free |

The strip, stated honestly (mirrors the Port strip): `tone`, `PaintToken`,
`Pill`/`TraceLabel`, `trace.fields.ts`, `resolveTraceStrokeColor`'s
tone-override subject — all dropped; `color?: string` (any CSS colour)
replaces the governed field. Cost: no tone escape hatch, no inspector
provenance; both re-addable. The variant name stays **`delayed`** (D1) — the
gallery row is *labelled* "Dotted"; renaming the variant would fork the
vocabulary from `packages/bbox-ui` for a caption's worth of gain.

### The badge — mechanism (net-new), math (already ported)

- **Create:** double-click the trace. The visible path is 2px, so `TraceBody`'s
  copy gains an invisible sibling hit path (`stroke: transparent`,
  `strokeWidth: 12`, `pointerEvents: "stroke"`) — the same convention React
  Flow's `BaseEdge` uses for its built-in hit path (documented in the report,
  §"The one wrinkle"). Double-click computes
  `clampLabelPosition(fractionNearest(points, p))` and mounts the badge there
  in editing state.
- **Render:** the stock `Badge` from `src/components/badge.tsx` (Zach named
  it), absolutely positioned at `pointAtFraction(points, t)`, centred with
  `translate(-50%, -50%)`, inside the story fixture's `position:relative`
  container. Text editing via `EditableText` (`editableText.tsx` — controlled
  `editing`, `onCommit`) rendered as the Badge's child.
- **Drag:** raw pointer events with `setPointerCapture` (D6): pointermove →
  client→container coords → `fractionNearest` → clamp → controlled `t`. This
  is exactly the donor pill's mechanism minus tldraw's handle plumbing
  (`ConnectionShapeUtil.tsx:658`), and the clamp keeps the badge off the
  terminals (0.05..0.95 — `trace.layout.ts:139-148`, donor
  `connectionModel.ts:47-55`).
- **Contract:** `TraceBadge` is pure-input: `{ points: Point[], t, onTChange,
  value, onValueChange, editing, onEditingChange }`. It never derives a path —
  the caller passes the sampled polyline, which is what keeps Lane D
  independent of Lanes B/C.

Sizes: `traceBadge.tsx` ~180 lines net-new; the dblclick wiring in the story
~30. No new packages — dnd-kit stays uninvolved (path-constrained projection
is not a dnd-kit modifier; a free 2D drag plus manual projection would use
dnd-kit as a worse pointer-event API).

### Tidy — what it is, what makes it impure, what the stories show

What `tidyEdges.ts` actually does (`:159-233`), per movable edge, in order:

1. `planOrthogonalRoute(scene.input)` — unweighted baseline (A* around hard
   keep-outs).
2. Soft clearance: deterministic priority (authored/locked routes are anchors,
   then automatic edges yield in stable order); re-plan with
   `softClearance: { routes, options }` only for edges actually inside the
   desired gap.
3. `stabilizeOrthogonalRoute(current, planned, input)` — keep a still-clear
   previous corridor so tidy is not jittery.
4. `routeClearsInput` — an edge that cannot clear every obstacle is locked and
   counted `unresolved`, never half-moved.
5. `nudgeRoutesWithoutObstacleCollisions(routes, inputs, lockedFlags,
   {spacing})` — spread coincident channels; reject any nudge that re-enters a
   keep-out or undoes a soft-clearance win.
6. `describeTidyEdgesOutcome` — the human sentence ("Tidied 3 edges, kept 1
   hand-routed…", `:71-92`) — port it; it is the story's status line.

Impurities, named: the `Editor` (selection scope `getTidyEdgesSelection`,
page transforms `routeInPage`, persistence `updateShapes`) and
`routingObstacles.ts`'s live-shape scene collection. Everything else it calls
is already pure. The port is `tidyTraces(edges: TidyTraceInput[], options)
→ { routes, outcome }` (~120 net-new lines restating `:159-233` over fixture
data), where `TidyTraceInput = { input: ElbowRouteInput, current: ElbowRoute,
locked: boolean }`.

Story fixtures — drawn from the donor's own evidence
(`layout-comparison-2026-09-02.html`'s 20 edge scenarios,
`collisionAwareRouting.test.ts:16-153`, `nudge.ts:20-31`):

| story | before | measured after |
|---|---|---|
| `TidySharedCorridor` | the `nudge.ts` header's own numeric case: two parallel cables both picking the midline (both verticals at the same x, 115px overlap) | rail x-coordinates differ by ≥ `spacing`; zero overlap |
| `TidyCrissCross` | two pairs wired crossed so the shared channel forces a crossing the ordering can remove | crossing count drops; `forcedCrossings` reported when it genuinely cannot |
| `TidyThroughBoundary` | edges routed straight through obstacle rects (the criss-cross "going through boundaries" ask) | no sampled path point inside any inflated keep-out (`routeClearsObstacles` re-checked from the story) |
| `TidyLockedRespected` | one edge pinned (`pins:[…]` ⇒ locked), siblings tangled around it | locked edge's points byte-identical; outcome counts `kept 1 hand-routed` |
| every tidy story | — | **idempotence**: running Tidy twice yields `routesHaveSamePoints` true — the property the 46-case report checked |

Each story renders before/after side by side plus a Tidy button (a Storybook
control re-running the pure pipeline) and the `describeTidyEdgesOutcome` line.

### Provenance — the rule Zach set, made mechanical

- Every ported file keeps its full header and every `@ported Excalidraw
  \`name\`` tag **verbatim**. Gate: `grep -c "@ported"` in the copy equals the
  donor's count (8 in `elbowRouter.ts`).
- `nudge.ts`'s PROVENANCE section (`:40-90`) travels whole: the Hashimoto &
  Stevens 1971 left-edge lineage, ELK's `OrthogonalRoutingGenerator` (EPL-2.0),
  MSAGL-js's `CombinatorialNudger` (MIT), Mermaid's `orthogonalRouter` (MIT),
  Pupyrev et al. on coincident paths, and the explicit "libavoid is LGPL so it
  was **not read**" line — that last one is legal posture, not trivia.
- `elbowPins.ts`'s why-not-`fixedSegments` header, `slanted`'s ELK
  POLYLINE / React Flow `sourcePosition` note (`systemSketchArrow.tsx:424-436`),
  and `connectionRouting.ts`'s per-function WHYs all travel with their
  functions.
- **Strengthened, not just preserved (D9):** the ported `elbowRouter.ts`
  header replaces the dangling `THIRD_PARTY_NOTICES.md` sentence with the full
  MIT permission notice (Copyright (c) 2020 Excalidraw) inlined, upstream URL
  and revision `e1bb9ff8f8931e783c11d104abb8967ac6605c9a` kept.
- Files that arrive via `packages/bbox-ui` keep that chain too: the copy's
  header says "ported by value from `packages/bbox-ui/src/trace.tsx`
  (`b5b2778`), itself ported from SystemSketch's
  `connectionPresentation.ts`" — the same two-hop honesty `port.tsx:3-16`
  already models.

### Stock parts, element by element

| Element | Today | Off-the-shelf part (exact name) | Behaviour that must survive |
|---|---|---|---|
| Elbow routing core | SystemSketch `src/blocks/elbow/` | Excalidraw `elbowArrow.ts` port: `calculateGrid`, `pointToGridNode`, `estimateSegmentCount`, `astar`, `pathTo`, `generateDynamicAABBs`, `getDonglePosition`, `getElbowArrowCornerPoints` (all `@ported`-tagged) | keep-out padding 24, dongle legs, bend-penalty A*; MIT notice + tags verbatim |
| Channel nudging | SystemSketch `nudge.ts` | independent implementation (deliberately **not** libavoid); relatives credited: ELK `OrthogonalRoutingGenerator`, MSAGL-js `CombinatorialNudger`, Mermaid `orthogonalRouter` | no-new-crossings ordering; cycle ⇒ reported `forcedCrossings`, never a silent overlap |
| Curved default | SystemSketch `getConnectionControlPoints` | the connection kit's cubic (donor comment "the kit's default cubic") | leaves each end perpendicular to its face; absent side keeps historical horizontal |
| Slanted | `getSlantedArrowPoints` | ELK POLYLINE reading + React Flow `sourcePosition` reading, per the donor comment | short axis lead, then one diagonal; `slantT` scales the lead |
| Badge chip | none (net-new wiring) | `Badge` (`src/components/badge.tsx`) + `EditableText` (`src/components/editableText.tsx`) | stock shadcn look; text renders inside the badge; drag never leaves 0.05..0.95 |
| Drag-to-`t` projection | SystemSketch pill handle | `fractionNearest` + `pointAtFraction` + `clampLabelPosition` (already in `trace.layout.ts`) | nearest-point-on-polyline semantics identical to `ConnectionShapeUtil.tsx:658` |
| Path length/sampling | — | `SVGPathElement.getTotalLength()` / `getPointAtLength()` (browser) for `curved`; exact vertices for the three polyline routings | length is arc length, never the chord (the report's own warning) |
| Marching ants | `theme.css` | CSS `@keyframes` + `prefers-reduced-motion` media query (browser) | 0.5s linear infinite; reduced motion ⇒ `animation: none` |
| Story assertions | house pattern | `expect` from `storybook/test` + `getBoundingClientRect`/path sampling in play functions | geometry measured, never inferred from DOM presence |
| `packages/bbox-ui/src/trace.*` | — | **unchanged (stock seam)** — copied by value; the package stays the design authority | drift visible in the copy's header |
| All of `/home/bam/systemsketch` | — | **unchanged (stock seam)** — read-only donor | tidy reports and fixtures stay where the vault links expect them |
| `apps/storybook`, `packages/inspector`, dnd-kit deps | — | **unchanged (stock seam)** | opt-in Storybook stays untouched per repo CLAUDE.md |

### Phases — lanes, file ownership, and what serialises

**P1 first and alone (it is small); then P2, P3, P4 run concurrently on
disjoint files; P5 follows P3 in the same lane; P6 closes.** The only shared
files in the whole plan: `globals.css` (one append, P1 only) and
`vitest.config.ts` (one edit, P3 only). Every story lives in its own new file.

**P1 · Lane A — paint + terminal glyphs.** Owns
`src/components/trace.tsx`, `src/components/trace.layout.ts`,
`src/components/traceTerminal.tsx`, the `globals.css` append,
`src/stories/Trace.stories.tsx`.
Copy-and-strip `TraceBody` (+ the invisible hit path and a `points` prop for
later phases), copy `trace.layout.ts` whole (it is already pure) plus the
frozen endpoint types above, write the ~70-line `TraceTerminal` glyph
(`--bbox-primary` ring + rotated arrow, `data-slot="trace-terminal"`).
Stories: `Styles` — the five rows, each a straight path between two terminals.
Acceptance (play, measured): per row `getComputedStyle` on
`[data-slot="trace"] path` yields the dasharrays above ("56, 4, 10, 4";
"0.1, 6" + round cap; "5" + `animationName === "bbox-trace-march"`); Red's
resolved stroke equals resolved `--destructive`; exactly one `<marker>` whose
id is `safeElementId("bbox-trace-head", id)`; terminal centre within 1px of
its `{x,y}`.

**P2 · Lane B — straight/slanted/curved routing.** Owns
`src/components/trace.routing.ts`, `src/stories/TraceRouting.stories.tsx`.
Port `getConnectionControlPoints` / `defaultCurvedPath` / `bentCurvedPath` /
`getCurveWaypoint` / `getBentCurveCubicControlPoints`
(`connectionRouting.ts:65-134`, `Vec` → the frozen `Point`, tldraw `clamp` →
local) and `getSlantedArrowDeparture` / `getSlantedArrowPoints`
(`systemSketchArrow.tsx:437-502`, editor departure lookup dropped — the
terminal's `dir` supplies it). ~190 lines adapted, comments intact.
Stories: `ControlPoints` — slanted × `slantT` {0.15, 0.5, 0.85}, curved ×
`{dx,dy}` in three placements, plus the one-caption row showing
straight-with-bend ≡ curved-with-bend. Acceptance: sample the rendered path
(128 × `getPointAtLength`); the waypoint lies on the bent curve within 1px;
slanted's first segment is axis-aligned (equal y within ε near the start) with
lead length `slantT × span` within 1px.

**P3 · Lane C — the elbow core, verbatim.** Owns
`src/components/elbow/` (`geometry.ts`, `binaryHeap.ts`, `elbowPins.ts`,
`elbowRouter.ts`, `elbowPath.ts`, `softClearance.ts`, `nudge.ts`, `index.ts` —
a directory mirroring the donor so future re-syncs are a diff, D3), ported
donor tests beside them (`elbowRouter.test.ts`, `elbowPins.test.ts`,
`elbowPath.test.ts`, `nudge.test.ts`), the one `vitest.config.ts` edit adding
a node-env `unit` project (D4), and `src/stories/TraceElbow.stories.tsx`.
Stories: `ElbowAndMultiElbow` (one riser vs obstacle-forced staircase — Zach's
two screenshot rows are both `routeElbow`, there is no separate "multi" kind:
`CONNECTION_ROUTING_KINDS = ['curved','straight','elbow']`,
`connectionModel.ts:9`), `ElbowPins` (centre pin at t {0.2, 0.5, 0.8} via
`pinElbowSegment`). Acceptance: donor unit tests green under `pnpm vitest
--project=unit`; in-browser, consecutive sampled route points share an axis
(orthogonality), no sampled point inside the obstacle's inflated bounds, and a
pinned rail sits at `resolvePin`'s coordinate within 1px.

**P4 · Lane D — the badge.** Owns `src/components/traceBadge.tsx`,
`src/stories/TraceBadge.stories.tsx`. Pure-input contract above; fixture uses
a straight two-point polyline so it needs only P1. Acceptance (play, real
pointer events via `userEvent`): dblclick on the line mounts
`[data-slot="trace-badge"]` in editing state at the click's `t`; typed text
survives commit inside a stock Badge; a 60px drag along the path moves the
badge centre to within 2px of the polyline with monotonically changing `t`; a
drag past the endpoint clamps at `t = 0.95`.

**P5 · Lane C, after P3 — tidy.** Owns
`src/components/elbow/collisionRouting.ts` (the 222-line
`collisionAwareRouting.ts` port, import paths only),
`src/components/trace.tidy.ts` (the ~120-line pure orchestrator +
`describeTidyEdgesOutcome`), `src/stories/TraceTidy.stories.tsx` with the four
fixtures tabled above. Serialises behind P3 because it imports the elbow
folder; same lane, no handoff.

**P6 · Lane A, after P2 + P3 — the Trace wrapper + polarity gallery.** Owns
the `Trace` addition inside `trace.tsx` (~80 lines: terminals + `routing` +
per-routing control props → path via B/C + measured `length`/`points` via a
`useLayoutEffect` ref for `curved`, exact vertices otherwise) and
`src/stories/TracePolarity.stories.tsx` — the four-permutation gallery per
routing, the matrix above rendered honestly. Acceptance: for each supported
cell the last two sampled points' direction equals `to.dir` within 5°; every
unsupported cell carries `data-supported="false"` and its caption; the
`to`-end marker is present, the `from` end bare.

Estimated sizes: verbatim ~2,550 lines (elbow + collision routing), adapted
~450 (`trace.routing.ts`, paint strip), net-new ~450 (`TraceTerminal`,
`TraceBadge`, tidy orchestrator, `Trace` wrapper), stories ~1,200 across six
files. `pnpm test-stories` is the gate after every phase — assertions live in
play functions, never in `storyRenders[].reportedException` (not a real
property; this app's `vitest.config.ts` documents the false-green it caused).

### Decisions — each with the default taken if you say nothing

- **D1 · Variant vocabulary keeps `delayed`;** the gallery row is labelled
  "Dotted". Renaming would fork from `packages/bbox-ui` for a caption.
  Default: keep.
- **D2 · `color` defaults to `var(--muted-foreground)`** — "Data = plain
  grey" is this app's base style; the package's `foreground` default would
  paint near-black here. Recorded as a deliberate deviation in the copy's
  header. Default: muted-foreground.
- **D3 · The elbow port is a directory** (`src/components/elbow/`) mirroring
  the donor file-for-file, not flattened into `components/` — verbatim
  provenance survives as a clean diff against the donor. Default: directory.
- **D4 · Donor unit tests port, and `vitest.config.ts` gains a node `unit`
  project.** 2,300 verbatim lines with a 528-line test suite already written
  is the independent oracle for free; play functions alone would re-derive
  weaker checks. One config edit, owned by Lane C. Default: yes.
- **D5 · Authored multi-elbow route editing stays behind**
  (`elbowAuthoredRoute.ts` — drag an end segment to grow rails). Pins give the
  centre-control gallery everything Zach asked for; authored editing is a
  canvas gesture with no canvas here, and its dongles hardcode right→left.
  Re-portable later; it is pure. Default: out of scope.
- **D6 · Badge drag is raw pointer events** (`setPointerCapture`), not
  dnd-kit — the projection onto a polyline is the work either way, and the
  donor mechanism is handle→`fractionNearest`. Default: pointer events.
- **D7 · Unsupported polarity cells render honestly** with a muted caption,
  never omitted. Default: render.
- **D8 · Terminal glyph = circle + arrow reusing `--bbox-primary`** (the
  screenshot's amber IS this repo's orange accent); no new token. Default:
  reuse.
- **D9 · The full MIT notice is inlined in the ported `elbowRouter.ts`
  header** rather than a repo-root NOTICES file (that file would sit in
  shared space this plan otherwise never touches; and the donor's own
  reference is dangling — finding 3). Default: inline.

### What this plan deliberately does not do

- No component code written yet; nothing merged; `packages/bbox-ui`,
  `apps/storybook` (opt-in Storybook), `demos/`, and all of SystemSketch
  untouched.
- No FieldSpec/preset/tone re-entry — `trace.fields.ts` stays behind with the
  rest of the cascade, per this app's standing rule.
- No real `Port`/`LabeledPort` in any trace story — Zach's explicit reversal;
  `TraceTerminal` is a story prop, and nothing imports `port.tsx`.
- No obstacle *collection* port (`routingObstacles.ts`) — fixtures are the
  scene; a future canvas host writes its own collector, which is the same
  core/adapter line `ARCHITECTURE.md` draws.
- No authored-route editing (D5), no soft-clearance *UI* (the tidy pipeline
  keeps the soft pass with its defaults; exposing its weights as controls is a
  later story if wanted), no floating toolbar (Zach: out of scope for traces).
- No `npm install` lines, no new dependencies anywhere.
