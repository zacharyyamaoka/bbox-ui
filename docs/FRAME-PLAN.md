# FRAME — the body substrate a Block composes, and how everything else delegates to it

*Plan, 2026-09-22, lane `frame-auto-port-edges`. Written beside the prototype it plans for
(`apps/storybook-basics/src/components/frame.tsx`), after the Frame, its four port edges, the
wall-crossing detection, the wall split and the linked-object delete were built and measured
in Storybook. This `.md` is the lane-readable input; the rich-media report is the deliverable
Zach reads. Nothing below has been migrated yet — this is the decided shape of the migration,
with the evidence of what duplicates what today, for a SEPARATE lane.*

---

## 0 · The ruling this plan builds on, in Zach's words

Three sentences from the same morning (Daily Note - Sep 22 2026), in the order he wrote them:

1. *"what the frame gives you is membership, inside and outside memberships, free vs stacked
   layout, edge to edge vs inset, custom vs auto fit... I think we want to associate all of
   that logic with the FRAME, not with a block. start with frame, add 4 port edges to all
   sides"* (:801-808)
2. *"Region is not just a preset, its a new composite component that combines a Frame and a
   Block."* (:429)
3. *"the block is general enough to basically model all of these things. Its just a header,
   body (that can hold children blocks), footer, an expanded view with a frame, port edges,
   etc. its all the exact same components"* (:829) — and, from the same note, BlockRegion WILL
   become a preset of Block.

Read together they fix the shape:

```
Block  =  header  +  BODY  +  footer          (block.tsx keeps header/footer/description)
                     └── BODY IS A FRAME:  membership (free | stack, inset | edge-to-edge),
                                           custom | auto fit, four port edges, the frame surface
Region =  a Block preset configured over that same Frame (corner card as row 0, arms as rows)
```

So `Frame` is not a competitor to `Block` and not a region-only thing. It is the **body
substrate**. Block will depend on Frame; Frame never depends on Block — which is why
`frame.tsx` imports nothing from `block.tsx`/`blockPort.tsx` today (its header says so), and
builds from the same stock parts Block builds from: `BlockMembers` for membership, `PortEdge`
for each wall, `railBoxFor` for placement.

---

## 1 · What the prototype already is (the substrate, measured)

`components/frame.tsx` (529 lines) + `frame.layout.ts` (283) — every behaviour Zach named is a
**prop**, so a preset is a bundle of props and never a fork:

| Behaviour | Prop | Measured by |
|---|---|---|
| title above / as a header bar / none | `titlePlacement: "above" \| "header" \| "none"` | `Frame.stories.tsx` › Every toggle (the header pushes the left rail into the body band by > 20px; the top wall still spans the box) |
| frame drawn or not | `surface: "frame" \| "none"` | same story (border transparent, rails stay) |
| free vs stacked membership, per-member inset/edge-to-edge | `membersLayout`, `BlockMember.inset` (stock `BlockMembers`) | same story (stack: same left, `b.top >= a.bottom`) |
| custom vs auto fit | `fit: "custom" \| "auto"`, `fitPadding` | same story (box grows to the members' union + 12px) |
| a port edge on any subset of walls | `portEdges: BlockSide[]` (default all four) | same story (right wall off → its rail and port gone) |
| auto vs custom spacing, per wall | `walls[side].arrange` (= `PortEdge.mode`), `offsets` | same story + `FrameAutoPortEdges.stories.tsx` › Spacing |
| wall crossings drawn as rings | `crossings` (box-local points; detection is the host's) | `FrameAutoPortEdges.stories.tsx` › Externals wired |

Two invariants the prototype holds by structure, both asked for by the parallel BlockRegion lane
(`reports/blockregion-as-block-preset-2026-09-22.html` §8):

- **The box never clips.** `frame.tsx:488` `overflow: "visible"`, and the rails are SIBLINGS of
  the box (absolutely positioned in the root, `frame.tsx:271-364`), never its children.
  `Frame.stories.tsx` › Ports on every wall presses **15px outside** the left and right walls and
  asserts the port takes the hit (`elementFromPoint`). A frame built on `Block`'s root would have
  lost ~14px of the 40px halo to its 7px clip margin (`block.tsx:351,359`).
- **One owner box.** The root carries `data-block-id` (`frame.tsx:451`); every wall port's two
  faces live under it. `Frame.stories.tsx` asserts exactly one `[data-block-id=<frame>]` and that
  both faces' `closest("[data-block-id]")` is the root — `wireLayer.tsx`'s first-match rule
  (`resolveDot`, :122-134) and `portDotSightings.ts` then resolve every dot.

---

## 2 · Who duplicates what today — the evidence

Every row is a thing `Frame` owns and something else re-implements. File:line are in
`apps/storybook-basics/src/`.

| Concern | Frame (canonical from here on) | Today's copies | What must survive the fold |
|---|---|---|---|
| Rail mount on a wall: absolute box from `railBoxFor`, `zIndex: paintTier("portDot")`, `pointerEvents: "none"` on the rail, cards re-arm | `frame.tsx:271-364` `FrameRail` | `blockPort.tsx:795-996` `BlockPortRail` (same `railBoxFor` call at :810, same tier at :947, same pointer rule at :968) | the collapsed stand-in dot (`renderCollapsed`, :905-935), the function port (:771-789), the side-effect rail (:536-566), the mutation lines (:681-756) — Block-side seams the frame does not draw |
| Box measurement (a ResizeObserver plus a 0.5px same-size guard) | `frame.tsx:204-238` `useFrameBox` | `blockPort.tsx:273-318` `useBlockBands`; `region.tsx:305-332` `useCornerSize`; (the preset lane also counts `blockPortMembers.tsx`'s `useBandGeometry` on the other lineage) | the pre-paint correction (`useLayoutEffect`), the identity check so a re-measure cannot loop |
| Auto fit around measured members | `frame.tsx:240-269` `useFitSize` + `frame.layout.ts` `fitBoxToMembers` | `hosts/blockAutoFit.ts:111` `useAutoFitHeight` + `scene/fitToContent.ts:277,336` `fitBoxToMembers`/`blockExpandedFitHeight` | the re-entrancy latch `blockAutoFit.ts` documents; height-only fit for a Block with a header/footer |
| Membership region (free/stack, gap, gutter, inset background) | `frame.tsx:509-518` mounts `BlockMembers` | `block.tsx:474-485` mounts the same `BlockMembers`; `region.tsx:1114-1122` (body) and `:504-512` (each arm) mount it again | `block.tsx`'s `membersReorderChord`, `showCards`; the region's `gap: 0, gutter: 0, insetBackground: "none"` arm configuration |
| The frame's own paint (1px stroke token, radius token, transparent fill, no clip) | `frame.tsx:471-490` | `region.tsx:1013-1039` `region-frame` (tokens `--bbox-region-*` over the skin tokens); `region.tsx:798-882` `RegionOpaqueFrame` restyles a `Block` to look like the frame | the ten region drawings (`skin/regionVariants.css`) — a token layer over ONE frame element, never a second element |
| Wall-crossing ring markers | `frame.tsx:382-411` `FrameCrossingMarkers` | `region.tsx:681-709` `RegionCrossingMarkers` (same 10px ring, same `inset: -1px` device) | nothing — one marker component |
| Wall-crossing measurement glue | `hosts/frameCrossings.ts` `useWallCrossings` (N containers, rich crossing) | `hosts/regionCrossings.ts` — **already folded**: it is now a one-region wrapper over `useWallCrossings` (this lane; `WallCrossingMirror.stories.tsx` green) | the mirror story's numbers |
| A member drawn inside a container, draggable | `hosts/frameNodeView.tsx` uses `nodeViews.tsx`'s exported `freeMemberOf` | `nodeViews.tsx:443-500` `BlockNodeView` (the same helper, private until this lane) | the veto on buttons inside a member (`pressOwnedInside`) |

**Rough size:** the four measuring hooks (~45 lines each), two rail mounts (~40 each), two
marker components (~30 each) and three `BlockMembers` mounts collapse to one of each — about
250 lines fewer once Block and Region stand on Frame, before the region's arm rows are counted.

---

## 3 · How each one delegates to Frame later

### 3.1 `Block` → `Frame` as its body

`block.tsx` keeps what is genuinely a card's: `header`, `footer`, `description`, the diagnostic
flag/halo/stroke/mask, `showHeaderDivider`. Its members region (`block.tsx:474-485`) becomes a
`<Frame surface="none" titlePlacement="none" …>` mounted where `BlockMembers` is mounted today,
with `membersLayout`/`memberGap`/`memberGutter`/`insetBackground`/`showCards`/`onMembersChange`
passed straight through (they are already `BlockMembers`' own vocabulary, which `Frame` takes
verbatim).

**Which one draws `surface="frame"` — decided: the FRAME does, and Block's `surface` is a pass-
through.** The preset lane proposes `Block surface: card | frame | none` where `frame` does not
clip. The evidence for putting the drawing on Frame rather than on Block-around-a-Frame-body:

- The wall a port sits on must be the OUTER edge of the whole card (the ports of an expanded
  block straddle its border, `blockPort.tsx`'s own D-B1 note), and the rails are the Frame's.
  If Block painted the frame around a Frame body, the body's walls would be INSIDE the header/
  footer band and the rails would sit on the wrong line. `Frame titlePlacement="header"` already
  renders exactly Block's shape — a header bar INSIDE the box, the body band under it, the
  column rails in the body band and the row rails spanning the box — measured in
  `Frame.stories.tsx` › Every toggle and `FrameAutoPortEdges.stories.tsx` › Layer 3.
- `frame.layout.ts:frameBands` produces the very `BlockBands` `railBoxFor` consumes, so a Block
  standing on a Frame places its rails with the identical arithmetic `BlockPort` uses today —
  no second placement rule.
- Block's root clips (`block.tsx:351`) and must keep clipping for its `card` surface (the header
  and footer bars' corners depend on it, :333-337); the frame must not clip (§1). Two elements
  with two clip rules is the §8 bug the preset lane measured (the Blackbox toggle swapping
  elements). One element whose `surface` prop switches paint — never clip — is the fix, and
  that element is the Frame's box.

So, concretely: **`Block surface` forwards to `Frame surface`**, and `FrameSurface` grows a
`"card"` value (fill `--bbox-skin-surface`, the card shadow, the clip Block has today) beside
`"frame"` (stroke only, transparent, no clip) and `"none"`. The header/footer bars become
`Frame`'s `titlePlacement="header"` bar and a new `footer` slot; `block.tsx` shrinks to the
description/diagnostics chrome over `<Frame surface="card">`. Reversible: Block can keep its own
root and mount `<Frame surface="none">` as the body until the `card` surface lands.

### 3.2 `BlockPort` → `Frame`'s walls

`BlockPort` exists because Block's root clips (`blockPort.tsx:13-22`, D-A1). Once Block stands on
a Frame whose rails are siblings of a non-clipping box, `BlockPort`'s wrapper, `useBlockBands`
and `BlockPortRail` are the Frame's — `BlockPortProps.edges` maps one-to-one onto
`FrameProps.walls` (`BlockEdgeSpec.items/onItemsChange/distribution/portEdgeProps` are already
`FrameWall`'s fields; `arrange`/`offsets` are the two the Frame adds). What stays Block-side,
mounted THROUGH the Frame's rail seams rather than re-implemented: the collapsed stand-in
(`renderCollapsed`), the function port, the side-effect rail and the mutation lines — each is a
Block face's own concern, not a wall's.

### 3.3 `blockMembers` — unchanged, the stock seam

`BlockMembers` IS the membership primitive; Frame mounts it, Block mounts it, Region mounts it.
Nothing folds; the fold is that only Frame mounts it once §3.1 lands. Its free-mode drag hook
(`hosts/memberDrag.ts`) is owed to it (that file's own header says so) and becomes Frame's
`onMembersChange` counterpart for free layout.

### 3.4 `Region` → a Block preset over Frame, with the preset lane's row engine

The preset lane's B′/option C: a thin `components/block.region.tsx` composing Block, the body
container and BlockPort, settings exported as `REGION_RECIPE`. With §3.1, "the body container"
IS the Frame, so the region preset is:

```
<Block surface="frame" …>                       // Block → Frame surface="frame", no clip
   Frame membersLayout="stack" gap 0 gutter 0   // the region's rows
     row 0: the corner card (own width)          // BlockMember width:"own", the region's data-block-id
     row i: an arm — header strip + fold + body  // the ROW ENGINE
</Block>
```

**How B′'s row engine sits inside Frame's stacked membership.** Frame's `stack` mode is
`BlockMembers layout="stack"` (`blockMembers.tsx:307-315`, `:360-441`): an ordered column of
members with a uniform gap. The row engine is that column with three additions the preset lane
enumerated — a per-row header strip with a fold chevron, an authored row height (open) / zero
(folded, body leaves the DOM), and band collapse in Port view. Those are `BlockMember` fields
(`header?`, `open?`, `height?`) plus a `BlockMembers` row renderer, NOT Frame props: Frame keeps
saying "stacked", and `BlockMembers` learns what a row can carry. Row positions then come from
`regionLayout` (`region.layout.ts:113-156`, the pure twin the tldraw app also reads), fed to
`BlockMembers` as the rows' authored heights — one source, which is B′'s own requirement. The
corner card is row 0 at its own width (`BlockMember.width: "own"`, already a field).

The two region facts that are NOT Frame's and stay the preset's: the frame element carries
`data-region-id` and never `data-block-id` (the corner card owns the id — `CLAUDE.md`,
"Control flow — a region is ONE node"), so the preset stamps `data-region-id` on the Frame's box
through a prop the Frame gains for it (`ownerId`/`idAttribute`), and the wire keep-outs keep
reading the region slot names (`wireLayer.tsx:209-219`) — the preset keeps `data-slot="region-
frame"`/`region-arm` as ALIASES on the Frame's box and rows, or the keep-out collector learns
`frame-box`. Default: aliases, so nothing that reads the region's DOM today moves.

### 3.5 Wall ports on a BLOCK's wall — the one gap the prototype leaves

Detection runs against expanded blocks too (`hosts/frameScene.ts` `isWallContainer`), but port
INSERTION is frame-only today, because a `BlockPort` rail has no inner-face anchor
(`blockPort.tsx:835-885`'s `renderItem` is private and overwrites the documented reach-past,
`:974-991`). §3.2 closes this for free: once a Block's rails are the Frame's, every block wall
port has two faces. Until then, story c/d (`FrameAutoPortEdges.stories.tsx` › Layer 3, Layer 4)
show "the frame as the block's body" as a Frame with `titlePlacement: "header"` — the target
shape, not today's `Block`.

---

## 4 · Migration order (a separate, decided lane; nothing here is started)

Barriers first, each alone; adds-only lanes after.

1. **`FrameSurface` gains `"card"`; Block mounts `<Frame surface="none">` as its body** (Block's
   root keeps clipping for now). Barrier: `block.tsx` is imported everywhere. Acceptance: every
   Block story byte-identical (`Block.stories.tsx`, `BlockLayouts.stories.tsx`), `PaintOrder.
   stories.tsx` › NestedChildStaysBehindHeader still green.
2. **Block's rails become the Frame's** (`BlockPort` → `Frame.walls`; the four Block-side seams
   mounted through the rail). Barrier: `blockPort.tsx`. Acceptance: `BlockPort.stories.tsx`
   (rail pitch, collapsed dot on the midline, function port, side effects), `WireLayerOwnership.
   stories.tsx`, the React Flow handle sighting, and — new — the block-wall split in
   `FrameAutoPortEdges.stories.tsx`.
3. **Block's `card` surface moves onto the Frame's box**; `block.tsx` keeps description +
   diagnostics only. Acceptance: the halo hit 15px outside a block's wall now passes on a Block
   (it fails today by construction), `Styles.stories.tsx` coverage unchanged.
4. **Row engine in `BlockMembers`** (header strip, fold, authored height, band collapse) fed by
   `regionLayout`. Adds-only until Region adopts it.
5. **`block.region.tsx`** over 1-4, `REGION_RECIPE`, `data-region-id` alias; `region.tsx`
   becomes the thin composite (the preset lane's step 6). Acceptance: the frozen region
   acceptance (`presets/controlFlow.acceptance.ts`), the region views gallery, `WallCrossingMirror`.
6. Delete the folded copies: `useBlockBands`, `useCornerSize`, `RegionCrossingMarkers`,
   `BlockPortRail`, `hosts/blockAutoFit.ts`'s hook body (its latch moves into `useFitSize`).

Step 0, from the preset lane: merge the two region lineages first, or steps 4-6 are done twice.

---

## 5 · Decision-record candidates (flagged, not written)

Per `docs/peps/README.md` a record is written at merge, for a fork a rewrite must not
re-litigate. Three here qualify once the migration merges; none is written yet:

- **The frame surface is the Frame's own drawing; Block's `surface` forwards to it** (§3.1) — the
  alternative (Block paints around a Frame body) was plausible and loses on the clip/halo trap.
- **Linked objects are a deletion constraint, not a group** (`scene/links.ts` header) — the
  tempting alternative is a group node, which selection behaviour would then have to un-learn.
- **A wall port is a real port on the container with two faces (`p`, `p@inner`), not a pseudo-
  block** (`scene/wallPort.ts` header, superseding 52a1b92's `wall:<id>` addressing) — the
  pseudo-block was the earlier design and would silently come back the day someone ports the
  branch.

---

## 6 · What this plan does not decide

- HOW the region preset is represented (props bundle vs `preset=` registry vs thin wrapper vs
  slots vs scene data) — the preset lane's question, deliberately not answered here; §3.4 only
  requires that whichever form it takes can switch Frame's parts on and off, which the prop
  table in §1 shows it can.
- Who owns an arm's promoted dots in Port view (the region, in one box — today's projection —
  or the arm). The preset lane's default (the region) is compatible with §3.4.
- Nested frames' drag handle in React Flow (`reactFlowHost.tsx`'s `DRAG_HANDLE_FOR_TYPE.frame`
  note): the defect-6 class, owed the day a frame holds a frame.
