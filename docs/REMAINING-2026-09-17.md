# What remains — the capability map (2026-09-17)

Zach's brief, same day: *"make a plan of all the stuff that remains. am I
forgetting about anything important right now?"* — with his own list (loops,
branches, regions, auto-fit, mutating edges, tidy, interactions, linters,
animation) given as a floor, not a ceiling. Behaviour trees are **out of
scope** by his instruction — they go to a separate bt-flow library.

Method: everything below was measured in the trees on 2026-09-17 — this lane
at `67ee77f`, SystemSketch read-only at `10748b8c`, the vault as reorganised
the same day. Every claim about what code does carries a `file:line`; the few
things not checked are labelled unverified. Strategy (trunk, registry, scene
contract, tracer host) is `docs/PROPOSALS-2026-09-17.md` — cited as P1…P10,
never restated. This document is the **missing-capability** half.

The screenshots were opened, not skimmed; the ones that carried decisions are
cited by filename where they changed a conclusion.

---

## 1 · What exists today — measured, so the gaps are subtraction

Counts in `apps/storybook-basics/src`: **25 story files, 122 exported
stories** (`grep -c "^export const" stories/*.tsx`), **157 unit tests** at
line-start `it(`/`test(` in `components/**/*.test.ts` (a floor — `it.each`
rows expand at runtime), **63 files** under `components/` including the
`elbow/` port.

| Component | File | What it already does |
|---|---|---|
| `Port` | `port.tsx` | states `empty·valueSet·wired·received` + `hinting` preview, sizes, `data-state` |
| `LabeledPort` | `labeledPort.tsx` | dot-box root (rail-centreable), label + secondary slot placement, code-label variant (lane A, `93ba3b5`) |
| `PortEdge` | `portEdge.tsx`, `portEdge.layout.ts` | items, `distribution` (distribute/aligned), `mode` auto/custom (`:94-95`), `groups`+`groupMode`, showPorts / dnd-card overlay, visibility `+N more`, all four sides |
| — the lane | `portEdge.tsx:615-`, `portLane.ts` | multi-line CodeMirror editing with LCS identity reconcile, measured pitch, Python highlighting |
| `Bar` / `BarSize` | `bar.tsx`, `barSize.tsx` | 3-cell strip, computed grid collapse, size cascade to Glyph/EditableText/Badge/Button/Toggle |
| `Block` + members | `block.tsx`, `blockMembers.tsx` | header/body/footer/members, hug-contents by default, explicit height optional, fold shrinks height |
| `BlockPort` (PortedBlock) | `blockPort.tsx`, `blockPort.layout.ts` | rails on a Block's four walls; the donor's view→placement rules restated as props (`railPlanFor`); views `simple·port·expanded` (`:39`) |
| `Trace` | `trace.tsx`, `trace.layout.ts` | variants `data·async·delayed` (`trace.layout.ts:72`), **`delayed` = the z⁻¹ paint** — solid-then-dotted with `splitAtLabel`/`labelPosition` (`trace.tsx:129-135`), `animated` marching ants (`:127`), `markerEnd` arrow, routings straight/bent/curved/elbow |
| `TraceBadge` | `traceBadge.tsx` | pill riding a trace at fraction `t`, **draggable** (`onTChange`, `:90`) — the z⁻¹/mut pill mechanism |
| elbow stack | `elbow/` (13 files) | A* router, nudge, soft clearance, boundary crossing, collision routing — verbatim ports with provenance (`ff9fc1c`) |
| Tidy | `trace.tidy.ts` | donor pipeline as a pure function (`:1-31`); 16-direction-pair matrix + soft-clearance prose landed (`460e924`) |
| `TraceEditor` | `traceEditor.tsx` | interactive control points, chord-relative bends |
| Basics | glyph, editableText (placeholders + multiline, `093e9df`), codeEditor (VS Code themes), badge (pill; `Draft`/`z-1`/`mut`/`iter` vocabulary), button, toggle (**blackbox** hollow/filled square), foldingChevron, text, tooltip, dropdown-menu | |

**Already planned, not yet landed** — do not re-propose:
`FEEDBACK-2026-09-17c-PLAN.md` lanes E (spacing defaults Distribute/Around,
`+X` chips in simple view — his `Pasted image 20260917153001.png`), F
(in-place port editing per `Pasted image 20260917152541/152559.png`; one-line
secondary slot per `20260917154036.png`), D (function-port bar spacing), I
(dnd-kit cards + grouped drag). Lanes A/B/C/G/H from the two 09-17 plans are
merged.

**The standing gate:** Group B — `wiring.ts` + `wireLayer.tsx` — is fully
specified (`BLOCK-PORT-EDGES-PLAN.md` §5-8) and absent. That is P1, and
nearly every row below leans on it.

---

## 2 · His list, item by item

### 2.0 The hidden structure first: three list items are one shape

For-loop, while-loop, branch, and region are not four components. The donor
says so itself, three ways:

- `containerGeometry.ts:1-9` — *"A Block in a container view, a Branch and a
  Loop all present the same anatomy: a face, some solid chrome bands, and
  port dots"* — written after each one rediscovered the same hit-test bugs.
- `RegionShapeUtil.ts:1-16` — Branch and Loop's container overrides were
  *"two byte-identical override blocks living in two files before it was
  one"*.
- The Async region is not even a custom shape: **a stock tldraw Frame plus a
  meta tag** (`asyncRegionModel.ts:33-38`).

And the vault made the bet before the code did: *"Presets: While loop, For
Loops, Conditionals… All of these can be made with specific settings of the
basic components, no need for new things"* (`MOC - bbox-ui Components.md:195-200`).

So the one thing to build is not Loop and not Branch: it is **the container
preset of Block** — header-as-operator-band, typed band ports, members,
footer chip — and each control-flow kind is a props bundle over it. The
genuinely per-kind residue is small and named in 2.1–2.3. P6 proposed probing
exactly this; this section is the probe's shopping list, pre-answered from
the donor.

What is genuinely NOT the same shape: the Branch's **arms** (an ordered stack
of sub-lanes with per-arm fold and one active arm) are real extra structure —
but they map onto `blockMembers` + `FoldingChevron`, not onto a new
container.

### 2.1 For / while loops, with z⁻¹ edges

**SystemSketch today.** The For loop is merged and its grammar is written at
the top of the file: header is an operator, the collection lands ON the
header, the item leaves from a second header port, item cable solid, title
centred (`loop/loopModel.ts:1-28`). Header ports are type-only — `Iterable`
in, `Iter` out (`:55-70`); the item outlet sits inset on the header's
**bottom edge** and its cable leaves perpendicular, downward
(`:42-51`). A `turn` chip ("iteration 3 of 7") renders when non-empty
(`:77-78`). The While loop is **not** merged; the decision is recorded — one
Loop shape with a `for|while` discriminant (W10), a `Bool` header inlet and
no item outlet (W2) — in `DP - Region.md:109-135`. The z⁻¹ edge is a
connection kind, not a loop feature: `CONNECTION_TEMPORAL_KINDS =
['data','async','delayed']` (`connections/connectionModel.ts:30`), drawn
dotted with a draggable z⁻¹ pill and an optional seed label
(`connectionPresentation.ts:2-10`), with the alternate solid-before /
dotted-after treatment (`:27`). Screenshot opened: `Pasted image
20260906034942.png` — the merged Loop with its inspector (type-only header
ports, Turn "Reads" field).

**bbox-ui already has** more of this than the list assumes:

- the z⁻¹ **paint** is done: `Trace variant="delayed"` with the
  solid/dotted split (`trace.tsx:129-135, 269`), and `TraceBadge` is the
  draggable pill (`traceBadge.tsx:90`). `Badge` already ships the `z-1`
  vocabulary story.
- the container: `Block` + `Bar` (operator header, centred title) +
  `blockMembers` + footer.
- the turn chip: a `Badge` in the footer/header slot — props reach, no new
  component.

**The honest gap, three pieces:**

1. **Band ports.** `BlockPort` attaches rails to the Block's four outer
   walls only (`blockPort.tsx:86-101`); nothing can put a port on a *Bar's*
   edge, which is where the Loop's item outlet and the Branch's controls
   live. See §3.2 — this is the one real component gap under all of 2.1-2.3.
2. **The back edge needs a wire layer** to exist at all (Group B / P1); the
   *routing* of a back edge to the bottom lane and around is then the tidy
   pipeline that already landed.
3. **The `for|while` knob** is a preset field on the container preset, not a
   fork — port the W10 decision, don't re-open it.

### 2.2 Branches / conditionals, with active-branch logic

**SystemSketch today.** The contract is verbatim in
`branch/branchModel.ts:1-17`: a region Blocks drop into, no ports except
**control ports on its band**, an ordered list of arms each with free-text
title / `open` / own height, and *"at most one `activeArmId` — no active arm
means every arm is active"*. Case view = expanded with at most one arm open.
Active-branch paint is one token: non-active arms, their Blocks and their
cables fade to `BRANCH_FADE_OPACITY = 0.18` (`:38-39`). The pill's ◎ toggles
it (`branchCommands.ts:305-327`).

**bbox-ui expression.** An arm is a member Block with a `FoldingChevron` and
a title Bar; the arm stack is `blockMembers`; the band is a Bar with band
ports (gap §3.2); `activeArmId` is one nullable prop on the container preset.
The fade is where it gets interesting: fading *"their Blocks and their
cables"* means the emphasis is **derived over the scene** — which members and
which wires belong to the active arm — so the full behaviour needs the wire
layer (P1) and a scene record (P4). The static gallery (two arms, one faded,
case view) needs neither and pins the paint today.

**Gap:** the container preset + an `emphasis`/`dimmed` visual state on Block
and Trace (one opacity token, matching the donor's single-token discipline),
then the derivation once wires exist.

### 2.3 Regions — "the big one" — with the blackbox toggle

**SystemSketch today.** Three region kinds, three different weights: Branch
(3,298 lines), Loop (1,176), Async region (a stock Frame + meta,
`asyncRegionModel.ts:33-38`). Plus the wrap-selection command family
("turn group into frame / Block / visual group", recorded in
`PROJECT - System Sketch.md:1431`). Clipping and drag-in/out are inherited
from tldraw's `BaseFrameLikeShapeUtil`, not written
(`DP - Frame.md`, `frameBase.test.ts`).

**The contradiction to surface rather than paper over.** His own spec page
says regions do not fold: *"regions are not the collapsible, nestable things
blocks are; they exist to mark control flow, and folding them would mean
something different"* (`DP - Region.md:17-19`) — and indeed neither donor
region has any collapse (grep: none). The new ask — *"Regions… with the
blackbox toggle switch"* — is therefore **new semantics, not a port**. Two
readings:

- *Blackbox = collapse the region to its interface* (band ports only,
  contents hidden). Then a Region really is a Block in whitebox/blackbox
  views and the earlier "regions never fold" rule is repealed — which
  *strengthens* the one-container thesis of 2.0.
- *Blackbox = hide internal wiring but keep contents* — a lens, not a state.

Recommendation: build the toggle as the first reading (it is exactly the
existing `Toggle` blackbox semantics — hollow square open, filled closed,
already shipped — driving the container preset's view), and put the second
reading to Zach as a one-line question. Default if he says nothing: reading
one.

**The other honest gap: clipping.** A region whose members overflow must
crop them. In DOM, `overflow: clip` on the body is nearly free and Block's
root is already `overflow-hidden` — the *component* gap is small. What does
not travel is drag-in/drag-out membership, which is host interaction geometry
in both target engines (`DP - Frame.md` open question). Answer the DP - Frame
question now, in writing: **bbox-ui ships the clip (a `Frame`-shaped body
prop or the container preset's body), hosts own membership** — same line the
architecture already draws for hit-testing.

### 2.4 Auto size / fit — his one phrase is three different mechanisms

Naming them separately is the work; they have different owners:

1. **Hug contents** (a box sized by what is in it). Component-owned and
   mostly done: Block hugs when `height` is absent, EditableText field-sizes,
   Bar's grid collapses empty tracks (`bar.tsx`, `barGridTemplateColumns`).
   Remaining: the container preset must hug its member stack the same way —
   free if it is Block.
2. **Fit container to children** (grow/shrink a parent around moved
   children). Host-owned, and the donor proves it should stay that way:
   `blockAutoResize.ts:1-27` is *policy only* over tldraw's stock
   `fitFrameToContent`, plus a guard list of transform states during which
   running it would corrupt the gesture (`:47-60`). Port the *policy
   pattern* to the tracer host (P3) when the time comes; never into the
   core.
3. **Choose positions** (auto-layout of a graph). Already solved
   off-the-shelf in the donor: ELK `layered` via lazy-loaded `elkjs`, with
   Dify-derived options — model order preserved, `FIXED_ORDER` ports,
   orthogonal routing room (`blocks/layout/organizeGraph.ts:1-51`); the
   selection/container scoping lives in `organizeNodes.ts:1-10`. The adapter
   is pure (positions in, positions out) and could travel as a bbox-ui-side
   module almost unchanged. This is also most of the honest answer to 2.9.

### 2.5 Mutating edges

**SystemSketch has the complete chain, end to end** — this is the
best-specified item on the list:

- **the signal on the port:** `mutates: T.boolean` on an input
  (`blockModel.ts:308`); marking it derives an *effect port* on the **top
  edge**, id `effect:<inputId>`, name mirroring the argument
  (`reconcileEffectPorts`, `blockModel.ts:1309-1379`; behaviour pinned in
  `effectPorts.test.ts:37-49`). Centred until a cable moves it
  (`blockModel.ts:392`).
- **the edge out the top like a side effect:** a cable leaving an effect
  port derives its paint — it never stores a second copy — warm
  `--ss-warning` ink, 2.6 width, `mut` pill
  (`connections/effectCable.ts:1-33`); *"`z⁻¹` says the value is read one
  iteration late. `mut` says it exists only [because of the mutation]"*
  (`connectionPresentation.ts:223`).
- **the auto-drawn overlay:** the *tether* — a faint elbow from the input's
  hook to its effect port, pure geometry over the block layout,
  pointer-events none, port view only (`effectTether.ts:1-30`). And the
  effect port *follows* wherever its cable crosses the boundary, matched by
  name (`connections/effectPortFollow.ts:1-26`).

**bbox-ui expression, per the repo's own rule (props first):**

- signal on the port → the secondary slot (single-line by lane F's contract)
  or a ring-tone; plus the `mut` Badge vocabulary that already exists. What
  is genuinely missing is a **`mutates` marker prop on Port/LabeledPort** —
  one visual prop, small.
- the effect edge → `Trace` with `color` + the `mut` `TraceBadge`; no new
  variant needed (`TraceProps` passes stroke colour through, `trace.tsx:123-126`).
- the derivation (mutates → top-edge item appears) → ~30 pure lines over the
  scene record — same shape as Group B's wired-state derivation, and the
  reason this lands *after* P1/P4, not before.
- the tether → a pure `effectTethers`-alike over `blockPort.layout` rail
  output, drawn with the existing polyline Trace. Portable now as a gallery;
  the follow-the-cable half is wire-layer behaviour.

### 2.6 Tidy — "making sure it goes around things properly"

Mostly landed since he wrote the list: the elbow stack is ported verbatim
with provenance (`ff9fc1c`), tidy is a pure function
(`trace.tidy.ts:1-31`), and lane H shipped the 16-direction-pair matrix and
the soft-clearance explanation he asked for (`460e924`, `1076eb2`).
Obstacle-aware routing exists (`elbow/collisionRouting.ts`). What actually
remains:

1. **Measured obstacles**: the ~40-line collector that turns real
   `[data-slot="block"]` rects into keep-out rects — P5, verbatim; blocked
   only on P1.
2. **Tidy over wires on blocks** — the composition story, same P5.
3. His libavoid / draw.io remark: the current router *is* the
   donor's — SystemSketch's own A*+nudge — not hand-rolled here; whether the
   donor originally benchmarked against libavoid was **not verified** in
   this pass. The honest posture: keep the ported router (it has the 46-case
   evidence base P5 cites) and treat a libavoid comparison as an experiment
   someone runs only if tidy quality actually disappoints on real boards.

### 2.7 Interactions — his hypothesis, answered rather than agreed with

His note: *"they are more dependent on the whiteboard framework? also they
kinda sit ontop of the things we are interacting with?"* Half right, and the
donor's own architecture shows exactly where the line is — every interaction
in SystemSketch is already split into a pure model and a host gesture:

| Interaction | Host-owned (stays out) | Component/pure (buildable NOW in Storybook) |
|---|---|---|
| draw an edge, click-to-place | tldraw's own tool states, ridden not rebuilt (`arrowClickToPlace.ts:12-26`) | — |
| **make a port when you draw an edge** | the drag itself | the add-bead geometry is pure over layout — position computed by laying out the *hypothetical* block that already has the port (`ports/portAffordances.ts:1-11`); a bead affordance + story is core work |
| **edge ends nowhere → quick menu** | anchoring to a canvas point | the menu IS a component: `BLOCK_PICKER_PRESETS` is pure data (`connections/blockPicker.ts:37-55`; *"a cable that landed on nothing is a question, not a mistake"* `:12-14`) + the vendored `DropdownMenu`; a shadcn `Command` popover with those presets is a Storybook story today |
| port move / reorder | long-press recognition | the wall/landing model is pure (`ports/communicationPortDrag.ts:1-19`); PortEdge's dnd already proves the pattern in-component |
| eligibility highlight | pointer routing | the predicate (`judgeConnection`, `connectionRules.ts:34-39`) is engine-free logic; `Port` already has `hinting` |
| contextual popup / menus | positioning against selection | the control registry is a pure table + React surface (`contextualMenus/contextualControlRegistry.ts:30-49`); FigJam is the named UI oracle (`DP - Contextual Popup Menu`) |

So the corrected statement: **the gesture layer is host-owned; the menus,
affordance geometry, preset vocabularies and predicates are components — and
none of them is blocked on anything.** The lane's own multi-line editing
already proved interaction-in-component works (D13 close-on-drag). What the
interaction work IS blocked on for *truth* is a real host — which is P3's
tracer, one more reason it matters.

### 2.8 Linters

**SystemSketch has both halves — and one known break between them.** The
check half: `judgeConnection`'s refusal set — cycle, duplicate, **fan-in**
(his "multiple edges ending at the same port"), fan-out, type-mismatch,
same-polarity… (`connectionRules.ts:40-51`), with every rule stood down by
default under the whiteboard policy (`:31-32`); and the board linter with six
codes — blank title, duplicate port id/name, unresolved input, duplicate
connection, dataflow cycle (`diagnostics/diagnosticsModel.ts:35-42`). The
paint half: lint severity maps into **the primitives' own state
vocabulary** — *"a diff mark and a lint mark are the same visual object with
different producers"* (`:48-55`). The known break, recorded in the vault: the
lint producer is not wired to paint, and Branch has no `state` prop at all
(`PROJECT - System Sketch.md:1603`).

**bbox-ui expression.** A linter is a pure function `scene → Diagnostic[]` —
which requires a scene to exist (P4), and paint rungs to land on — which the
reset primitives don't have (§3.4). Both halves are engine-free; neither is
big. Port the *reporting* posture, not the blocking one: rules report, the
whiteboard never refuses (the donor's own default, and P-doc's
`judgeConnection` note).

### 2.9 Animation, and the SPICE remark

His instinct — *"pure functions that can do the dag calculations… it really
ends up looking like circuit analysis"* — is right, but the useful version is
not an animation engine and not bespoke linear algebra:

- **The flow animation already exists at the component level**: `Trace`
  ships `animated` marching ants (`trace.tsx:127`) and the `async` dash
  grammar; the vault's `wire-flow-animation-2026-09-06.html` is the prior
  art. What a "play button / scrubbing bar / packet animations" needs
  (his own README ambitions, `PROJECT - Black Box UI.md:210-231`) is a
  *scene-level scheduler* deciding which traces animate when — a derivation
  over the scene record, host- or story-owned, ~zero new component work.
- **The "circuit analysis" is graph derivation, already off-the-shelf**:
  reachability walks are ~50 pure lines (`propagation/propagationGraph.ts:1-33`)
  and position-solving is ELK (2.4.3). Nobody should write a matrix.

Verdict: agree with his "out of scope for now" — with the note that when it
comes back, it is two small pure modules over the scene record plus props
that already exist, not a subsystem.

---

## 3 · What he forgot

Five things, each argued. Short beats long here.

### 3.1 Everything on the list is a derivation over one scene record — which still has no name

Walk the list: active-branch fade dims *members and their cables* (2.2);
mutation derives a top port *from a marked input* and follows *its cable*
(2.5); linters read *ports, wires and cycles* (2.8); animation schedules
*which traces pulse* (2.9); wired-state, producer counts, `+N wired` chips —
all of it is `f(scene)`. Six features, one input type. P4 already proposes
the `BlockScene` contract; what the list adds is the *reason it cannot
slip*: without it, each of these six lands as a story-local literal with its
own shape, and the donor's own best subsystem (canonical model, recomputed
projections) is the counter-example that worked. **P4 stops being "nice
typing" and becomes the substrate of items 2, 5, 8 and 9.** Sequence it with
Group B, not after it.

### 3.2 Band ports — the one real component gap under all three control-flow items

The Loop's item outlet sits on the **header's bottom edge**
(`loopModel.ts:43-52`); the Branch's controls sit on its **band**
(`branchModel.ts:55-60`); his own Block-Layouts golden has the red note
"Header ports · Scoped region…" on it (`Pasted image 20260917151711.png`,
opened). bbox-ui rails attach only to the Block's four outer walls
(`blockPort.tsx:86-101` — "this component only places ports on its walls").
No prop combination reaches a port on a Bar's boundary. This is the one
place in 2.1-2.3 where the "it's all presets of Block" answer genuinely
fails today — a small, named extension (a rail hosted on a Bar edge, or an
`edgeT`-style inset placement the effect ports also want) rather than a new
component. Everything else in the region story composes; this does not.

### 3.3 The Value capsule — the fourth view, and the quick-pick vocabulary that needs it

The donor's Block has a fourth representation the reset dropped: `value` — a
literal drawn as a capsule, one inlet, one outlet, title IS the literal
(`blocks/valueBlock.ts:1-31`); the reset's `BlockView` is
`simple|port|expanded` only (`blockPort.layout.ts:39`). The loops and
branches he wants to draw are exactly where literals and variables appear
(`for x in xs`, `while err > tol`, seeds on z⁻¹ edges). And the
edge-ends-nowhere menu he asked for (2.7) offers a vocabulary — Value,
Bundle, Unbundle, Copy, Select, Clock (`blockPicker.ts:37-55`,
`stockBlocks.ts:12-25`); if those presets don't exist as fixture data, the
menu has nothing to offer. Cheap: one capsule preset + a stock-preset data
module + one gallery. Without it, every loop example fakes its literals as
bare blocks.

### 3.4 Error / warning rungs on the primitives — the paint half of linting

The donor deliberately runs lint marks *and* diff marks through one state
vocabulary on the primitives (`diagnosticsModel.ts:48-55`) — and its recorded
gap (lint never wired to paint, Branch stateless) is a warning about leaving
this late. The reset's `Port` has four states, none of them `error|warning`
(`port.tsx:52-57`); Trace and Block have none. Adding the rungs now is a
props-only, gallery-reviewable change that makes 2.8 land as data later —
and buys the future board-diff feature its visual language for free. Forgot
in the precise sense: the list asks for linters and never mentions what a
lint *looks like*.

### 3.5 Linked copies — the identity model behind the `Draft` badge

His own earliest block list includes *"make a linked copy of the block
(links by name)"* (`PROJECT - Black Box UI.md:162-166`), the donor carries
`Draft N` as a same-name definition identity (recorded in
`PROJECT - System Sketch.md:1550`), and the reset already ships the `Draft`
badge as *vocabulary* — with nothing behind it. This is not urgent, but it
is a **scene-contract decision** (is a block's identity its id or its
name?), and P4 is about to freeze that contract. Deciding it costs a
paragraph in P4's invariants now; retrofitting identity into a shipped scene
format later is a migration. Flagged so the cheap moment isn't missed.

---

## 4 · Sequencing — what unblocks what

Dependencies stated; everything not listed as depending is parallel.

**Barrier first (one lane, alone):**
1. **Group B wires + the scene record together** (P1 + P4, one dispatch —
   §3.1's argument; the `Wire` record and `BlockScene` are the same freeze).
   Fold in: wired-state derivation, producer counts, §3.5's identity
   paragraph.

**Parallel, now — no dependency on wires:**
2. The queued feedback lanes E/F/D/I (`FEEDBACK-2026-09-17c-PLAN.md`) — F's
   secondary-slot contract is where 2.5's `mutates` marker will land, so F
   precedes the mutation work.
3. Interaction *components* (2.7): quick-pick menu over the preset
   vocabulary (needs §3.3's data module), add-port bead geometry,
   contextual-popup surface. Pure + gallery-reviewable.
4. §3.4 state rungs; §3.3 Value capsule + stock presets.
5. Band ports (§3.2) — small, and gates the region probe.

**After the barrier:**
6. **The region probe** (P6, now concrete): container preset → For loop
   (band ports + delayed Trace + turn Badge) → Branch arms + active fade →
   blackbox toggle, with the 2.3 question to Zach. Needs 5; wants 1 for the
   back edge.
7. Mutation chain (2.5): marker prop → derivation → tether overlay. Needs 1
   and lane F; tether gallery can lead.
8. Tidy composition + measured obstacles (P5). Needs 1.
9. Linter as `f(scene)` (2.8). Needs 1(P4) + §3.4.

**Then, and deliberately last:**
10. The tracer host (P3) — where the gesture layer of 2.7 and the auto-fit
    policy of 2.4.2 get their first truth. ELK organize + animation
    scheduler (2.4.3/2.9) ride behind it, both off-the-shelf/pure.

The bt-flow boundary holds by construction: nothing above special-cases BT;
the region probe (6) is what makes a later bt-flow library a consumer of
these parts instead of a fork.

---

## 5 · Stock parts, element by element

| Element | Today | Off-the-shelf part (exact exported name) | Behaviour that must survive |
|---|---|---|---|
| Container preset chrome (2.0-2.3) | bespoke donor shapes (`branch/`, `loop/`) | existing lane parts: `Block`, `Bar`, `FoldingChevron`, `blockMembers` — no new primitive | fold shrinks height (CollapsibleHeader assertion); Bar edge-to-edge, no card border |
| Blackbox toggle (2.3) | donor: none (regions never fold) | `Toggle` (lane, lucide `Square` fill flip) | hollow=whitebox, filled=blackbox — his sketch, already asserted in `Toggle.stories` |
| z⁻¹ back edge (2.1) | donor `connectionPresentation` delayed paint | `Trace` `variant="delayed"` + `TraceBadge` (lane) | solid-before/dotted-after split; pill draggable along `t`; seed label text |
| Quick-pick menu (2.7) | donor bespoke picker UI | shadcn `DropdownMenu` (vendored) or `Command` in a `Popover` (installable — `STOCK-PARTS.md` §2 registry list) | preset rows = `BLOCK_PICKER_PRESETS` data; Esc/keyboard nav stock |
| Contextual popup (2.7) | donor `ContextualControls` on tldraw chrome | Base UI `Toolbar` (`Toolbar.Root/.Button/.Group` — `STOCK-PARTS.md` §1) + `Tooltip` | FigJam is the interaction oracle (`DP - Contextual Popup Menu`); registry-driven controls |
| Port reorder / arm drag | donor dnd + long-press | `@dnd-kit/sortable` (`useSortable`, already the lane's engine) | drag preserves size (B1); grouped move as unit |
| Auto-layout (2.4.3) | donor `organizeGraph` | `elkjs` (`ELK`, lazy-loaded, `elk.algorithm: "layered"` options ported from Dify) | model order preserved; `FIXED_ORDER` ports; positions only — router keeps cable geometry |
| Fit container to children (2.4.2) | donor policy module | tldraw `fitFrameToContent` — **host-owned (stock seam)**, never in core | the gesture guard list (`blockAutoResize.ts:47-60`) travels with the adapter |
| Clipping (2.3) | tldraw `BaseFrameLikeShapeUtil` inheritance | DOM: CSS `overflow: clip` in core; hosts keep their frame primitives | crop members outside bounds; membership drag stays host |
| Flow animation (2.9) | donor dash presentation | SVG `stroke-dashoffset` — already `traceStrokeStyle` (lane); no library | `animated` opt-in, `data` variant only; async dash centring |
| Lint checks (2.8) | donor `judgeConnection` + `diagnosticsModel` | none — pure functions over the scene record | report, never block (whiteboard policy); fan-in named per port |
| **unchanged (stock seam)** | tldraw gesture/tool states, pointer capture, z-order, snapping; dnd-kit's store; the elbow router already ported; `Block`'s DOM contract | — | the core still never listens for pointers; interaction geometry never travels |

---

## Deliberately not proposed

- **Anything behaviour-tree-shaped** — out of scope by instruction; the
  region probe is its future substrate, nothing more.
- **A While-loop redesign** — decided 2026-09-06 (W10 + W2,
  `DP - Region.md:109-135`); port the decision.
- **A second router or a libavoid port** — 2.6's posture: compare only if
  real boards disappoint.
- **Depth navigation, title-bar path, drafts chrome, tables, panels** — app
  chrome, host-owned per the architecture's own line (and P-doc's same
  call).
- **Re-litigating the strategy ranking** — P1-P10 stand; this document
  changes only one sequencing fact (P4 moves up, beside P1 — §3.1).
