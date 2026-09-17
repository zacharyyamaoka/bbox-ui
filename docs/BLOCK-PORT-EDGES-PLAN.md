# Block × PortEdge × wires plan (2026-09-17)

Source of truth for integrating `PortEdge` into `Block` and wiring ports with
`Trace` in `apps/storybook-basics`. Mirrors the AI comment in the vault note
`bbox ui Components.md` (marker `ai-comment:block-port-edges-plan-2026-09-17`).
Zach's brief: attach port edges to blocks ("the port edge is literally just a
line. Its Z level should be above the block"), the classic left/right DAG plus
wires into children, view→placement rules per simple/port/expanded, no wiring
permissions ("draw as many wires as you want… even multiple wires between the
same two ports"), the async-region communication gallery on all four edges,
arrowheads on traces, and re-proof that the multi-line lane still works once
the edge sits on a block. "Refer to system sketch, as all of this logic is
already correctly implemented there. The big change is that we are now doing
it in a modular way."

**The governing principle (Zach, 2026-09-17, verbatim):** "all of this
functionality in system sketch, instead of having to [have] ad hoc solutions,
we can now just implement them using the basic functions we have on the port
edge component of grouping/spacing/etc. System sketch is a great reference for
the **target spec**, but we need to **refactor to use our component based
approach**." So every donor file below is held to one test: a
layout/composition problem `portEdge.tsx` already solves is **stated as the
behaviour, then expressed as PortEdge props** — never ported; a pure algorithm
with no component equivalent (the trace lane's elbow/tidy/LCS class) ports
verbatim with attribution. This plan ports **zero** donor layout code; §3 and
§7 are prop mappings, and §4b names the few places PortEdge genuinely falls
short, each sized.

**The structural fact this plan is built around:** a `Trace` component is
being built right now in the sibling worktree
`/home/bam/bbox-ui/.claude/worktrees/trace-component` (branch
`claude/trace-component`, from `docs/TRACE-PLAN.md`; its tip is still `36b3ce5`
— the same base as this lane — so everything there is uncommitted and in
flight). Every phase below is labelled **Group A** (buildable now, zero Trace
imports) or **Group B** (dispatchable the moment `claude/trace-component`
merges, specified here so it needs no re-planning). The boundary is a file
boundary, not just a schedule: no Group A file imports `trace*`, `elbow/`, or
`wireLayer`.

**Headline, four findings:**

1. **The view→placement rules are code, not prose, and they live in one donor
   file.** Simple view = every port coincident at the edge midpoint
   (`layoutBlock.ts:1282,1301-1330` — one visual dot, all identities retained
   as anchors); port view = rows packed from the body top at
   `pitch = min(44, available/slotCount)` (`:1434-1435`), with
   `inline` sharing slot 0 on both lanes and `offset` starting outputs at slot
   `inputs.length` (`planBodySlots`, `:461,472-475`); expanded = evenly spread,
   centres at `(i+1)/(n+1)` of the section (`placeExpandedBody`, `:592`). All
   four of Zach's sentences match the donor exactly; nothing needs inventing,
   only restating as `PortEdge` props (§3).
2. **Arrowheads are NOT net-new — the in-flight Trace already ships them, on
   by default.** `trace.tsx:110,210` (trace worktree) has
   `markerEnd?: TraceMarkerEnd = "arrow"` with the chevron `TraceMarkerDef`
   (`:169-193`, `orient="auto"`, `context-stroke`), and `trace.layout.ts:91-92`
   declares `TRACE_MARKER_ENDS = ["arrow","none"]`. What Group B adds is the
   *direction semantics* (which end is `to`, per communication family — the
   donor states it verbatim: "for Service it names the client, for Action the
   component that sends the goal", `communicationAuthoring.ts:40-45`) plus
   acceptance that the marker survives every routing × variant. No new marker
   code unless acceptance finds a gap (§8).
3. **Zach's z-rule reverses the donor's, deliberately.** SystemSketch pins
   cables *under* Blocks (`keepConnectionsAtBottom.ts:1-9`: "Cables paint
   under Blocks, per parent"). Zach's brief says the port edge's "Z level
   should be above the block", and wires attach to dots that sit above the
   block — so in these stories rails and the wire layer both paint above
   (D-B1). Recorded so nobody "fixes" it back to the donor.
4. **The async-region gallery is a port of a specified feature, not invented
   fixtures.** Families, legs, directions, colours, and per-card S/P/E are all
   donor code: `CommunicationFamily = 'topic'|'stream'|'service'|'action'`
   (`channelParser.ts:14`), drawable families `['stream','service','action']`
   with `topic` deliberately absent (`communicationAuthoring.ts:26-32` — it is
   what an un-annotated data edge already projects as), the leg table
   (`COMMUNICATION_PROTOCOL_LEGS`, `:64-76`: stream→one forward leg;
   service→request forward + response back; action→goal forward + feedback and
   result back, cancel deliberately not emitted), the toolbar's own hints
   ("Pub/sub: publisher → subscriber", "Client → server; request and
   response", `CommunicationPrototypeControls.tsx:70-74`), the per-family
   paint (`communicationProjection.ts:99-108`), and the S|P|E per-card control
   (`:51-55`). But those donor files are the **behaviour spec, not the
   implementation**: the placement they compute ad hoc ("legs of one
   interaction belong together, in the order the protocol runs, on the side
   that faces the component they talk to",
   `portPlacementInference.ts:11-15`) is exactly PortEdge's `groups` +
   `groupMode:"grouped"` + a distribution — §7's table gives the per-family
   prop configuration. What is authored fresh is only **fixture data**
   (plain `{blocks, wires}` literals whose port names follow the donor's
   `name.phase` grammar — `move.goal`, `health.request` — so the vocabulary
   round-trips); no placement logic crosses.

### Where it actually stands — measured in the trees, not from memory

| Piece | State | Where |
|---|---|---|
| PortEdge | **Shipped, committed (`16b1243`/`36b3ce5`).** Controlled `items`, `distribution` (`distribute` 3 schemes / `aligned` anchor+gap+edgePadding), `mode` auto/custom, `groups`+`groupMode`, `showPorts`/`showCard`, `showContainer`/`showCenterLine`, `size`, `renderItem`, `textLayout`, `editing` lane, `PortEdgeDndProvider`. All four `BlockSide`s already work — `AXIS_FOR_EDGE` maps top/bottom→row, left/right→column (`portEdge.tsx:97-102`); `AroundABox` proves 4-at-once (`PortEdge.stories.tsx:631`). | `apps/storybook-basics/src/components/portEdge.tsx`, `portEdge.layout.ts` |
| Block | **Shipped.** `header`/`body`/`footer`/`members`, optional `height` (absent = hug; `Block.stories.tsx` CollapsibleHeader asserts the height *shrinks* on fold — do not break), root is `overflow-hidden rounded-lg` (`block.tsx:100-103`) — which **clips anything drawn at its border**, the fact §2's attachment design exists to route around. | `block.tsx:45-146`, `blockMembers.tsx` |
| Port `wired` state | **Shipped.** `PortState = "empty"\|"valueSet"\|"wired"\|"received"` (`port.tsx:35`), painted via `STATE_TOKENS` (`:52-57`), exposed as `data-state` (`:187`); `hinting` previews becoming-wired (`:95-97`). Nothing *drives* it from a connection yet — that derivation is §5, net-new ~30 lines. | `port.tsx` |
| Multi-line lane | **Shipped inside PortEdge.** `laneAvailability` (column + auto + no collapsed real family, `portEdge.tsx:568-579`), measured pitch (`useLaneGeometry`, `:622-652`), lane always opens to the right (`:671-683`), D13 close-on-card-pointerdown (`:862-870`). Re-proving it *on a block* is Phase A2 — the component is untouched. | `portEdge.tsx:543-728`, `portLane.ts` |
| Trace + terminals + routing + badge | **In flight, uncommitted**, in the trace worktree: `trace.tsx`, `trace.layout.ts` (with the frozen `TraceTerminalSpec {x,y,dir}` / `TraceDir` / `OPPOSITE_DIR` / `traceSideOf` contract, `:118-152`), `traceTerminal.tsx`, `Trace.stories.tsx`. Group B binds to `docs/TRACE-PLAN.md`'s contract, not to file internals. | `../trace-component/apps/storybook-basics/src/components/` |
| Attachment (rails on a Block) | **Does not exist; net-new, ~200 lines + ~120 layout.** Nothing in this repo positions a PortEdge on a Block edge. | §2 |
| Wire layer / connection record | **Does not exist; net-new, ~150 + ~90 lines.** No connection model anywhere in bbox-ui. | §5 |
| View→placement mapping | **Exists only in the donor** (`layoutBlock.ts`, entangled with `BlockShapeProps`/lens memoization/tldraw text measurement). The port is a *restatement as PortEdge props* — ~60 pure lines, unit-testable. | §3 |
| Wiring rules / permissions | **Deliberately not ported.** The donor's `judgeConnection` refusal set (`connectionRules.ts:40-51`: cycle, duplicate, fan-in/out, type-mismatch…) is exactly what "no wiring permissions" turns off — and the donor itself already ships that posture as the whiteboard policy ("Every rule stood down", `:31-32`). Zero lines. | §5 |
| Donor gesture vocabulary | "a plain drag on a dot already means 'draw a cable from here' everywhere in this app" (`communicationPortDrag.ts:4-6`); hint/eligible port state (`portState.ts:38-50`). Informs the one optional interactive story (D-B5). | — |

### 1 · The A/B split — what blocks on Trace and what does not

| | Group A — build now | Group B — dispatch on Trace merge |
|---|---|---|
| Files | `blockPortEdges.layout.ts`, `blockPortEdges.tsx`, `BlockPorts.stories.tsx`, `BlockPortLane.stories.tsx` | `wiring.ts`, `wireLayer.tsx`, `BlockWiring.stories.tsx`, `AsyncRegion.stories.tsx`, `TraceArrowhead.stories.tsx` |
| Contents | rail attachment, view→layout rules, 4-edge placement, z-order of rails, collapse-in-simple, lane-on-a-block re-proof | everything with an actual wire: wired-state derivation, inside/outside wiring, mixed-view canvas, the async communication gallery, arrowhead acceptance |
| Trace imports | **zero** (enforced: no `trace*`/`elbow/` import in any A file) | `Trace`, `TraceTerminalSpec`, `TraceDir`, `OPPOSITE_DIR`, routing; `markerEnd` |
| Wired-*looking* ports in A | allowed as static fixture data (`state: "wired"` is a Port prop) — placement galleries may show them, but nothing derives them | derived from the wire list (§5), which is the actual ask |

What each Group B phase needs from Trace, precisely: **B1/B2** need TRACE-PLAN
P1 (paint + `TraceTerminalSpec`) + P2 (curved) + P6 (the `Trace` wrapper
taking `from`/`to` + `routing`); elbow fixtures additionally use P3. **B3**
needs P1's `markerEnd` and all routings present. TRACE-PLAN lands as one
branch, so operationally all of B unblocks at once; the enumeration exists so
a partial landing can still dispatch B1.

### 2 · Attachment — whose geometry is it (question 1)

**A wrapper component, not new Block props, not per-story hand-positioning.**
Net-new `src/components/blockPortEdges.tsx` exporting `PortedBlock` (~200
lines) + `src/components/blockPortEdges.layout.ts` (~120 pure lines).

Why not Block props: `Block`'s root *is* the `overflow-hidden rounded-lg` card
(`block.tsx:100-103`). A rail drawn inside it is clipped at the border — the
dots straddle the edge line, so half of every dot (and the whole 40px halo,
and the lane overlay) would vanish. Growing Block a wrapper div would change
its DOM contract under every existing story (`[data-slot="block"]` box
assertions, the CollapsibleHeader height check). Block stays a **stock seam**;
the wrapper owns the overlay geometry. Reversible: if a future host wants
`<Block ports>`, the wrapper's body folds in behind a prop.

```tsx
// blockPortEdges.tsx — the frozen surface
export interface BlockEdgeSpec {
  items: PortEdgeItem[];
  onItemsChange?(items: PortEdgeItem[]): void;
  editing?: boolean;                      // the multi-line lane, per edge
  onEditingChange?(next: boolean): void;
  /** Reach-past overrides forwarded to the underlying PortEdge (textLayout,
   *  showCard, renderItem, laneLanguage…). The wrapper's own derivation
   *  (distribution, size, collapse) always wins over these. */
  portEdgeProps?: Partial<PortEdgeProps>;
}

export type BlockView = "simple" | "port" | "expanded";   // donor BLOCK_PRESENTATION_VIEWS, blockModel.ts:96
export type BlockPortLayout = "inline" | "offset";        // donor PORT_LAYOUTS, blockModel.ts:106

export interface PortedBlockProps {
  /** The Block itself — composed, never re-rendered from props. The story
   *  builds each view's face (a simple card, a header+body, an expanded
   *  members frame); the wrapper only places ports. */
  children: ReactNode;
  view: BlockView;
  /** Port view only. inline = both lanes start at the body top; offset =
   *  the right lane starts below the last left port. */
  portLayout?: BlockPortLayout;           // default "inline", donor blockModel.ts:622
  edges: Partial<Record<BlockSide, BlockEdgeSpec>>;
  /** Default `view === "simple"`. The async gallery passes false: the donor's
   *  communication lens spreads ports along the walls even on a Simple card
   *  (layoutBlock.ts:1286-1296) instead of collapsing them. */
  collapsePorts?: boolean;
  /** Painted diameter for collapsed stand-in dots and rail dots. */
  diameter?: PortSize;
}
```

Mechanics, stated so no lane re-derives them:

- The wrapper renders `position: relative; width: max-content` around
  `children`, then one absolutely-positioned **rail** per populated edge — a
  rail in *every* view, including simple: the collapse is a PortEdge
  configuration (§3), not a different component, so wiring anchors, lane
  gating and `data-port-id` stamping stay uniform. Rails render **after**
  `children` in the DOM — that alone is "Z
  level above the block"; no z-index war (D-A6 adds `zIndex: 1` on the rail
  wrapper only so the lane overlay stacks above block content).
- A rail is a stock `<PortEdge>` with `showContainer={false}`,
  `showCenterLine={false}` (the Block's own border **is** the line —
  `portEdge.tsx:151-155` documents exactly this intent), `size` set by the
  wrapper, positioned so the track's cross-axis centre sits on the border
  line: for the left edge, `left: -RAIL_CROSS_PX / 2` where
  `RAIL_CROSS_PX = EMPTY_SLOT_MIN_PX + 2*(CONTAINER_PADDING + CONTAINER_BORDER)`
  (= 24 + 2·16 = 56 today; a derived constant in the layout file, never a
  literal). The track's `alignItems: center` already centres every dot on that
  line (`portEdge.tsx:839`).
- **Rail length and origin are measured, not computed** — the D8 precedent
  (`PORT-EDGE-PLAN-PHASE4.md` §8): the app may measure itself; the core may
  not. A `useLayoutEffect` + `ResizeObserver` reads `[data-slot="block"]`,
  `[data-slot="block-header"]`, `[data-slot="block-body"]` /
  `[data-slot="block-members"]` rects from `children`'s subtree and derives
  the **body band** (below header, above footer). Port and expanded rails span
  the body band; simple's rail spans the full block height so its one
  collapsed slot centres at `height/2` (donor: `midpoint = height / 2`,
  `layoutBlock.ts:1282`). Top/bottom rails
  span the block width inset by `RAIL_END_MARGIN_PX = 18` per side (donor
  `layoutBlock.ts:115`, and the constant-margin behaviour its own test pins:
  `portLensPlacement.test.ts:169-171, 189-198`).
- The wrapper mounts **no DndContext**. Each rail is a standalone `PortEdge`
  (own context, reorder-within-edge works); a story that wants cross-edge
  drag wraps the whole `PortedBlock` in `PortEdgeDndProvider` and owns
  `onDragEnd`, exactly D6's "the 4-around-a-box arrangement belongs to the
  story" (`PORT-EDGE-PLAN.md:324-326`) — unchanged by this plan.

### 3 · The view→layout rules (question 2) — expressed as existing PortEdge props

**Expressibility, checked prop by prop before anything new is proposed:**
every rule below lands on the shipped `Distribution` vocabulary
(`portEdge.layout.ts:43-64`) plus `groupMode` — three of the four views need
*zero* component change, and simple view needs one ~10-line seam (§4b·S1),
not a layout engine. The pure half (`blockPortEdges.layout.ts`) is one
function, `railPlanFor(view, portLayout, edge, counts) → PortEdgeProps
subset`, which a unit test holds against this table.

| view | donor behaviour — the target spec (cited) | the PortEdge configuration that realises it | acceptance (browser-measured) |
|---|---|---|---|
| `simple` | all visible inputs pushed at `(0, height/2)`, outputs at `(width, height/2)` — coincident, "retain identity… BlockCanvas de-duplicates the painted affordance by point" (`layoutBlock.ts:1282,1301-1330`) | `groupMode:"collapsed"` + a `groups` line naming every id → **one slot for the whole edge** (`computeSlots`, `portEdge.layout.ts:195-212`); `distribution:{mode:"distribute", scheme:"space-evenly"}` centres that lone slot — `space-between` would pin it to the top (`mainAxisPositions:91-93`: count 1 → `[0]` vs `[free/2]`), which is WHY evenly. The slot renders a **bare `Port`** (no "+N more" chip) via the one new seam `renderCollapsed` (§4b·S1), carrying `data-collapsed-ports="id1,…"`; state = `"wired"` if **any** member is wired (D-A2) | exactly one `[data-slot="port-dot"]` per populated edge; its centre within 1px of `(blockRect.left, blockRect.top + blockRect.height/2)`; `data-collapsed-ports` lists every item id; no `+N more` text |
| `port` + `inline` | input row *i* and output row *i* share a slot (`outputStart = slot` when inline, `planBodySlots`, `layoutBlock.ts:461`); rows pack from the body top at `pitch = min(44, available/slotCount)`, centre of slot *k* at `bodyTop + pitch·k + pitch/2` (`:1434-1435`) | both rails `{mode:"aligned", anchor:"start", gap: RAIL_GAP, edgePadding: 0}` | first left dot centre == first right dot centre (±1px); both within 1px of `bodyTop + slotMainPx/2 + CONTAINER_PADDING` |
| `port` + `offset` | outputs start at slot `inputs.length` (`:461`), i.e. the first right port sits one full pitch below the last left port | left rail as above; right rail `edgePadding: leftCount * (slotMainPx + gap)` — **exact**, a new helper `offsetEdgePaddingPx(leftCount, slotMainPx, gap)`; the existing `offsetPaddingFor` (`portEdge.layout.ts:147-149`) is a self-described approximation ("ignores card size") with zero call sites, left untouched (D-A3) | first right dot centre − last left dot centre == `slotMainPx + gap` (±1px), the same pitch as within-lane |
| `expanded` | evenly across the section: centre of port *i* at `groupTop + groupHeight·(i+1)/(n+1)` (`placeExpandedBody`, `layoutBlock.ts:592`) | both rails `{mode:"distribute", scheme:"space-evenly"}`, rail spanning the body band | consecutive dot-centre deltas equal (±1px); top margin == bottom margin (±1px) |
| spread-on-simple (async / communication) | Simple + communication lens spreads along the walls with a constant 18px end margin, evenly between (`layoutBlock.ts:1286-1296`, `placeHorizontalRails`; pinned by `portLensPlacement.test.ts:153-171`) | `collapsePorts={false}` → rails on all populated edges, `{mode:"distribute", scheme:"space-between"}`, rail inset by `RAIL_END_MARGIN_PX` per end | first/last dot centres sit `RAIL_END_MARGIN_PX + slotMainPx/2` (±2px) from the block corners; equal gaps between |

Where donor and prose disagree — twice, both resolved for the donor's
formula and said out loud:

- **"aligned with the edge"** (Zach) vs the donor's top-packed rows: the same
  thing — `anchor: "start"` IS the donor's `bodyTop + pitch·k` packing. No
  conflict, recorded to close the question.
- **Expanded's exact centres.** The donor places point centres at
  `(i+1)/(n+1)`; flexbox `space-evenly` spaces *boxes*, so with a
  `slotMainPx`-tall box the wall-to-first-centre distance is `gap + slot/2`,
  i.e. up to `slot/2` (12px today) tighter at the walls than the donor's
  point formula. **`space-evenly` wins** (D-A4): it is the stock browser
  part, count-stable, and the visible property Zach named — even spacing —
  holds exactly. Acceptance therefore measures *uniform centre pitch +
  symmetric end margins*, never the donor's fraction.

### 4 · Four edges (question 3)

Nothing new is needed in `PortEdge` — orientation is already per-edge
(`AXIS_FOR_EDGE`, `portEdge.tsx:97-102`), labels auto-flow inward
(`inwardTextLayout`, `port.layout.ts:126-137`), and the four-edge board is a
proven story pattern (`AroundABox`, `PortEdge.stories.tsx:631`). What
`PortedBlock` adds is only *placement*: top/bottom rails positioned at
`top: -RAIL_CROSS_PX/2` / `bottom: -RAIL_CROSS_PX/2` with the same
centre-on-border rule, and corner collision avoided by the end insets
(§3's `RAIL_END_MARGIN_PX` keeps top/bottom rails clear of the left/right
rails' dots by construction — asserted, not assumed, in `FourEdges`'
acceptance: no two dots from different rails within one diameter).

### 4b · Where PortEdge genuinely falls short of the target spec — sized

The honest remainder after §3/§7's mapping. Everything not listed here is
already expressible.

- **S1 · A collapsed slot cannot render a bare dot.** `SlotBody`'s collapsed
  branch deliberately refuses `renderItem` ("the collapsed summary is a fixed
  idiom of this component's own", `portEdge.tsx:454-456`) and always renders
  the `+N more` LabeledPort. Right for a rail's grouped families; wrong for
  view-collapse, where the donor's simple face draws a label-less dot
  (`label: null`, `layoutBlock.ts:1305`). **Smallest addition:
  `renderCollapsed?(members: PortEdgeItem[]): ReactNode` on `PortEdgeProps`,
  consulted only in that branch, falling back to the existing idiom — ~10
  lines in `portEdge.tsx`, A1-owned, the plan's only edit to a landed
  component (D-A7).** Rejected alternative: the wrapper painting its own
  `Port` outside any rail — it forks wiring anchors, lane gating and
  `data-port-id` stamping into a second code path, the exact ad-hoc-solution
  shape this refactor exists to retire.
- **S2 · Group colour is positional, not assignable.** `buildColorMap` hands
  out `PALETTE` colours in first-appearance order
  (`portEdge.layout.ts:245-272`); a Service family cannot be told to wear the
  donor's service blue. **Accepted, zero lines** (D-B7): family ink lives on
  the *wires* (`Trace`'s `color`), where the donor's own summary/split cables
  carry it; group outlines keep PALETTE. If per-group ink is ever wanted:
  `groupColors?: Record<string, string>` merged over the map, ~8 lines.
- **S3 · Nothing positions a rail on a Block.** Not a shortfall to patch
  *inside* PortEdge — its whole design is "no opinion about what it sits on"
  — but the capability is genuinely absent from the repo: `PortedBlock` (§2)
  is the net-new home, ~200 + ~120 lines.
- **S4 · `offset` needs an exact edgePadding.** `AlignConfig.edgePadding`
  expresses it; only the *formula* is missing (`offsetPaddingFor` is a
  self-described approximation, `portEdge.layout.ts:144-149`). A ~5-line
  helper in `blockPortEdges.layout.ts` (D-A3); no component change.

### 5 · Wires — the record, the layer, wired state, inside vs outside (questions 4–5)

**The connection record — minimal by decree (Group B, `wiring.ts`, ~90 lines
with the derivation helpers):**

```ts
export interface WireEnd { blockId: string; portId: string }
export interface Wire {
  id: string;
  from: WireEnd;              // the initiating end — the arrowhead points AT `to`
  to: WireEnd;
  variant?: TraceVariant;     // default "data"; the async gallery passes "async"
  routing?: TraceRouting;     // default "curved" for DAG stories; async gallery arg
  markerEnd?: TraceMarkerEnd; // default = Trace's own default ("arrow")
  color?: string;
}
```

- **No permissions, structurally:** wires are a plain array. Duplicates,
  fan-in, fan-out, cycles, self-wires — all representable because nothing
  validates. The donor's refusal machinery (`ConnectionRefusal`,
  `connectionRules.ts:40-51`) is deliberately not ported; its own whiteboard
  preset ("Every rule stood down", `:31-32`) is the precedent that this is a
  supported posture, not a shortcut.
- **Wired state is derived, never stored** (~15 of the 90 lines):
  `wiredPortKeys(wires) → Set<`${blockId}/${portId}`>`, and the story maps
  `items` through `withWiredState(items, blockId, set)` before handing them to
  `PortedBlock`. A port is `wired` iff at least one wire names it — including
  N>1 duplicates (idempotent set). Fixture-authored states (`valueSet`,
  `received`) survive when unwired; `wired` wins when wired (the donor's
  cables also override the row paint). Collapsed simple-view dots read wired
  through the same set via `data-collapsed-ports` (any-member OR, D-A2).
- **`WireLayer` (Group B, `wireLayer.tsx`, ~150 lines) — the frozen contract**
  so B2 codes against it before B1 lands:

```tsx
export interface WireLayerProps {
  wires: Wire[];
  /** The fixture element whose coordinate space the layer fills; the layer
   *  is an absolutely-positioned SVG inset 0 inside it, rendered LAST. */
  containerRef: RefObject<HTMLElement | null>;
  /** Re-measure signal — bump when items/views change. */
  layoutKey?: unknown;
}
```

  It resolves each `WireEnd` to a dot: querySelector for
  `[data-port-id="${portId}"]` inside `[data-block-id="${blockId}"]`, falling
  back to a collapsed dot whose `data-collapsed-ports` contains the id
  (which is how the same wire list re-anchors to the midpoint dot when a
  block flips to simple view — no wire data changes, only measurement).
  `PortedBlock` stamps `data-block-id`; the rail stamps `data-port-id` per
  item via `renderItem`-independent DOM data on the slot box (one attribute
  added in `PortedBlock`'s default `renderItem`, not a PortEdge change).
  Terminal specs derive with **no polarity prop**, per TRACE-PLAN's 8-vs-4
  resolution: `from` terminal `dir = faceNormal(edge)`, `to` terminal
  `dir = OPPOSITE_DIR[faceNormal(edge)]` (a wire arrives travelling *into*
  the block). Dot centres come from `getBoundingClientRect` relative to the
  container — app-level measurement, the same D8 legality the lane already
  uses. Unresolvable ends (e.g. a wire into a child whose block is not
  expanded) **skip that wire** and stamp the layer with
  `data-unresolved-wires="id,…"` — honest absence, matching the donor's rule
  that only expanded blocks can show children
  (`canBlockContainChildren`, `blockModel.ts:1131-1133`).
- **Duplicates fan visibly** (D-B3): wires sharing the same unordered
  endpoint pair get a per-duplicate curved bend offset
  (`{dx: 0, dy: (k − (n−1)/2) · DUPLICATE_FAN_PX}` on the curved control),
  ~15 lines in `wiring.ts` — otherwise "two wires between the same two
  ports" renders as one line drawn twice and the gallery shows nothing.
- **Inside vs outside (question 5):** a wire to a member needs nothing new.
  The child is itself a `PortedBlock` rendered as `member.content`; its rails
  live in the child's own wrapper, inside the parent Block's DOM — the parent
  root's `overflow-hidden` (`block.tsx:102`) can clip a flush member's outer
  dot halo, so the wiring fixtures keep child members `inset` (the default,
  12px gutter — `blockMembers.tsx:67-68`) and acceptance asserts the child's
  dots are fully inside the parent's client rect. Coordinate space is solved
  by construction: everything measures relative to the one fixture container.
  Z-order: the SVG layer renders after all blocks → wires above parent AND
  child faces (D-B1). The donor's inner/outer port-face model
  (`portPolarity`, `connectionModel.ts:85-102`) is deliberately not ported —
  with measured dots and no rules, a wire from a parent-edge port to a child
  port is just two endpoints (D-B2 records what we give up: no
  scope-crossing semantics).

### 6 · The lane on a block — risks and re-proof (question 7)

The lane component is untouched; what changes is its *environment*. Named
risks, each with the acceptance that catches it:

| risk | why it could break | catch |
|---|---|---|
| Clipping | the rail overlays the Block; if any ancestor between rail and fixture had `overflow: hidden` the lane panel (which extends rightward past the rail, `portEdge.tsx:683-687`) would clip | lane frame's rect fully inside the viewport and NOT intersect-clipped: `lineCount === items.length` and last `.cm-line` bottom inside the frame (A3's exact form) |
| Stacking | the lane's `zIndex: 5` is scoped to the rail's stacking context; block content rendered later could paint over it | `elementFromPoint` at the lane's first line centre resolves inside `.cm-editor` |
| Pitch source | `useLaneGeometry` measures `[data-slot="port-dot"]` inside the track (`portEdge.tsx:632`) — unchanged DOM, but the wrapper's derived `aligned`/`space-evenly` distributions must still produce uniform pitch | A1/A2 re-run on a block: `dots().length === lines().length`, per-line centre within 1px of its dot centre, uniform deltas — in **both** port view (aligned) and expanded view (space-evenly) |
| Availability | simple view is a collapsed real family (§3), and `laneAvailability` already blocks exactly that, with a reason string (`portEdge.tsx:568-579`) — the wrapper adds nothing; the control must surface it, not silently no-op | story control disabled with non-empty title in simple view; enabled in port/expanded |
| Member drag vs lane | Block members mount their own DndContext (`blockMembers.tsx:296-313`); D13's close-on-pointerdown listens only for `[data-slot="port-edge-card"]` (`portEdge.tsx:865`) | drag a member while the lane is open → lane stays open, text intact; then pointerdown a port card → lane closes (D13 unchanged) |
| Identity through the lane | Enter/Alt+↓ must still mint/move ports whose **wired paint** follows them (states now derived) | A5's form: wired item's dot moves one pitch with `data-state="wired"` intact after Alt+↓ |

### 7 · The async-region gallery — donor spec, realised as PortEdge configurations

What the donor specifies and this gallery honours (all cited in finding 4):

- **Families shown: Stream, Service, Action** — the three drawables
  (`communicationAuthoring.ts:32`), labelled with the donor's own hints
  (stream is literally "Pub/sub" there — Zach's word). `topic`, the fourth
  family in the model, is **deliberately not a gallery row**: the donor
  excludes it from drawing because it is the parser's fallback reading of any
  plain data edge (`:26-31`); the gallery caption states this in one line so
  the omission is legible.
- **Legs per family** (`COMMUNICATION_PROTOCOL_LEGS`, `:64-76`): stream = 1
  forward; service = request forward + response back; action = goal forward,
  feedback back, result back (no cancel — the donor's own WHY, `:56-63`).
  Split-style rows therefore draw 1 / 2 / 3 wires per relationship, each
  between its own port pair, named in the donor grammar
  (`move.goal`, `move.feedback`, `move.result`, `health.request`, …) so
  `channelParser` could read the board back.
- **Arrow direction** = the forward leg's direction: "for Service it names
  the client, for Action the component that sends the goal" (`:40-45`), i.e.
  `from` = client / action-client / publisher, `to` = server — exactly Zach's
  arrowhead sentence, satisfied by endpoint ordering alone (finding 2).
  Summary-style rows draw one wire per relationship riding the initiating
  leg (`CARRIER_PHASE`: stream→stream, service→request, action→goal,
  `portPlacementInference.ts:57-62`).
- **Port placement is a PortEdge configuration, family by family.** The
  donor's rule — legs of one interaction contiguous, in protocol order, on
  the wall facing the counterpart (`PHASE_ORDER`,
  `inferCommunicationPlacements`, `portPlacementInference.ts:40-49,196-236`)
  — was an ad-hoc placement engine there; here it is `groups` +
  `groupMode:"grouped"`, whose B5/B7 guarantee (every member's own dot, at
  the edge's own uniform pitch, one enclosing outline —
  `portEdge.tsx:389-418`, `portEdge.layout.ts:180-212`) is precisely
  "contiguous and ordered". Nothing from `portPlacementInference.ts` is
  ported; it is the oracle the table below was checked against:

  | family | legs (donor spec) | PortEdge configuration on the facing edge |
  |---|---|---|
  | Stream | `camera.stream` — 1 forward leg | one item; **no `groups` line** (a group of one is just an ungrouped port — the parser drops <2-member lines, `portEdge.layout.ts:316-321`) |
  | Service | `health.request` fwd, `health.response` back | items in that order; `groups: "health.request, health.response"`; `groupMode:"grouped"` |
  | Action | `move.goal` fwd, `move.feedback` back, `move.result` back — protocol order goal→feedback→result (`PHASE_ORDER:40-49`) | items in that order; `groups: "move.goal, move.feedback, move.result"`; `groupMode:"grouped"` |
  | Topic | not drawable (donor exclusion) | no row |

  A wall hosting two interactions is two `groups` lines; the edge-level
  distribution stays §3's spread-on-simple (`space-between` + end insets),
  and the group-pitch invariant (`interSlotGapPx`'s port-count math,
  `portEdge.tsx:789-807`) keeps intra-family pitch equal to the wall's own —
  the property the donor got from bespoke lane math.
- **Presentation**: blocks in **simple view with `collapsePorts={false}`**
  (§3's spread-on-simple row — the donor's bare communication face), ports on
  all four edges, wires `variant:"async"` (the async region's whole meaning
  in the donor is "new wires default to async",
  `asyncRegionModel.ts:96-123`), per-family `color` from
  `COMMUNICATION_FAMILY_PAINT.ink` (topic `#118b6d`, stream `#7558d7`,
  service `#3971dd`, action `#d27a0a`, `communicationProjection.ts:99-108`),
  routing as a story arg over the donor's own three (`Elbow | Curve |
  Straight`, `CommunicationPrototypeControls.tsx:64-68`).
- **Authored fresh, by value** (the entangled remainder): the block/wire
  literals themselves — the donor's are tldraw shapes born from arrow
  gestures (`materializeCommunicationLegs` writes `BlockShape`s and
  bindings); no data file exists to copy. The fixture is ~6 blocks
  (perception / planner / controller / dock server / battery / UI) with one
  relationship per family plus one multi-client fan-in, exercising all four
  edges.

### 8 · Arrowheads (question 6) — verification and composition, not construction

The in-flight Trace has `markerEnd = "arrow"` **as the default**
(`trace.tsx:210`), the chevron marker with `context-stroke` colour inheritance
(`:169-193`), and TRACE-PLAN P6's acceptance already pins "the `to`-end marker
present, the `from` end bare". Group B's `TraceArrowhead.stories.tsx`
therefore:

- asserts, per routing (`straight`/`slanted`/`curved`/`elbow`) × variant
  (data/async/animated/red/delayed), that exactly one `<marker>` resolves and
  the head's tip sits within 2px of the `to` terminal with orientation within
  5° of the arrival direction (path-sampled, `getPointAtLength`);
- asserts the **delayed + splitAtLabel** case specifically — two visible
  paths, marker on the terminal segment only (the likeliest gap: `trace.tsx`
  applies `markerEnd={markerAttr}` at `:281` and `:311`; whether both or the
  right one carries it is exactly what acceptance decides);
- fixes any gap found with a surgical edit to `trace.tsx` — legal by then:
  post-merge the file is shared, the trace lane is done, and the edit is
  exact-match with a `WHY:`;
- adds **nothing else**: no `markerStart`, no mid-path arrows, no per-family
  marker shapes. Direction is endpoint ordering (§7); a `markerEnd:"none"`
  wire remains available for undirected looks.

### Stock parts — the refactor itself, element by element

This table IS the refactor: each row names the ad-hoc SystemSketch solution
(the target spec), the PortEdge prop combination or stock part that replaces
it, and the behaviour that must survive the crossing.

| Element | Today — SystemSketch's ad-hoc solution | Replaced by (exact prop combination / part) | Behaviour that must survive |
|---|---|---|---|
| A block wall carrying ports | `layoutBlock` writes per-port `(x, y)` into a 1,674-line layout | `PortEdge` per edge — `showContainer={false}`, `showCenterLine={false}` (the Block border IS the line), wrapper-derived `size` + `distribution` | reorder, grouping, lane, `laneAvailability` reasons — all stock, none re-implemented |
| Port-view rows packed from the body top | `planBodySlots` slot indices × `pitch = min(44, available/slotCount)` (`layoutBlock.ts:1434-1435`) | `distribution: {mode:"aligned", anchor:"start", gap}` (`portEdge.layout.ts:48-57`) | pitch independent of count; Enter appends without moving existing dots |
| `offset` port layout | `outputStart = slot + inputs.length` (`layoutBlock.ts:461`) | the same `AlignConfig` with `edgePadding: leftCount·(slotMainPx+gap)` — exact helper, §4b·S4 | first right port exactly one pitch below the last left port, same pitch as within-lane |
| Expanded even spread | `place(port, …, groupTop + groupHeight·(i+1)/(n+1))` (`layoutBlock.ts:592`) | `distribution: {mode:"distribute", scheme:"space-evenly"}` — CSS `justify-content` (browser) | uniform centre pitch, symmetric ends (D-A4's stated wall deviation) |
| Simple-view collapse | coincident midpoint anchors + paint de-dup in `BlockCanvas` (`layoutBlock.ts:1301-1330`) | `groupMode:"collapsed"` + groups-all + `space-evenly`, bare dot via `renderCollapsed` (§4b·S1) | one dot per edge at `height/2`; all wires anchor to it; any-member-wired paint |
| Communication legs contiguous, in protocol order, on the facing wall | `inferCommunicationPlacements` + `PHASE_ORDER` (`portPlacementInference.ts:40-49,196-236`) | `groups: "move.goal, move.feedback, move.result"` + `groupMode:"grouped"` per family (§7's table); item order = protocol order | intra-family pitch equals the wall's pitch (B5/B7); one enclosing outline per family |
| Constant wall end margins | `RAIL_END_MARGIN_PX` inside `placeHorizontalRails` (`layoutBlock.ts:115,734`) | rail inset by the same constant + `scheme:"space-between"` | 18px at both corners regardless of block height (`portLensPlacement.test.ts:189-198`'s property) |
| Where a rail sits, how long it is | the layout owns the block box outright | net-new `PortedBlock` measuring `data-slot` rects (`ResizeObserver`, app-level — D8 precedent) | rails track the hugged Block live through fold/unfold |
| Wire paint, endpoints, routing | `ConnectionShapeUtil` + bindings + `connectionRouting` | `Trace` + `TraceTerminalSpec`/`TraceDir`/`OPPOSITE_DIR`/`traceSideOf` + routing fns (trace lane, per TRACE-PLAN) | consumed as-is; the 8-vs-4 no-polarity contract |
| Arrowhead | slanted-arrow marker per shape id | `markerEnd`/`TraceMarkerDef` (trace lane, default `"arrow"`) | chevron, `context-stroke` inheritance, `orient="auto"`; tip at the `to` end |
| Wired look driven by cables | binding graph → row paint | net-new `wiredPortKeys`/`withWiredState` (~30 lines) — not a package | derived, never stored; idempotent under duplicate wires |
| Wiring permissions | `judgeConnection` refusal set (`connectionRules.ts:40-51`) | **nothing** — a plain `Wire[]`, the donor's own whiteboard preset as precedent | duplicates/fan/cycles all representable; zero validation code |
| Story assertions | donor unit/acceptance suites | `expect` from `storybook/test`, play functions, `getBoundingClientRect`/`getPointAtLength` | geometry measured; never DOM-presence alone; never `storyRenders[].reportedException` (not a real property — `vitest.config.ts`'s own warning) |
| `Block`, `blockMembers` | — | **unchanged (stock seam)** | height-hug + CollapsibleHeader shrink assertion; `overflow-hidden` root |
| `PortEdge` family (`portEdge.tsx`, `portEdge.layout.ts`, `portLane.ts`, `codeEditor.tsx`) | — | **unchanged (stock seam)** except §4b·S1's one ~10-line `renderCollapsed` seam (D-A7); `offsetPaddingFor` left as-is | Phase 3/4 behaviour not renegotiated; lane contract intact |
| `Port`, `LabeledPort`, `port.layout.ts` | — | **unchanged (stock seam)** | `data-state`, slot placement, hit halo |
| `vitest.config.ts` | — | **unchanged here** — TRACE-PLAN P3 owns the one edit adding the node `unit` project; A1's layout unit tests ride it after merge (until then the same math is asserted in play functions) | no two lanes edit this file |
| trace worktree, `packages/bbox-ui`, `demos/`, `apps/storybook`, all of SystemSketch | — | **unchanged (stock seam)** | donors stay donors |

### Phases — lanes, file ownership, and the DAG

Every file below is **new** and owned by exactly one lane, with exactly two
surgical edits to existing files in the whole plan: A1's D-A7 seam in
`portEdge.tsx` (no other lane touches that file), and B3's contingent
`trace.tsx` fix, which happens only after the trace lane has finished. This
table is the workflow's DAG.

| phase | group | lane | owns (all under `apps/storybook-basics/src/`) | depends on |
|---|---|---|---|---|
| **A1 · PortedBlock** | A | builder | `components/blockPortEdges.layout.ts`, `components/blockPortEdges.tsx`, `stories/BlockPorts.stories.tsx`, `components/blockPortEdges.layout.test.ts` (dormant until the `unit` project exists), + the one D-A7 surgical edit in `components/portEdge.tsx` | nothing |
| **A2 · lane re-proof** | A | builder | `stories/BlockPortLane.stories.tsx` | A1 |
| **B1 · wiring core** | B | builder | `components/wiring.ts`, `components/wireLayer.tsx`, `stories/BlockWiring.stories.tsx` | Trace merge + A1 |
| **B2 · async gallery** | B | builder | `stories/AsyncRegion.stories.tsx` (fixtures + gallery + optional `DrawYourOwn`) | Trace merge + A1; imports B1's `wireLayer` **against the frozen §5 contract** — may start in parallel with B1, typecheck serialises at integration |
| **B3 · arrowheads** | B | builder | `stories/TraceArrowhead.stories.tsx` (+ contingent surgical `trace.tsx` fix) | Trace merge only — independent of A1/B1 |

So: A1 → A2 now; on merge, B1 ∥ B2 ∥ B3 (B2 against the frozen contract).
`pnpm test-stories` (and `typecheck`) is the gate after every phase.

**A1 stories + acceptance** (`Basics/BlockPorts`): `ClassicDag` (port view,
inline — the §3 inline assertions), `OffsetDag` (§3 offset assertion),
`SimpleView` (collapse assertions incl. `data-collapsed-ports`),
`ExpandedView` (spread assertions), `ViewMatrix` (the same items rendered
S/P/E side by side — the per-card S|P|E control the donor's async toolbar has,
`CommunicationPrototypeControls.tsx:51-55`, as a Storybook arg),
`FourEdges` (spread-on-simple on all four edges; no two dots of different
rails within one diameter; every dot centre within 1px of its border line).
Every claim is a measured rect; fixture `wired` states here are static
`state:` props (allowed in A, per §1).

**A2 acceptance** (`Basics/BlockPortLane`): the §6 table, i.e.
PHASE4's A1–A3 re-run against a rail on a block in port view AND expanded
view, the member-drag exclusivity check, the disabled-with-reason check in
simple view, and A5's identity-through-the-lane check.

**B1 acceptance** (`Basics/BlockWiring`): `WiringScenarios` — outside↔outside,
fan-out (1→3), fan-in (3→1), **duplicates between the same two ports** (two
wires, fanned; both `path` midpoints ≥ `DUPLICATE_FAN_PX/2` apart),
self-wire (block's own left→right), wire into a child (parent's inner edge →
member `PortedBlock`'s port; child dots inside parent rect); every wired
dot's `data-state="wired"`, every unwired dot not; unwiring (story control
removes a wire) returns the dot to its fixture state. `ViewsWired` — same
wire list, three views: wires re-anchor to the collapsed dot in simple
(terminal within 1px of the midpoint dot), to rows in port, to spread in
expanded; the child wire renders only in expanded and is listed in
`data-unresolved-wires` otherwise. `MixedViewsCanvas` — Zach's "canvas with
blocks that are mixed in the view they are in": one fixture, three blocks in
three different views, wired across.

**B2 acceptance** (`Basics/AsyncRegion`): `CommunicationPatterns` — the §7
fixture; per family: leg-count correct (1/2/3 in split style), arrowhead at
the server/subscriber end (tip within 2px of `to`, per §8's measurement),
`variant:"async"` dasharray on every wire (`getComputedStyle` matches
`ASYNC_PACKET_DASHARRAY`), family colours resolved from the donor ink table,
routing switchable Elbow/Curve/Straight. `SummaryVsSplit` — the donor's cable
styles (`CommunicationPrototypeControls.tsx:58-62`) as two renders of one
fixture: summary draws exactly one wire per relationship riding the carrier
phase. Optional `DrawYourOwn` (D-B5): press a dot, drag (straight preview
line), release on another dot → wire appended, both dots flip wired,
`hinting` on the hovered dot mid-drag; release on nothing → no wire.

**B3 acceptance**: §8's matrix.

Estimated sizes: net-new components ~560 lines (A1 ~320, B1 ~240), stories
~1,400 across five files, unit tests ~120. No new packages anywhere.

### Decisions — each with the default taken if you say nothing

- **D-A1 · Attachment is a wrapper (`PortedBlock`), children-composed.** Not
  Block props (clipping + DOM-contract churn, §2), not per-story
  hand-positioning (five galleries would each re-derive band math). The
  story owns the Block's face per view; the wrapper owns only port
  placement. Reversible into Block later. **Default: wrapper.**
- **D-A2 · Simple-view collapse is a PortEdge configuration** —
  `groupMode:"collapsed"` + groups-all + `space-evenly` — whose one slot
  renders a bare `Port` (no "+N more" chip: the donor's simple face has no
  label at the midpoint, `label: null`, `layoutBlock.ts:1305`) carrying
  `data-collapsed-ports`. Any-wired beats first-member (the chip's rule,
  `portEdge.tsx:424-433`) because the dot stands for all members as a wire
  anchor. **Default: collapsed rail, bare dot, any-wired.**
- **D-A3 · The offset formula is exact** — `leftCount·(slotMainPx+gap)` in a
  new helper; `offsetPaddingFor`'s `count·gap` approximation (zero call
  sites) is neither used nor deleted. **Default: exact helper.**
- **D-A4 · Expanded uses `space-evenly`**, accepting the ≤`slot/2` wall
  deviation from the donor's point formula; acceptance measures pitch
  uniformity + end symmetry, not the fraction. **Default: space-evenly.**
- **D-A5 · Rails measure the Block's regions** (ResizeObserver over
  `data-slot` rects) rather than taking band geometry as props — Block hugs
  content, so any closed form lies when a header wraps or members fold.
  App-level measurement, D8 precedent. **Default: measure.**
- **D-A6 · Rails render after the Block with `zIndex: 1`** on the rail
  wrapper only — DOM order is the z-rule; the explicit index exists solely so
  the lane overlay's own `zIndex: 5` stacks above block content in every
  browser. **Default: as stated.**
- **D-A7 · One surgical component edit is authorised: `renderCollapsed`**
  (§4b·S1, ~10 lines in `portEdge.tsx`'s collapsed branch, fallback = the
  existing `+N more` idiom so every landed story is byte-identical without
  it). Owned by A1; exact-match edit with a `WHY:`; no other landed component
  changes anywhere in this plan. **Default: add the seam.**
- **D-B1 · The wire layer paints above blocks** — Zach's explicit line,
  reversing `keepConnectionsAtBottom` (finding 3). `pointer-events: none` on
  the SVG (hit paths opt back in via Trace's `interactive`). **Default:
  above.**
- **D-B2 · No rules layer, no port faces.** `connectionRules.ts` and the
  inner/outer `portPolarity` model stay behind; a wire is two measured
  endpoints. Cost, named: no scope semantics, no refusal taxonomy — both
  re-addable as a validation pass that *reports* without blocking.
  **Default: none.**
- **D-B3 · Duplicate wires auto-fan** with a per-duplicate curved bend
  (`DUPLICATE_FAN_PX = 14`), so N wires between one pair are visibly N.
  **Default: fan.**
- **D-B4 · Arrowheads = Trace's existing `markerEnd`, direction by endpoint
  ordering** per `communicationAuthoring.ts:40-45`. No `markerStart`, no new
  marker geometry. **Default: verify + compose.**
- **D-B5 · One interactive `DrawYourOwn` story ships**, scoped to
  press-drag-release with a straight preview line and the existing `hinting`
  prop — the donor's own gesture grammar ("a plain drag on a dot means draw
  a cable", `communicationPortDrag.ts:4-6`). Cut first if B2 runs long; the
  galleries are the deliverable. **Default: include.**
- **D-B6 · Fixture port names follow the donor's `name.phase` grammar** in
  the async gallery (so the vocabulary round-trips to `channelParser`), and
  plain names (`pose`, `gain`) everywhere else. **Default: as stated.**
- **D-B7 · Family ink rides the wires, not the groups** (§4b·S2): `Trace`'s
  `color` takes `COMMUNICATION_FAMILY_PAINT.ink`; group outlines keep
  PortEdge's positional PALETTE. `groupColors` stays a named, unbuilt ~8-line
  option. **Default: ink on wires.**

### What this plan deliberately does not do

- **No component code written yet; nothing merged.** `Block`, `Port`,
  `LabeledPort`, `portLane`, `codeEditor`, `vitest.config.ts`,
  `packages/bbox-ui`, `demos/`, `apps/storybook` (opt-in Storybook, per repo
  CLAUDE.md), the trace worktree, and all of SystemSketch stay untouched;
  `portEdge.tsx` changes only by D-A7's one seam, at implementation time.
- **No donor layout code ported.** `layoutBlock.ts`, `planBodySlots`,
  `placeHorizontalRails`, `portPlacementInference.ts`,
  `inferCommunicationPlacements`, `portLens.ts` — behaviour specs only, per
  the governing principle; each is replaced by the prop mappings in §3/§7.
- **No lens machinery.** The donor's `portLens.ts` atom/scope exists to keep
  two live layouts of one document from leaking into each other on a canvas;
  stories are single-lens fixtures, so `Dataflow | Communication` is just two
  stories, not a projection system.
- **No port-placement persistence, no `Placements`/`Arrangement` model, no
  edge parking** — unchanged from `PORT-EDGE-PLAN.md`; still the first
  hazard to handle when a real canvas host adopts this
  (`PORT-EDGE-PLAN-PHASE4.md` §5's closing note).
- **No tidy pass over the wire galleries.** Tidy belongs to the trace lane
  (TRACE-PLAN P5) over fixture routes; running it over the block galleries is
  a follow-up composition, not part of this integration.
- **No cancel leg, no `topic` gallery row, no per-family marker shapes** —
  each is the donor's own documented exclusion (§7, §8).
- **No new dependencies, no `npm install` lines anywhere.**
