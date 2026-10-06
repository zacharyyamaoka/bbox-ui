# Schema v2: the persisted-state inventory (B-SCHEMA step 1)

**Written** 2026-10-06 by B-SCHEMA's acceptance author (Claude Opus 5.5), against
`claude/finish-2026-09-29` @ `75991ce`. **Read before** writing any prop. This is the
step `lanes.json` → B-SCHEMA `extra[0]` asks for: every item, every scheduled
cluster id and every scheduled residual of every lane was read
(`lanes.json`, `backlog-verified.json`, `untriaged-clusters.md`, `residuals.json`,
`docs/parity-backlog.json` for the item texts). Then each piece of state was put in
one of three places:

- **§1 Built by B-SCHEMA.** Its storage is settled by a trunk component's own prop
  vocabulary or by a donor field, and a lane in this run reads or writes it.
- **§3 Deferred.** Its storage cannot be settled without Zach, it needs a design
  that does not exist yet, or no lane in this run can consume it. Each entry gives
  the reason, and where it can, the shape it would take.
- **§4 Not document state.** It is runtime, a setting, derived, or file-level. It
  is listed so that nobody mints a shape prop for it.

The contract is executable. `apps/systemsketch/src/document/documentModel.test.ts`
pins every default below with an exact `toEqual`.
`apps/systemsketch/src/document/schemaV2Migration.test.ts` opens a board the app
saved before v2 and requires exactly these props to be added, at exactly these
values. `apps/systemsketch/src/document/schemaV2Pixels.smoke.test.tsx` requires
that board to paint the same pixels it painted at BASE.

**The one rule every default obeys:** it paints today's pixels. Nothing reads any
of these props until a W3 or W4 lane does. The "today because" column says what
today's face does that the default reproduces.

---

## 1. Built by B-SCHEMA: one new migration step per kind

Sequences: `ss-block` 4 → **5**, `ss-port` 2 → **3**, `ss-wire` 2 → **3**,
`ss-code` 0 → **1**, `ss-region` 0 → **1**. Each step fills its kind's new props
with `??=`. A step fills a gap and never resets a value; `schemaV2Migration`'s
`B-SCHEMA-fill` test enforces this.

### 1.1 `ss-block`

| prop | type | default | today because | items | reads / writes |
|---|---|---|---|---|---|
| `view` | `"simple" \| "port" \| "expanded" \| **"value"**` | `"port"` (unchanged) | enum widened; no stored block has `value` yet | P-059, cluster 13 | L-BLOCK-VIEWS (face + `setViewFor`), L-PILL (control) |
| `viewSizes` | `{simple, port, expanded, value}`: `{w, h} \| null` | all `null` | `null` = "no remembered size for this view"; `w`/`h` stay the live box | P-015, P-212, P-152 | L-BLOCK-VIEWS writes on a view switch; L-INSPECTOR "Match Simple/Port/Expanded" reads |
| `sizeMode` | `"fixed" \| "hug"` | `"fixed"` | port/expanded keep the authored box today (BlockFace.tsx:750-762); simple view hugs in both modes, as now | P-141 (P-166 is the Fit **command**, Q-P166) | L-BLOCK-VIEWS; L-INSPECTOR row |
| `cornerRadius` | `number \| null` | `null` | `null` = the skin's radius | cluster 14 P-255 | L-BLOCK-VIEWS |
| `showHeader` | `boolean` | `true` | every block has a header | P-133 | L-BLOCK-VIEWS renders; L-MENU-CONTEXT toggles (`buildBlockMenu`, contextMenuModel.ts:121) |
| `showHeaderDivider` | `boolean` | `true` | trunk `Block` default (block.tsx:359) | P-133 | same |
| `showFooter` | `boolean` | `true` | no block has a footer today, so nothing paints; `true` = "paint the footer once the face has one" (donor default, systemsketch blockModel.ts:619) | P-133, P-146 | same; see §5 Q1 |
| `showFooterDivider` | `boolean` | `true` | trunk default (block.tsx:361) | P-133 | same |
| `showCard` | `boolean` | `false` | trunk default (portEdge.tsx:1614) | P-130 | L-MENU-CONTEXT toggle; forwarded to `BlockPort` in BlockFace's rail region |
| `titleSizePx` | `number \| null` | `null` | `null` = `BLOCK_TITLE_FONT_PX` (BlockFace.tsx:158); a number is px, and the s/m/l/xl ladder only labels numbers | P-177, cluster 15 (P-319, P-415) | L-BLOCK-VIEWS renders (and keeps the editing title in sync, textEditing.smoke); L-PILL control |
| `titleFont` | `"sans" \| "serif" \| "mono" \| "draw" \| null` | `null` | `null` = the inherited family | P-177, cluster 15 (P-404 names them Simple/Bookish/Technical/Scribbled, P-447) | same |
| `portLayout` | `"inline" \| "offset"` | `"inline"` | `BlockPort` default (blockPort.tsx:454) | P-107 | L-PORTS-RAIL; L-INSPECTOR row |
| `functionPort` | `boolean` | `false` | trunk default (blockPort.tsx:459) | P-134 | L-PORTS-RAIL |
| `rails` | `{left, right, top, bottom}`: `{enabled: boolean, mode: "auto" \| "custom", spacing: "space-between" \| "space-evenly" \| "space-around" \| null, freeOffsets: Record<string, number>}` | each `{enabled: true, mode: "auto", spacing: null, freeOffsets: {}}` | every wall is live; `auto` = `PortEdge`'s own default; `spacing: null` = the view's rule (`railPlanFor`) | P-118, cluster 8 (P-356 enable + parking, P-269 spacing) | L-PORTS-RAIL; L-INSPECTOR row ("portMode") |
| `portOptions` | `Record<portId, {fill: "auto" \| "filled" \| "empty", hidden: boolean, frozen: boolean, labelOrigin: SlotOrigin \| null, secondaryOrigin: SlotOrigin \| null}>` | `{}` | an absent entry = the port as painted today | P-119; clusters 7 and 8 for RAIL ports (P-399, P-408, P-358 freeze lock + eye, P-433 counts `hidden`) | L-PORTS-RAIL renders; L-INSPECTOR rows |
| `membersLayout` | `"free" \| "stack"` | `"free"` | members are free tldraw children today; trunk `Block` default | P-188, P-161, P-079 | L-MEMBERS |
| `memberInset` | `"inset" \| "edge-to-edge"` | `"inset"` | trunk `BlockMember.inset` default (blockMembers.tsx:85) | P-188, P-161 | L-MEMBERS |
| `memberWidth` | `"fill" \| "own"` | `"fill"` | trunk default (blockMembers.tsx:87, :201) | P-188, P-161 | L-MEMBERS |
| `memberGap` | `number` | `12` | `BLOCK_MEMBER_GAP_PX`; only a stack reads it | P-188, P-063 | L-MEMBERS; L-INSPECTOR row |
| `memberGutter` | `number` | `12` | `BLOCK_MEMBER_INSET_PX` | P-188, P-063 | same |
| `insetBackground` | `"none" \| "soft-gray"` | `"none"` | trunk default (block.tsx `insetBackground = "none"`) | P-188 | L-MEMBERS |
| `expandedWeights` | `Record<string, number>` | `{}` | even spacing | P-188, P-226 | L-MEMBERS (divider drag persists) |
| `blockType` | `string` | `""` | no kind label today | P-188, cluster 14 P-246 ("no type") | L-INSPECTOR row |
| `definitionId` | `string` | `""` | no identity until linking mints one (trunk `linking.ts`: `if (!node.definitionId) return [node]`) | P-074, P-109, P-210, P-211 | L-LINKING |
| `draftOrdinal` | `number \| null` | `null` | canonical, not a draft | P-109 | L-LINKING |

`SlotOrigin` is the trunk's `"top" | "bottom" | "left" | "right"`
(`components/port.layout.ts:250`). P-119 also lists "Left offset" and "Right offset".
The trunk has no such origins, so they are not stored (§3).

### 1.2 `ss-port` (the free-standing port)

| prop | type | default | today because | items | reads / writes |
|---|---|---|---|---|---|
| `fill` | `"auto" \| "filled" \| "empty"` | `"auto"` | derived from the bindings, as `PortFace` does today | cluster 7 P-399 | L-PORTS-SHAPE |
| `hidden` | `boolean` | `false` | trunk `Port.hidden` ("Completely remove it, we don't want it to be selectable either", port.tsx:415-419) | cluster 7 P-408 | L-PORTS-SHAPE |
| `labelOrigin` | `SlotOrigin \| null` | `null` | `null` = the direction's own text layout (PortFace `TEXT_LAYOUT_FOR`) | P-119 | L-PORTS-SHAPE |
| `secondaryOrigin` | `SlotOrigin \| null` | `null` | same | P-119 | L-PORTS-SHAPE |
| `slots` | `{label: SlotMember[], secondary: SlotMember[]}`; `SlotMember = {kind: "builtin" \| "shape", id: string}` | `{label: [{kind: "builtin", id: "label"}], secondary: [{kind: "builtin", id: "producers"}]}` | the label slot paints the declaration as today (`RestingLabel`). The secondary slot's default member is the producers badge, which P-250 adds and which paints nothing below 2 producers. Nothing paints it today. | P-201, P-208, cluster 7 P-250 | L-MEMBERS (`PortFace` slot members; "a default slot member deleted stays deleted after reload"); L-PORTS-SHAPE (producers) |

The `builtin` ids in this run are `"label"` and `"producers"`. A `shape` member names
a child shape, and "three input boxes" are three children (P-208). A deleted default
member is simply absent from its list. **Frozen on a free port is tldraw's own
`isLocked`,** which is already persisted on every shape. A `frozen` prop beside it
would be two answers to one question (the routeMode-vs-pins WHY in
WireShapeUtil.tsx's `pins` doc). L-PORTS-SHAPE paints "not selectable" from
`isLocked`.

### 1.3 `ss-wire`

| prop | type | default | today because | items | reads / writes |
|---|---|---|---|---|---|
| `label` | `string` | `""` | `""` = no badge | P-156, P-171 | L-WIRE-PAINT (trunk `TraceBadge`) |
| `labelFraction` | `number` (the trunk clamps it to 0.05–0.95) | `0.5` | `LABEL_POSITION_DEFAULT` (trace.layout.ts:454); the delayed z⁻¹ pill rides the same position (P-137) | P-156, P-171, P-137 | L-WIRE-PAINT |
| `startMarker` | `"none" \| "arrow"` | `"none"` | trunk has no start marker | P-096 | L-WIRE-PAINT (trunk `trace.layout.ts`) |
| `endMarker` | `"none" \| "arrow"` | `"none"` | `DEFAULT_TRACE_MARKER_END` (trace.layout.ts:106; 4b49cd4 made data traces arrow-less) | P-096 | L-WIRE-PAINT |
| `animated` | `boolean` | `false` | trunk `Trace` default (trace.tsx:273) | P-121, P-187 | L-WIRE-PAINT |
| `strokeWidth` | `number \| null` | `null` | `null` = the variant's own weight | cluster 11 P-364 | L-WIRE-PAINT |
| `delayValue` | `string` | `""` | `""` = a bare z⁻¹; the donor's field (systemsketch ConnectionShapeUtil.tsx:303) | P-137, P-187 | L-WIRE-PAINT (panel row via L-INSPECTOR's schema) |
| `bend` | `{dx: number, dy: number} \| null` | `null` | `null` = no control point on a straight or curved cable (WireShapeUtil.tsx:457-467). The offset is from the chord midpoint, so it travels with the blocks. It follows the donor's `curve: {dx, dy}` (ConnectionShapeUtil.tsx:298), and `pins` keeps the elbow's bends | residual P-081, P-189 | L-ROUTE |

Red is `color` (it exists already, P-121). Routing gains **no** `arc` (§3).

### 1.4 `ss-code`

| prop | type | default | today because | items | reads / writes |
|---|---|---|---|---|---|
| `lineNumbers` | `boolean` | `true` | CodeFace.tsx:157 passes `lineNumbers` unconditionally | P-127, P-065 | L-CODE renders; L-PILL control |
| `fontSizePx` | `number` | `13` | CodeEditor's own default (codeEditor.tsx:221) | P-127 | same |

### 1.5 `ss-region`

| prop | type | default | today because | items | reads / writes |
|---|---|---|---|---|---|
| `view` | `"expanded" \| "opaque"` | `"expanded"` | RegionFace.tsx:138 draws `view="expanded"` unconditionally, and its own comment says there is no `view` in the schema. Here the opaque lens's state becomes stored state, matching the trunk scene contract's `region.view` (cf-A C1). | P-183 | L-BLOCK-VIEWS (RegionFace + the trunk `BlockRegionBlackboxToggle`) |

### 1.6 The type ripple of the `value` view

The trunk has no `value` face yet: `BlockView` in `components/blockPort.layout.ts:45`
has three values. Widening the app's `BlockView` therefore breaks `tsc` at exactly
three call sites. This was measured with a throwaway reference implementation:

- `apps/systemsketch/src/shapes/block/BlockFace.tsx:712` (`<BlockPort view={view}>`)
- `apps/systemsketch/src/document/sceneFromStore.ts:107` (`view: shape.props.view`)
- `apps/systemsketch/src/shapes/wire/dropMenu.tsx:93` (`view: entry.view`)

B-SCHEMA routes each one through one exported helper in `BlockShapeUtil.tsx`, which
maps `value` to `port` until L-BLOCK-VIEWS mounts `components/block.value.tsx`. It
needs a WHY. That is type plumbing, not behaviour: no stored block can be `value`
until a lane writes one.

---

## 2. Names that differ from `lanes.json` or the donor, and why

| `lanes.json` / donor says | stored as | why |
|---|---|---|
| `titleSize` | `titleSizePx` | a number in px, the same suffix as `ss-code`'s `fontSizePx` and CodeEditor's own prop. Presets are labels on a number, so "Extra large never prints two different pixel sizes" (P-415) |
| sizes per view `{simple, port, expanded}` | `viewSizes`, including `value` | the fourth view exists in the same migration |
| `portMode auto\|free` + `freeOffsets` | `rails[side].mode` `"auto" \| "custom"` + `rails[side].freeOffsets` | the trunk's own words (`PortEdgeArrangeMode`, portEdge.tsx:122). Custom mode is per wall, because `PortEdge` is per wall |
| donor `memberLayout` (`inset \| edge-to-edge`), donor `bodyLayout` (`free \| stack`) | `memberInset`, `membersLayout` | the trunk renamed them (`BlockMember.inset`, `Block.membersLayout`). Keeping the donor's `memberLayout` beside the trunk's `membersLayout` would be two names one letter apart |
| donor `insetBackground` `white \| soft-gray` | `none \| soft-gray` | trunk `BlockInsetBackground` (blockMembers.tsx:70) |
| P-109 `definitionKey` | not stored | the trunk dropped its storage and derives it on demand: `linking.ts:52-56`, `definitionKeyFor` |
| "port filled / hidden / frozen" | `ss-port.fill`, `.hidden`, `isLocked`; rail ports `portOptions[id]` | see 1.2. Rail ports are not shapes, so their options are keyed by port id, the same pattern as `freeOffsets`. `PortSpecV` is unchanged, so no port literal anywhere has to grow five fields |
| `startMarker` / `endMarker` / `labelFraction` | kept as `lanes.json` names them | L-WIRE-PAINT's acceptance already says "persisted as labelFraction"; WireFace maps them onto the trunk's `markerEnd` / `labelPosition` |

---

## 3. Deferred: storage that cannot be settled now

| state | items | why it is not in v2 | if he says yes |
|---|---|---|---|
| A block's seven slot lists: header L/C/R, body rows, footer L/C/R | P-194 (the audit asked for it) | It would be **two answers to one question.** `showHeader`/`showFooter`, `showDescription` and `glyph` already decide what the header and body paint, and the body's "rows" overlap `membersLayout: "stack"`. The member vocabulary (which built-ins exist, where today's glyph, title, description, function port and the Q-P146 burger sit by default, and whether a header slot can hold a child block) is a design call. L-INSPECTOR's own acceptance line for P-194 ("compose with the trunk Bar inside header/footer") needs no stored lists. | `blockSlots: Record<"headerLeft" \| … \| "footerRight", SlotMember[]>` with today's face as the defaults, in a dispatcher schema commit |
| `arc` routing kind | cluster 10 P-434 (the audit asked for it) | No lane in this run can draw it. The geometry is in `wireGeometry.ts` (L-ROUTE) and `trace.layout.ts` (L-WIRE-PAINT), and cluster 10 belongs to L-WIRE-GESTURE, which owns neither. Adding it also forces a narrowing in `wireGeometry.ts`, which is behaviour. Widening an enum needs **no migration**, because every stored value stays valid. | add `"arc"` to `routing` with the lane that builds the arc router |
| `titleAlign`, `titleBold`, `titleColor` | P-177 (the rest of it) | `lanes.json` scopes P-177 to size and font. `titleColor`'s vocabulary is P-076's 21-colour palette, which L-PILL re-scopes against Two Faces first. No lane renders align or bold. | the donor shapes: blockModel.ts:420-425 |
| A block's origin (badge on the block) | cluster 18 P-264 | `lanes.json` `deferredOther`: "the block-face origin badge … follow-up after W3". | the same validator as `ss-code.origin`: `{uri, anchor, contentHash} \| null`, default `null` |
| Saved camera views | cluster 20 P-276 (L-NAV) | It is not shape state. The parity backlog records "⚠️ Needs your yes: recommendation is page-meta keyed and reversible", and `chrome/panels.tsx:66-72` refuses to mint it from a panel. | `TLPage.meta.savedViews`. Page meta is free JSON, so there is no migration and it is not B-SCHEMA's |
| Per-port size, and the size cascade | cluster 8 P-270, cluster 15 P-319 | A per-port size competes with the document-wide port variant (`data-bbox-port-variant`), and the variant pick is pending (D10). | `portOptions[id].size` / `ss-port.size`: `number \| null` |
| Port-edge container W/H | cluster 8 P-395 | No rule says what an edge's own W/H means on a block wall, where the wall IS the length. | — |
| Port label "Left offset" / "Right offset" | P-119 | The trunk's `SlotOrigin` has four values. Two more need a trunk design first. | widen `SlotOrigin`, no migration |
| Code overflow, including grow-truncated | cluster 18 P-431, residual P-168 | No acceptance this run builds an overflow control, and the trunk dropped the grow modes (codeEditorLayout.ts:5-8). | `overflow: "clip" \| "wrap" \| "scroll" \| "grow-truncated"`, default `"clip"` |
| Flatten text, text opacity | cluster 18 P-278 | The trunk dropped flatten (codeEditor.tsx:21), so it would be a stored flag nothing can render. | — |
| Edges ending on edges; hyperedge trunks | cluster 10 P-444, P-456 | No design. WireShapeUtil's `canBind` WHY: "a real feature with real questions … and no design yet". | — |
| The default block is empty (`name: ""`) | cluster 14 P-246 | This is not new state. It changes an existing default, `name: "block"`. That is behaviour for new blocks, not a prop, and it needs no migration, but `documentModel.test` pins the name. | a one-line dispatcher schema commit if L-BLOCK-VIEWS builds P-246 |
| Clusters 1, 2, 3, 5, 16, 17, 19, 23, 25–28, 31, 32 and the `lanes.json` `deferred` items (P-060, P-069, P-090, P-131, P-223, P-209, P-104, P-120, P-124, P-179, P-232, P-236, P-150) | — | already deferred by the plan, each with its reason | — |

---

## 4. Not document state: no prop, on purpose

- **Derived, never stored:** block-port direction (Q-P123, from the wall).
  `= default` on a port (cluster 6, parsed from the declaration under ruling 8 —
  L-PORTS-SHAPE edits `portDeclaration.ts`). Diagnostics and their flags (L-DIAG).
  Producer counts (P-250, P-433). Type mismatch (cluster 4). Compare results
  (L-COMPARE). A block's parents (P-461, `parentId`). Window title (cluster 29).
  Viewport history (P-215) and depth (P-070), which are session state.
- **Runtime or interaction:** port selection (P-361), magnets and proposals (P-116,
  P-299), hover modifiers (P-287), dev hit-zone overlays (cluster 12), pill
  visibility (P-052, P-102).
- **Settings and preferences:** skin (P-144, Settings › Appearance), port line
  spacing (P-386), the A-key routing preset (P-247, dock preferences), inspector
  tier and dismissal (residual P-092), the crossing halo (P-097, an app-wide
  render choice).
- **Elsewhere on disk:** drafts (`DraftStorage`, draftModel.ts:58), recents
  (localStorage), the `.bbox` envelope and format version (P-087, L-FILES, file
  level, not a record).
- **A new shape kind, not a prop on an existing one:** `ss-glyph` (P-213) is
  L-GLYPH's whole new shape (its write set holds `shapes/glyph/**`, `registry.ts`
  and `types.ts`). Its sequence starts at version 0, so no saved record migrates.
  Its donor props are `packages/adapter-tldraw/src/glyph-shape-util.tsx:377-383`
  (`w, h, content, sizePreset, size, padding`). L-GLYPH's acceptance author amends
  `documentModel.test`'s kit list.

---

## 5. Calls this inventory made that Zach may want to reverse

Each one is reversible. A changed default is a one-line dispatcher schema commit;
an existing value never migrates.

- **Q1 `showFooter: true`.** The donor's default, and P-133's own words ("hide
  footer" is the action). Consequence: when L-BLOCK-VIEWS lands Q-P146's footer,
  **every block, old boards included, grows a footer band**. The alternative,
  `false`, keeps old boards as they are, but hides the burger until the user shows
  the footer.
- **Q2 P-194's slot lists are deferred** rather than built (§3, first row).
- **Q3 `arc` is deferred** rather than added unpaintable (§3, second row).
