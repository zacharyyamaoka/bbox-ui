# Ten proposals — the second pass, reviewed (2026-09-17)

Strategic review, not an implementation plan. Mirrors the AI comment in the
vault note `Projects/bbox-ui/MOC - bbox-ui Components.md` (marker
`ai-comment:ten-proposals-2026-09-17`). Zach's brief: look at the work done so
far and at SystemSketch, and make ten proposals — ports still owed, polish,
and reframes — grounded in what the exploration actually taught. Everything
below was measured in the trees on 2026-09-17; nothing is recalled from
memory. No code was written and nothing was committed by this review.

## What bbox-ui is for — my reading, stated so the proposals can be judged against it

SystemSketch was the exploration: build the whiteboard fire-from-the-hip,
learn which functions a system-design surface actually needs, and let the
domain boundaries fall out. They fell out — the vault's own catalogue now
names them (5 generic primitives, 5 custom primitives, 6 composites, and the
domain composites Component/System/Behavior Tree on top, `MOC - bbox-ui
Components.md:16-106`). bbox-ui is the second pass that cashes those
boundaries into components you can hold one at a time: props in, DOM out,
interaction geometry host-owned (`ARCHITECTURE.md:19-33`), reviewed as
Storybook galleries because a gallery shows a whole design space in one
glance (the vault records this as the thing that made the work feel fast
again — marker `storybook-gallery-workflow-2026-09-16`).

**Where I disagree with the repo's own framing.** `CLAUDE.md` says "the
registry is the product." The evidence says otherwise: every design decision
of the last four days landed in `apps/storybook-basics`, which no consumer
can install; the registry still serves the pre-reset lineage
(`registry.json`: `port`, `block`, `bbox-layout`, two un-installable
adapters); and the one real customer — SystemSketch — consumes bbox-ui by
vendoring a copy, not through the registry at all
(`systemsketch/src/bboxUi/`, wired into a live "BBOX-UI" toolbar family
since `47c3e2c9`, 09-14). The honest statement of the goal, from the
evidence: **SystemSketch rebuilt on these components is the product; the
registry is the form factor** (copy-ownable, sibling-complete, engine-free)
**that keeps the components honest; the gallery is the factory floor.** The
ten proposals follow from that reading — they are ranked by how much of the
SystemSketch-rebuilt-on-components goal each unblocks per week of work,
discounted by the risk the work is wasted if done now.

## Where it actually stands — measured in the trees, not from memory

| Fact | Measured | Where |
|---|---|---|
| The reset lane | 45 non-test component sources + 8 test files + 23 story files in `apps/storybook-basics/src`; branch `claude/bar-block-storybook-17d0ae`, clean at `d504afd` | this worktree |
| Milestones landed | Port/LabeledPort/PortEdge (Phases 1-4 incl. the multi-line lane), Bar/Block/members, Glyph/EditableText/CodeEditor, Trace + terminals + routing + elbow (2,324 verbatim lines) + tidy + badge (`f15960b`), PortedBlock rails with view→placement rules (`d504afd`) | git log; the five plan docs |
| The wire milestone | **Not built.** Trace merged, so BLOCK-PORT-EDGES-PLAN's Group B (`wiring.ts`, `wireLayer.tsx`, BlockWiring / AsyncRegion / TraceArrowhead stories) is dispatchable and absent — zero hits for `wireLayer` in `src/` | `BLOCK-PORT-EDGES-PLAN.md:110`; grep |
| Four lineages of one component set | `packages/bbox-ui` (mature, FieldSpec cascade, registry, adapters) · `apps/storybook-basics` (reset, all new design) · `systemsketch/src/bboxUi` (vendored snapshot, live in the toolbar) · `demos/dndkit-lab` (interaction donor, superseded) | tree; `registry.json`; systemsketch git |
| The vendored copy is not merely stale — it is **diverging with its own fixes** | `src/bboxUi/core/port.tsx` is 687 lines, zero `SlotOrigin`/`secondarySlot` (pre-split, as PORT-EDGE-PLAN.md:35 measured) — but it took its own bug fixes after that measurement: bbox-code click-to-position + floating menu (`4c01e6fe`, 09-15 18:49), and the adapter took four rounds of adversarial invalidation fixes (`10748b8c` et al., 09-15 22:30). Those fixes exist in **no** bbox-ui lineage | `systemsketch` git log on `src/bboxUi` |
| SystemSketch's exploration mass | 586 non-test source files; `blocks/` ≈ 36.4k non-test lines (connections 11.5k, ui 10.5k, babble 4.6k, elbow 3.9k); `behaviorTree/` 13,701 non-test (17,697 with tests); `branch/` 3,298; `loop/` 1,176; `table/` ~4.0k; `appearance/` 4,328 | `wc -l` sweeps, 09-17 |
| Zach's standing asks, unbuilt | "Adding storybook components into system sketch — these should replace, and append to this v2 bbox-ui tool bar" (MOC:969-975, trails off unfinished); the 09-17 block feedback (corner radius edge-to-edge, fill-vs-own gallery, code-in-block variants, MOC:978-995); the toolbar five: Block, Labeled Port, Branch, Loop, Glyph (MOC:483-493) | `MOC - bbox-ui Components.md` |
| Known-but-deferred defects | `offsetPaddingFor` (`portEdge.layout.ts:147-149`): self-described approximation, bypassed by the exact `offsetEdgePaddingPx`, its only remaining call sites a test that documents its wrongness (`blockPortEdges.layout.test.ts:136-142`); the lane's line-order-vs-items-order proviso (recorded in the 09-16 vault callout as "scoped out rather than solved"); the marker-on-split-paths acceptance (B3, contingent); donor `THIRD_PARTY_NOTICES.md` dangling (TRACE-PLAN finding 3, chip raised) | cited files |

---

## The ten proposals, in rank order

Ranking rule, stated: **distance closed toward SystemSketch-on-components per
week of work, discounted by reversal risk.** Cheap irreversible clarity ranks
above expensive reversible construction; anything that must wait on a
dependency says so.

---

### P1 · Land the wires — dispatch Group B and call the DAG milestone

**Kind:** port. **Size:** ~240 net-new component lines + ~1,400 story lines,
already specified to the prop level — two or three builder-days.
**Depends on:** nothing; the dependency (Trace) merged at `f15960b`.

The argument: `BLOCK-PORT-EDGES-PLAN.md` split its work into Group A
(buildable pre-Trace — landed, `d504afd`) and Group B (everything with an
actual wire), and defined Group B so precisely that no re-planning is needed:
the `Wire` record (§5), `WireLayer`'s frozen contract, wired-state derivation
(~30 lines, derived never stored), duplicate-fan (D-B3), the async
communication gallery as PortEdge `groups` configurations (§7's per-family
table), and arrowhead acceptance (§8). Trace has merged; nothing has been
dispatched. Until Group B lands, bbox-ui cannot draw the one picture the
entire product is about — two blocks and a wire between them. Every
exploration artifact Zach called "the next very big thing" (traces between
ports, MOC:955) converges here.

What it unlocks: the first real system diagram; the fixture every later
proposal composes on (P3's round-trip, P5's tidy board, P6's regions);
`hinting`/`wired` finally driven by data instead of static story props.

Strongest objection: it is already planned, so proposing it adds no design —
the only content here is *sequencing*: it goes first, alone, before any new
design conversation, because it is the highest-value zero-decision work in
the repo, and because the 09-17 block-styling feedback (MOC:978-995) will
otherwise keep pulling attention into polish while the milestone that makes
the components *mean* something sits specified and unbuilt.

---

### P2 · Name the trunk — one canonical lineage, three consumers

**Kind:** reframe. **Size:** one honest page in `ARCHITECTURE.md` + a rule in
`CLAUDE.md`; half a day. **Depends on:** nothing; sharpened by P7.

The argument: the reset restarted because SystemSketch accumulated "similar
components underneath… having to redo them each time" (Zach, MOC:452-456).
That exact disease is now re-presenting *across repos*: four lineages of one
component set, and the plans still say "the mature package stays the design
authority" (`PORT-EDGE-PLAN.md`, stock-seam row) while every actual design
decision — LabeledPort's root-is-the-dot-box fix (B4), grouped-spacing
(B5/B7), the lane, PortedBlock — landed only in `apps/storybook-basics`. The
authority claim is measurably false in practice. Worse, the vendored
SystemSketch copy is not passively stale but **actively diverging**: it took
its own bbox-code and invalidation fixes on 09-15 that exist nowhere else
(see the standings table). This is the setup for a semantic merge conflict —
individually correct copies, jointly wrong product.

The move: write the lineage map down as the authority. `apps/storybook-basics`
is the **design trunk**. `packages/bbox-ui` is either explicitly frozen as
the v1 lineage (my recommendation until P7) or regenerated from the trunk —
never edited as a design surface again. `systemsketch/src/bboxUi` is a
consumer that resyncs from the trunk by directory diff — the same D3 pattern
the elbow port used ("a directory mirroring the donor so future re-syncs are
a diff", `TRACE-PLAN.md` D3). Fixes made on a copy get a one-line "owed
upstream" note, greppable.

What it unlocks: P3 and P7 stop being ambiguous ("which Port goes into the
toolbar?" has exactly one answer); plan documents stop citing a false
authority; the 09-15 orphaned fixes get found and repatriated instead of
silently forked.

Strongest objection: naming a trunk mid-churn could be premature — the reset
lane is three days old and `packages/bbox-ui` still holds things the trunk
lacks (the adapters, `blockLayout.ts`, detach, the schema). The answer is
that the declaration is about *where design happens*, not about deleting
anything: the mature package keeps everything it has, it just stops being
where decisions land — which is already true, just unwritten.

---

### P3 · Round-trip one component into SystemSketch's v2 toolbar — the tracer bullet for the whole thesis

**Kind:** port (of the reset lineage into the real host). **Size:** one
ShapeUtil + one tool + a resync of the needed component files; a focused
week for the first component, days for each after. **Depends on:** P2 (which
lineage travels); P1 for anything wired.

The argument: this is Zach's explicit, standing, unfinished ask — "All
further work here should be done on the new bbox-ui system design
components" (MOC:258-260) and "these should replace, and append to this v2
bbox-ui tool bar" (MOC:969-975, the sentence trails off at "Please add").
The v2 toolbar family already exists in SystemSketch (`47c3e2c9`) — but it
serves the **old** lineage. Meanwhile `ARCHITECTURE.md:44`'s load-bearing
claim — "a third host is a ~150-line afternoon instead of a fork" — has
never been tested against anything the reset built. PortedBlock measures its
own Block with a ResizeObserver; the lane closes on drag-start via a
document-capture listener; the wire layer resolves dots by `querySelector`.
Each of those is app-level behaviour that has only ever run inside
Storybook's DOM. A tldraw `HTMLContainer` is the exact environment that
breaks this class of assumption (stacking contexts, camera transforms,
pointer capture) — SystemSketch's own history is the evidence.

The move is a tracer, not a migration: **one** component —
`Block`+`PortedBlock` in port view, or just `LabeledPort` — wrapped in one
ShapeUtil in the existing v2 family, driven end-to-end (place, drag, edit a
label, fold the chevron), and measured. Not five components, not toolbar
parity: one, to find where the seam actually leaks before the contract
freezes around Storybook-only assumptions. Per the standing rule,
implementing is not integrating — this lands on a branch and reports; wiring
it as the default toolbar is Zach's call.

Stock parts, element by element:

| Element | Today | Off-the-shelf part (exact name) | Behaviour that must survive |
|---|---|---|---|
| Shape shell | v2 family's old-lineage utils (`BBoxBlockShapeUtil` et al., `src/bboxUi/adapter/`) | tldraw `ShapeUtil`, `HTMLContainer`, `Rectangle2d`, `resizeBox` — the same seams the old adapter and both tldraw starter kits use (`TLDRAW-STARTER-KITS.md`) | props.w/h authoritative; hug-vs-explicit size per `ARCHITECTURE.md`'s size contract |
| Toolbar slot | `SystemSketchToolbar.tsx` v2 family | stock tldraw tool registration (existing `toolbarIntegration.ts`) | family button + last-used-tool memory, unchanged |
| The component itself | reset `block.tsx`/`blockPortEdges.tsx` | **unchanged (stock seam)** — copied by value from the trunk, header comment naming the source commit | every Storybook-measured behaviour (fold shrinks height, rails track the hug) re-measured in-canvas |
| Drag/selection/z-order | — | **unchanged (stock seam)** — tldraw owns all of it | the core still never listens for pointers |

What it unlocks: the outer loop. Every boundary the second pass drew gets
its first contact with the real host while it is still cheap to move; the
migration path stops being a leap and becomes a lane.

Strongest objection: premature integration freezes contracts mid-churn —
Zach is reshaping Block styling daily (MOC:978-995), and a live in-canvas
consumer makes every reshape a two-repo change. That is exactly why the
proposal is one tracer component behind a testing-family toolbar button, not
a migration: the cost of moving a seam stays one file, and the information
value of the first real-host contact is highest precisely *because* the
contracts are still warm.

---

### P4 · Freeze the scene contract — the document half three plans keep deferring

**Kind:** reframe. **Size:** ~100 lines of types + invariants + one fixture
module refactor; two days. **Depends on:** P1 (Wire exists there first).

The argument: three plans independently flag the same hazard and defer it in
the same words — "no `Placements`/`Arrangement` model, no edge parking…
still the first hazard to handle when a real canvas host adopts this"
(`PORT-EDGE-PLAN.md:344`, `PORT-EDGE-PLAN-PHASE4.md` §5/§9,
`BLOCK-PORT-EDGES-PLAN.md:644-647`). Meanwhile the stories are quietly
inventing the document anyway: every gallery authors `{items, groups, view,
wires}` literals, and Group B's `Wire[]` is a de-facto schema with no name.
The exploration already validated the architecture this wants: SystemSketch's
behaviorTree keeps a **canonical pure model (XML) with projections recomputed
from it on every change — no second graph model** (`btcppXml.ts`, 1,174
lines, zero tldraw imports), and that subsystem is the most structurally
disciplined thing in the donor. The reset's equivalent is not a store and
not persistence — it is a *typed fixture format*: `BlockScene` (blocks,
per-edge items, view, portLayout, groups, wires, badge `t`s, elbow pins)
plus its invariants (ids unique; a wire names ids that exist; edge parking
closes the lane, PHASE4 §5's recorded rule). The same freeze-the-contract
move that let the trace lanes run in parallel (`TraceTerminalSpec`,
TRACE-PLAN §"endpoint contract") applied one level up.

On behaviorTree, answered directly since the brief asks: **its absence from
bbox-ui is correct, permanently, as a subsystem.** BT is a domain composite
— the vault's own composition tree builds it *from* Block, Trace, Region,
Glyph, Badge (`MOC:104`), and its 13.7k lines are mostly a tldraw projection
+ mock runtime that the component approach exists to make unnecessary. What
should cross is not code but its **pattern** — canonical model, recomputed
projection — and P4 is that pattern's landing site. Porting `behaviorTree/`
itself would be porting the third pass before finishing the second.

What it unlocks: P3's ShapeUtil serializes something real instead of
inventing shape props ad hoc; stories stop re-authoring divergent literals;
the SystemSketch migration inherits a document story instead of discovering
one; `channelParser` round-tripping (D-B6's `name.phase` grammar) has a
place to point at.

Strongest objection: schema before a second consumer is YAGNI, and the
reset's whole ethos is props-not-schema — T1's cascade is the cautionary
tale of modelling ahead of need. The distinction that answers it: the
cascade modelled *resolution semantics* nobody used; this names *data that
already exists* in every story file. If the types end up merely moving
fixture literals into one module, the cost was two days and the stories got
deduplicated; the downside is bounded in a way T1's was not.

---

### P5 · Compose tidy over the block galleries — close the loop the trace lane left open

**Kind:** port (composition of two landed halves). **Size:** one story file
+ a ~40-line measured obstacle collector; one to two days. **Depends on:**
P1.

The argument: `trace.tidy.ts` runs SystemSketch's tidy pipeline over
hand-authored fixtures, and `BLOCK-PORT-EDGES-PLAN` explicitly deferred the
composition: "No tidy pass over the wire galleries. Tidy belongs to the
trace lane… running it over the block galleries is a follow-up composition"
(:648-650). Once Group B exists, a `TidyBoard` story — real PortedBlocks,
real wires, one Tidy button, `describeTidyEdgesOutcome` as the status line —
is SystemSketch's tidy-edges feature re-expressed in components. The one
missing piece is the analogue of `routingObstacles.ts` (deliberately not
ported, TRACE-PLAN table): a collector that turns measured
`[data-slot="block"]` rects into keep-out rects. That is ~40 app-level lines
of `getBoundingClientRect`, the same D8 legality the lane already uses. This
is also the first time the elbow/nudge stack meets *measured* geometry
rather than authored fixtures — the donor's 46-case evidence
(`layout-comparison-2026-09-02.html`) never covered that seam.

What it unlocks: the "criss-cross going through boundaries" ask becomes a
one-click demo; P3's canvas host gets tidy for free later; any regression in
the 2,300 verbatim elbow lines surfaces against real DOM before a real host
depends on it.

Strongest objection: it is demo composition, not new capability — the pure
pipeline is already unit-tested, so this buys evidence and a gallery, not
function. True; that is also why it is ranked mid-table and sized in days.
The counter is that "boxes all the way down" is exactly the claim that dies
in composition, never in isolation, and this is the cheapest composition
proof available.

---

### P6 · Prove Region is a preset, not a component — While/If/For as prop configurations

**Kind:** reframe, with a port trigger. **Size:** one gallery story to
probe; a `Frame`-shaped seam only if the probe fails; three days to a week.
**Depends on:** nothing hard; richer after P1.

The argument: Zach's earliest structural bet is on record twice — "Presets:
While loop, For Loops, Conditionals, S/P/E views… All of these can be made
with specific settings of the basic components, no need for new things"
(MOC:195-200), and the toolbar five includes Branch and Loop (MOC:483-493).
The donor spent 4,474 lines on `branch/` + `loop/` as bespoke tldraw
containers; DP - Region's spec says the second-pass answer: "a region is
composed using a block" — and the For-loop grammar was already settled by the
babble rounds (V4 Header Contract, 2026-09-02, in DP - Block's journal). The
probe: one `Regions` gallery story that builds a For loop and an If branch
from what exists today — Block + header-operator slot + blockMembers +
PortedBlock rails + (post-P1) wires crossing the boundary. Either it
composes, which validates the central "no need for new things" bet and turns
Branch/Loop in the toolbar into configurations of P3's one ShapeUtil — or a
specific seam fails (likeliest: nothing clips members to the body, i.e.
`Frame`, catalogue status *spec*; and ports-on-a-member-boundary), and the
probe has found the missing primitive *by name* instead of by anecdote.
Either result is the deliverable.

What it unlocks: Branch/Loop toolbar entries without two new subsystems;
`Frame`'s go/no-go decided by evidence; the Region page moves from spec to
building. And it is the honest venue for the behaviorTree endgame: BT's
leaves "are themselves Blocks" (DP - Behavior Tree), so proving control-flow
composition is the prerequisite for ever re-expressing BT — nothing about BT
needs deciding until this lands.

Strongest objection: Zach's own "Getting to Golden" note says keep it as
simple as possible and skip nesting niceties (MOC:950-955) — regions may be
third-pass work being smuggled into the second. The scope answer: the probe
is one story and zero new components by construction; it only *creates* work
if Zach chooses to act on what it finds.

---

### P7 · Make the registry true again — the reset set becomes installable, and the resync channel IS the registry

**Kind:** polish + reframe. **Size:** registry items for the reset set +
the adapters' import fix + one throwaway-install typecheck; two to three
days. **Depends on:** P2 (only the trunk gets published).

The argument: `CLAUDE.md` calls the registry the product and, in the same
breath, documents that its two adapters cannot be installed (they import the
unpublished `@bbox-ui/core`) — a gap it says to fix at the source level, not
paper over. The reset made this worse in the direction nobody wrote down:
the entire design surface of the last four days ships in **no** registry
item at all. `T0-SPEC.md` §9 flagged "registry-shippability of the schema
layer" as an open question and it was never picked back up. Meanwhile the
one real consumer vendors by hand (P2's finding). These are the same
problem: there is no supported channel for a component to travel from the
trunk to a consumer. The move: make the reset components registry items
(they are already sibling-complete by construction — plain props, `cn()`,
relative imports, exactly what `shadcn add` copies verbatim), fix the two
adapters the way `CLAUDE.md` prescribes (import copied siblings, declare
`registryDependencies`), and then let SystemSketch's resync (P2) run through
`npx shadcn add zacharyyamaoka/bbox-ui/<part>` with `target:` remapping into
`src/bboxUi/core/` — the consumer and the public install becoming one
mechanism, one test surface.

Stock parts, element by element:

| Element | Today | Off-the-shelf part (exact name) | Behaviour that must survive |
|---|---|---|---|
| Publish | hand-vendoring across repos | `shadcn build` over `registry.json` (already the repo's pipeline) | `public/r/*.json` servable; GitHub-direct `shadcn add` |
| Sibling completeness | implicit in the reset's copy-and-strip style | `registryDependencies` + per-file `target:` | every relative import lands as a sibling — the rule `CLAUDE.md` already states, now exercised by the new items |
| Install proof | "`shadcn add` exiting 0 proves nothing" (CLAUDE.md) | a throwaway project + `tsc` — the repo's own prescribed gate | items compile where they land, not just install |
| `packages/bbox-ui`, docs site | — | **unchanged (stock seam)** | v1 items keep serving; nothing public breaks while the reset set stabilises |

What it unlocks: the product claim becomes true for the work that matters;
SystemSketch's resync becomes diffable and mechanical; the docs site can
document the new set without inventing a second pipeline.

Strongest objection: no external consumer exists, and publishing components
whose props Zach is still reshaping daily invites churn in a public surface.
Sequencing answers most of it (this ranks behind P1-P3 precisely so the
loudest churn is over), and the items can land marked experimental; but if
the counter-position is "the registry is aspirational until the set is
golden," the honest response is then to *edit CLAUDE.md to say so* — what is
untenable is the current state, where the stated product definition and the
actual distribution of the actual work do not intersect at all.

---

### P8 · Keep the schema dead — and write down the tripwire that revives it

**Kind:** reframe (a decision recorded now, zero code now). **Size:** a
paragraph in `ARCHITECTURE.md`; an hour. **Depends on:** nothing.

The argument: the reset deliberately left behind the FieldSpec / presets /
appearance-cascade system, and the record says why with unusual candour —
T1's own amendment block documents three judge rounds finding the cascade
*decorative* (presets spread into overrides, "deleting every preset changed
nothing"), and the reset's plain-props stance is credited in-thread with the
current velocity ("This feels fast again", MOC:727-731). I am **affirming
the drop, not relitigating it** — but it has an expiry condition nobody has
named, and the migration will trip it: the moment SystemSketch's inspector
needs control rows for these components ("in system sketch we just want
good defaults, and the basic controls… I can just flag certain controls",
MOC:264-269), someone will hand-write a third control table (Storybook
argTypes being the second), and hand-written parallel tables are how drift
starts. The tripwire to record: **when a third surface needs the same
control table, resurrect T0's declaration layer only** — `FieldSpec` +
`readFields`/`MIXED` + `toArgTypes`, ~150 proven lines with unit tests
already sitting in `packages/schema` — **and never T1's presets/cascade**,
whose failure is documented. And carry the Langflow warning into the
revival's acceptance: the field `kind` must be the single, lossless,
exhaustively-matched discriminator — "if `kind:'text'` and `kind:'select'`
both become `\"string\"` anywhere in your pipeline, you have rebuilt this"
(`LANGFLOW-NODES.md:239-244`, measured against 1,884 production fields).

What it unlocks: the migration's inspector gets a pre-made, pre-judged
answer instead of an under-pressure improvisation; T0's good half stops
being guilt-by-association with T1's bad half.

Strongest objection: recording a decision about hypothetical future work is
speculative documentation — the moment might never come, or come differently.
Cost is one paragraph; the asymmetry (an hour now vs. re-deriving the
T0-good/T1-bad distinction from a 1,847-line spec under migration pressure)
carries it.

---

### P9 · Sweep the recorded IOUs before their context evaporates

**Kind:** polish. **Size:** one builder-day, one lane. **Depends on:**
nothing.

The argument: the plans' discipline of recording deferred defects only pays
if someone collects. The ledger, as of today: **(a)** `offsetPaddingFor`
(`portEdge.layout.ts:147-149`) — a self-described approximation with zero
production call sites, kept alive beside the exact `offsetEdgePaddingPx`
that replaced it; its only consumers are a test asserting how wrong it is
(`blockPortEdges.layout.test.ts:136-142`). Delete it (or fold the exact
formula in) before a future reader trusts the name. **(b)** The lane's
visual-order-vs-`items`-order proviso — "not proven for an arbitrarily
interleaved items array", scoped out in the 09-16 callout; either pin it
with a unit test over an interleaved fixture or normalise slot flattening.
**(c)** The delayed+`splitAtLabel` arrowhead acceptance
(`BLOCK-PORT-EDGES-PLAN.md` §8 named it the likeliest marker gap) — lands
free inside P1's B3, listed here so it survives if B3 is trimmed. **(d)**
`PORT_ROW_PITCH_PX`/`portRowCentre` exported from `packages/bbox-ui` with
zero call sites (PHASE4 §1's own finding) — dead weight in the lineage P2
freezes; delete or annotate. **(e)** The two CodeEditor seam asks PHASE4 §4
left standing (`extensions?: Extension[]`, `onCaretLine`) — file them as
issues against the component or drop them deliberately. **(f)** Donor-side:
`THIRD_PARTY_NOTICES.md` is still dangling in SystemSketch (TRACE-PLAN
finding 3; a task chip exists — confirm it ran).

What it unlocks: nothing shiny — it prevents the specific decay mode where
a bypassed defect outlives the memory of why it was bypassed and gets
"fixed" back into use.

Strongest objection: six unrelated small items make a diffuse diff, and
some (c, f) belong to other lanes. Answer: the sweep is the *audit*; each
fix stays a surgical, separately-explained edit, and anything owned
elsewhere is verified-done rather than re-done.

---

### P10 · Port the token theme, not a skin — dark mode and the three-styles seam

**Kind:** port + polish. **Size:** a `globals.css` token pass + one
theme-matrix story; two days. **Depends on:** nothing.

The argument: "At least 3 styles we are shipping: 1. Sketch 2. Unstyled 3.
Styled" is a for-each-component requirement in the vault (MOC:217-235), and
today the reset has exactly one style and no dark story — `globals.css`
carries two `--bbox-*` tokens (`primary`, `received`) grafted onto stock
shadcn neutrals, and no story renders any component against a dark canvas.
The groundwork already exists twice over: T1 §3 computed a full
contrast-checked OKLCH ladder (including the two corrections to shipped
tokens that measured below WCAG's 3:1 non-text floor — `--primary` at
2.75:1, `--bbox-received` at exactly 3.00:1) with light and dark values, and
SystemSketch's `appearance/` (4,328 lines) is the proven light/dark token
system in production. The port is tokens-only: adopt the audited values,
give every component's colour a `--bbox-*` name, and add one
`ThemeMatrix` gallery (states × light/dark) so regressions are visible the
way everything else here is. **Sketch mode is explicitly deferred** — it is
a rendering treatment (roughjs-style strokes), not a token swap, and
deserves its own decision; the token pass is what keeps that door open
without building anything behind it.

Stock parts, element by element:

| Element | Today | Off-the-shelf part (exact name) | Behaviour that must survive |
|---|---|---|---|
| Token plumbing | stock shadcn variables + 2 grafts | Tailwind v4 `@theme inline` mapping + CSS custom properties (already the app's mechanism) | every component keeps painting via `var(--…)` — zero component edits |
| Dark switching | none | `prefers-color-scheme` media query + `:root[data-theme]` override — T1 §3.5's dual-selector pattern, verbatim | system default and explicit toggle never fight |
| Values | eyeballed / inherited | T1 §3.1's OKLCH table (contrast-computed, both canvases) | ≥3:1 for every ring at 12px; `received`≠`success` stay two tokens (T1 §3.3's reasoning survives even though the tone axis did not) |
| Component paint | — | **unchanged (stock seam)** | the austere look Zach is iterating on is untouched in light mode |

What it unlocks: dark mode (SystemSketch runs dark; the migration would
otherwise force this under pressure); a single place to later hang Sketch
and Styled; colour decisions stop being re-eyeballed per component.

Strongest objection: austerity is currently a feature — the unstyled look
keeps review focused on structure, and a theming pass invites bikeshedding
mid-churn. Which is why this is ranked last and scoped to tokens + one
gallery: it changes how colours are *named*, not how anything looks today.

---

## Deliberately not proposed, and why

- **Porting `behaviorTree/` as a subsystem** — answered inside P4/P6: a
  domain composite built *from* the primitives; porting it now is the third
  pass before the second is done. Its pure `btcppXml.ts` core needs nothing
  from bbox-ui to stay valuable where it is.
- **Re-adding `judgeConnection` / wiring permissions** — the exploration's
  own whiteboard preset stood every rule down, and Zach's brief for the wire
  work was explicit ("draw as many wires as you want"). D-B2 already names
  the honest future shape if wanted: a validation pass that *reports*
  without blocking. Nothing to add to that record.
- **Porting the lens machinery (`portLens.ts`)** — `BLOCK-PORT-EDGES-PLAN`'s
  exclusion stands: a lens is a host-side selection among prop
  configurations, needed only when two live layouts of one document share a
  canvas. It becomes P3's concern the day the tracer hosts two lenses — a
  host fact, not a component axis.
- **`table/` (~4k lines), Command Palette, Library Panel, drafts/compare/
  history chrome** — SystemSketch app surfaces, host-owned by the
  architecture's own line; none is a presentational component.
- **The 09-17 block feedback items** (corner radius edge-to-edge,
  fill-vs-own gallery, code-in-block variants) — real, wanted, and routine:
  they are gallery iterations inside the existing workflow, not strategy.
  Listing them here would pad the count without adding a decision.
- **Renaming the connection/cable/trace vocabulary in SystemSketch** — noted
  in DP - Trace as a naming seam; it rides along with P2/P3's resync rather
  than standing alone.

## What this review deliberately did not do

- No code, no commits, no merges; both repos read-only throughout.
- No re-litigation of settled house rules (core imports no engine; galleries
  as the review surface; play-function assertions measured, never
  DOM-presence).
- No estimate of the full SystemSketch migration — P3's tracer exists
  precisely to make that estimate honest before anyone writes it down.
