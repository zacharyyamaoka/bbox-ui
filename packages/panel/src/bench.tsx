/**
 * The bench: which components exist, how each renders a preview, what a fresh
 * instance holds, and what "randomise" is allowed to write.
 *
 * WHY it lives in the package and not in an app: the Vite demo and the
 * bbox-ui.com create page both need exactly this, and a second copy would
 * drift the first time a component was added to one of them. Adding a ninth
 * component stays one import and one `registerComponent` call, in one file.
 */
import type { CSSProperties, ReactNode } from "react";
import type { FieldSpec, FieldValue } from "@bbox-ui/schema";
import {
  Bar,
  BAR_FIELDS,
  BAR_PRESETS,
  Block,
  BLOCK_BORDER_PX,
  BLOCK_FIELDS,
  BLOCK_PRESETS,
  BLOCK_RADIUS_DEFAULT,
  BlockDescription,
  BlockGlyph,
  BlockHeader,
  BlockTitle,
  BlockType,
  resolveBlockFace,
  Flex,
  FLEX_FIELDS,
  FLEX_PRESETS,
  Glyph,
  GLYPH_FIELDS,
  GLYPH_PRESETS,
  Pill,
  pillResolutionSubject,
  PILL_FIELDS,
  PILL_PRESETS,
  Port,
  PORT_FIELDS,
  PORT_PRESETS,
  PortEdge,
  PORT_EDGE_FIELDS,
  PORT_EDGE_PRESETS,
  Region,
  REGION_CORNER_SIZE,
  REGION_FIELDS,
  REGION_PRESETS,
  Stack,
  STACK_FIELDS,
  STACK_PRESETS,
  TextBox,
  TEXT_BOX_FIELDS,
  TEXT_BOX_PRESETS,
  ALL_EDGES,
  cascadeInto,
  DEFAULT_ARRANGEMENT,
  evenT,
  type AlignAnchor,
  type AppearanceState,
  type Tone,
  type Lens,
  type Arrangement,
  type Placement,
  type Placements,
  type PortEdgeId,
  type RegionKind,
  type SpacingScheme,
} from "@bbox-ui/core";
import { registerComponent, type ComponentEntry, type RenderContext, type SlotSpec } from "./registerComponent";
import type { Subject } from "./fieldModel";
import type { MembersSpec } from "./members/contract";
import { PortLane } from "./portDnd";
import { LANE_BAND_PX } from "./portEdges";

/**
 * Which components hold others, and what. `accepts` is closed on purpose:
 * a PortEdge is a lane of Ports and nothing else; a Stack is a column of
 * block-shaped things; a Block's body takes one layout container or a few
 * leaves; a Flex takes leaves and Flexes. Widening a set is a one-line edit
 * here, and the Members control offers exactly this list.
 */
const LEAVES = ["Port", "Pill", "Glyph", "TextBox"];
export const MEMBER_SPECS: Record<string, MembersSpec> = {
  Stack: { accepts: ["Block", "Stack", "Flex", ...LEAVES] },
  PortEdge: { accepts: ["Port"], label: "Ports" },
  Flex: { accepts: [...LEAVES, "Flex", "Block"] },
  // Zach, 2026-09-12: "a Block owns its Ports (they are its members)" —
  // IN ADDITION to the slot fills a Block already carries (BLOCK_SLOTS).
  // A Block's `members` list is deliberately unbounded in ACCEPTS-type
  // terms (only Port), not in count: slot fills stay first (written at
  // creation, see `makeInstanceWithSlots`), ports are appended after by
  // the ordinary `addMember` path.
  Block: { accepts: ["Port"], label: "Ports" },
  // The standalone port-edge bench: the four-edge arrangement with nothing
  // around it. Same members contract as a Block, so every existing path
  // (add a Port, select one, its Placement section) works unchanged.
  PortEdges: { accepts: ["Port"], label: "Ports" },
};

/**
 * The Block's anatomy, regrouped 2026-09-11 evening: header · body ·
 * footer. Header and footer are the same component, Bar ("they are
 * basically the exact same, we will fill them differently"), each with
 * three slots of its own (left · center · right, filled by Flex); the body
 * is a Flex column that holds rows. Slots nest: a fill that has slots
 * brings its own fills, so a Block arrives as 1 + 2 Bars + 6 Flexes + 1
 * body Flex = 10 instances, and the navigator reads Block › Header ›
 * Header · left …
 */
const cell = (side: "left" | "center" | "right"): SlotSpec => ({
  id: side,
  label: side[0]!.toUpperCase() + side.slice(1),
  region: side,
  fill: "Flex",
  fillProps: { justify: side === "left" ? "start" : side === "right" ? "end" : "center", gap: 6 },
});
export const BAR_SLOTS: SlotSpec[] = [cell("left"), cell("center"), cell("right")];
export const BLOCK_SLOTS: SlotSpec[] = [
  { id: "header", label: "Header", region: "header", fill: "Bar" },
  { id: "body", label: "Body", region: "body", fill: "Flex", fillProps: { direction: "column", align: "stretch", gap: 6 }, accepts: ["Flex"] },
  { id: "footer", label: "Footer", region: "footer", fill: "Bar" },
];

interface BlockRenderProps {
  width?: number;
  height?: number;
  radius?: number;
}

function stackMember(label: string): ReactNode {
  return (
    <div key={label} style={{ border: "2px solid currentColor", padding: "8px 12px", whiteSpace: "nowrap" }}>
      {label}
    </div>
  );
}

function threePorts(): ReactNode {
  return (
    <>
      <Port key="a" state="empty">
        alpha
      </Port>
      <Port key="b" state="wired">
        beta
      </Port>
      <Port key="c" state="received">
        gamma
      </Port>
    </>
  );
}

/**
 * Where one lane sits on an outline: straddling the border line it belongs
 * to, and inset along its own axis so a dot never rides a rounded corner.
 *
 * WHY `-(LANE_BAND_PX / 2) - wallBorderPx`, not `-LANE_BAND_PX / 2`: the
 * lane's centerline must land on the wall's OUTER boundary — the same
 * coordinate `portDotPlacement` (port.layout.ts) speaks — which sits
 * `wallBorderPx` outside the padding box the lane is absolutely positioned
 * in (a lane is a child of `Block`, whose border is `wallBorderPx` wide).
 * The old `-LANE_BAND_PX / 2` centered every dot on the border's INNER
 * edge instead, 2px inside the line — one of the drift sources measured
 * live on the /create bench (2.5–25.3px off the wall depending on label
 * width).
 *
 * WHY this is all that is left of the old `renderLane` (2026-09-12): the
 * lane's CONTENT — which slots are on it, in what order, at what `t`, what
 * is draggable and what a drop means — now belongs to the port-edge
 * component itself (`portEdges/`, five implementations behind one
 * contract). `bench.tsx` says only where on the Block the four bands go;
 * `<PortLane>` draws whichever implementation is live. That split is Zach's
 * own ask: "before we integrate this into the block, let's please get the
 * 'port edge' component working."
 */
function laneStyleFor(edge: PortEdgeId, inset: number, wallBorderPx: number): CSSProperties {
  const horizontal = edge === "top" || edge === "bottom";
  const straddle = -(LANE_BAND_PX / 2) - wallBorderPx;
  return {
    position: "absolute",
    ...(horizontal
      ? { [edge]: straddle, left: inset, right: inset, height: LANE_BAND_PX }
      : { [edge]: straddle, top: 0, bottom: 0, width: LANE_BAND_PX }),
  };
}

/**
 * The standalone port-edge bench (Zach, 2026-09-12): just the dashed
 * outline, four live edges and a set of seeded ports — the lab's stage 3 in
 * the product's own idiom, with nothing of a Block's anatomy around it to
 * confound what a drag actually did. Its Custom / Spacing / Grouping props
 * ARE the lab's three controls, so the inspector drives them as ordinary
 * schema fields.
 */
function renderPortEdges(props: Record<string, unknown>, _children?: ReactNode, ctx?: RenderContext): ReactNode {
  const p = props as { width?: number; height?: number; showContainer?: boolean; showCenterLine?: boolean };
  const width = p.width && p.width > 0 ? p.width : 420;
  const height = p.height && p.height > 0 ? p.height : 240;
  // Dev-time-only visibility, per Zach's 2026-09-12 ask: "always nice to be
  // able to toggle them on if debugging" — this bench is exactly that dev
  // context, so the outline defaults ON here; a real Block never renders
  // this component at all and never has to think about the default.
  const showContainer = p.showContainer !== false;
  const showCenterLine = p.showCenterLine === true;
  const live = ctx?.arrangement && ctx.placements && ctx.blockId;
  return (
    <div
      data-slot="port-edges-outline"
      style={{
        position: "relative",
        width,
        height,
        borderRadius: 10,
        border: showContainer
          ? "1px dashed color-mix(in srgb, currentColor 34%, transparent)"
          : "1px solid transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "visible",
      }}
    >
      {showContainer && <span style={{ opacity: 0.4, fontSize: 12, letterSpacing: "0.04em" }}>PortEdges</span>}
      {live
        ? ALL_EDGES.map((edge) => (
            // `1`: this bench's own outline is a 1px dashed border, not a
            // real Block — the same `wallBorderPx` compensation, sized to
            // what this container actually draws.
            <PortLane key={edge} edge={edge} style={laneStyleFor(edge, 14, 1)} showCenterLine={showCenterLine} />
          ))
        : null}
    </div>
  );
}

/**
 * The three lab controls, expressed as ordinary schema fields, applied over
 * whatever Arrangement the instance stores.
 *
 * WHY the props override the stored Arrangement instead of duplicating it:
 * a drop is resolved against the arrangement's `mode`, and `movePortTo` in
 * the host reads that arrangement too — if the render used one mode and the
 * drop handler another, a drag in Custom would be committed as an Auto
 * reorder. One function, called by both, is what makes that impossible.
 * A Block is NOT touched: its own inspector section stays authoritative.
 */
export function portEdgesArrangement(instanceType: string, props: Record<string, unknown>, stored: Arrangement): Arrangement {
  if (instanceType !== "PortEdges") return stored;
  const grouping = props.grouping as string | undefined;
  const spacingProp = props.spacing as string | undefined;
  // "Aligned to edge" isn't a fourth SpacingScheme — it's `align`, a
  // separate presentational field portPlacement.ts's `t`-math never reads
  // (see AlignConfig's own doc). `spacing` itself falls back to "evenly" so
  // this arrangement still has a sane story if it's ever switched to Custom
  // and back, or read by something that only knows the three CSS schemes.
  const isAligned = spacingProp === "aligned";
  return {
    ...stored,
    mode: props.custom === true ? "custom" : "auto",
    spacing: isAligned ? "evenly" : ((spacingProp as SpacingScheme) ?? stored.spacing),
    align: isAligned
      ? {
          anchor: (props.alignAnchor as AlignAnchor) ?? "start",
          gapPx: typeof props.alignGap === "number" ? props.alignGap : 18,
          edgePaddingPx: typeof props.alignEdgePadding === "number" ? props.alignEdgePadding : 0,
        }
      : undefined,
    grouping:
      grouping === "off" || !stored.grouping
        ? undefined
        : { ...stored.grouping, collapsed: grouping === "collapsed" },
  };
}

const PORT_EDGES_FIELDS: FieldSpec[] = [
  {
    id: "custom",
    label: "Custom",
    kind: "toggle",
    defaultValue: false,
    hint: "Freeform position: cards stop reflowing and stay exactly where you drop them, still moving between edges.",
  },
  {
    id: "spacing",
    label: "Spacing",
    kind: "segments",
    defaultValue: "evenly",
    options: [
      { value: "between", label: "Edge to edge" },
      { value: "evenly", label: "Including edge" },
      { value: "around", label: "Around" },
      { value: "aligned", label: "Aligned to edge" },
    ],
    hint: "Auto mode only. The first three are the flexbox distributions evenT reproduces as fractions; Aligned to edge packs from one end with the three fields below instead.",
  },
  {
    id: "alignAnchor",
    label: "Align anchor",
    kind: "segments",
    defaultValue: "start",
    options: [
      { value: "start", label: "Start" },
      { value: "end", label: "End" },
    ],
    hint: "Spacing: Aligned to edge only.",
  },
  {
    id: "alignGap",
    label: "Align gap",
    kind: "number",
    defaultValue: 18,
    min: 0,
    max: 200,
    step: 1,
    hint: "px between cards. Spacing: Aligned to edge only.",
  },
  {
    id: "alignEdgePadding",
    label: "Edge padding",
    kind: "number",
    defaultValue: 0,
    min: 0,
    max: 400,
    step: 1,
    hint: "px the whole pack is pushed in from its anchor — the Offset layout's mechanism. Spacing: Aligned to edge only.",
  },
  {
    id: "grouping",
    label: "Grouping",
    kind: "segments",
    defaultValue: "off",
    options: [
      { value: "off", label: "Off" },
      { value: "grouped", label: "Grouped" },
      { value: "collapsed", label: "Collapsed" },
    ],
    hint: "Grouped keeps the pair as separate cards that move together; Collapsed folds them into one card at the first member.",
  },
  { id: "width", label: "Width", kind: "number", defaultValue: 420, min: 240, max: 720, step: 10 },
  { id: "height", label: "Height", kind: "number", defaultValue: 240, min: 160, max: 480, step: 10 },
  {
    id: "showContainer",
    label: "Show container",
    kind: "toggle",
    defaultValue: true,
    hint: "Dev-time only — a real Block draws its own outline and never renders this box at all.",
  },
  {
    id: "showCenterLine",
    label: "Show center line",
    kind: "toggle",
    defaultValue: false,
    hint: "Dev-time guide for where the lane's own line actually is. Off is how a real Block sits — it IS the line.",
  },
];

/**
 * The slotted Block: a Bar above, the body Flex, a Bar below, plus (Zach,
 * 2026-09-12) four PortEdge lanes drawn on its outline from the
 * arrangement/placement model, and — when one Port is `locked` — the
 * function port pinned at the header's left corner, outside every lane.
 * A hidden Bar renders its marker only, so the region vanishes; the
 * radius clips both bars' corners.
 *
 * Face-governed (Zach, 2026-09-13, P2 "views are presets" —
 * reports/view-switching-proposals-2026-09-11.html): `resolveBlockFace`
 * runs this instance's subject through the same view/preset cascade
 * `BlockFace` itself paints with, and every structural decision below is a
 * lookup on the RESOLVED `face`, never on the raw `view` prop — the bench
 * is a second renderer over the same computation, not a second, informal
 * description of it. The slotted anatomy (header/body/footer Bars and
 * Flexes, the PortLane machinery, the locked-port pin) is untouched; only
 * whether/how each region mounts is now governed.
 */
function renderBlock(props: Record<string, unknown>, _children?: ReactNode, ctx?: RenderContext): ReactNode {
  const p = props as BlockRenderProps;
  const face = resolveBlockFace(props);
  const radius = p.radius ?? BLOCK_RADIUS_DEFAULT;
  const arrangement = ctx?.arrangement;
  const placements = ctx?.placements;
  const blockId = ctx?.blockId;
  const members = ctx?.members ?? {};
  const lockedIds = ctx?.lockedMemberIds ?? [];
  const locked = new Set(lockedIds);
  const lockedId = lockedIds[0];
  // "rows": the Block's own Port members (never the locked function port,
  // pinned separately below), in member order — ctx carries no ordered
  // port-id list of its own, but render-instance.tsx builds `ctx.members`
  // from exactly a Block's non-slot-fill children, which per
  // MEMBER_SPECS.Block is Ports only, so its keys ARE that order.
  const portRowIds = Object.keys(members).filter((id) => !locked.has(id));
  const wallsReady = arrangement && placements && blockId;
  const lanesLeftRight = wallsReady ? (
    <>
      <PortLane edge="left" style={laneStyleFor("left", radius, BLOCK_BORDER_PX)} />
      <PortLane edge="right" style={laneStyleFor("right", radius, BLOCK_BORDER_PX)} />
    </>
  ) : null;
  const lanesTopBottom = wallsReady ? (
    <>
      <PortLane edge="top" style={laneStyleFor("top", radius, BLOCK_BORDER_PX)} />
      <PortLane edge="bottom" style={laneStyleFor("bottom", radius, BLOCK_BORDER_PX)} />
    </>
  ) : null;
  /**
   * ports: "walls" mounts the lane block as today. "anonymous" mounts the
   * SAME lanes, wrapped so they paint nothing — the P2 contract is that an
   * anonymous port stays a live, addressable DOM node (stable id, still a
   * drop target) with only its paint suppressed, not unmounted. The
   * wrapper's `display: contents` drops its own box (so the lanes' absolute
   * positions still resolve against Block, the nearest positioned
   * ancestor) while `visibility: hidden` is an inherited property that
   * reaches every descendant PortLane paints, since PortLane sets no
   * `visibility` of its own to override it — reasoned from portDnd.tsx's
   * own markup (it has no `visibility`/`opacity` rule), not screenshotted.
   * "rows" mounts neither; a Block's ports render as a list in the body
   * instead (below).
   */
  const portLanesFor = (lanes: ReactNode): ReactNode => {
    if (face.ports === "walls") return lanes;
    if (face.ports === "anonymous")
      return (
        <div data-slot="ports-anonymous" style={{ display: "contents", visibility: "hidden" }}>
          {lanes}
        </div>
      );
    return null;
  };
  return (
    <Block
      width={face.width}
      height={face.height}
      radius={p.radius}
      data-view={face.view}
      data-header={face.header}
      data-ports={face.ports}
      data-members={face.members}
      className="!justify-start !px-0 !text-left"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 0,
        // Was keyed on the raw `p.height` override; now on the CASCADE's
        // resolved height so a view switch — not just an explicit
        // width/height override — actually resizes the box. face.height
        // always resolves (the "simple" preset's own default at worst), so
        // the guard is defensive rather than load-bearing.
        height: face.height && face.height > 0 ? face.height : undefined,
        minHeight: 120,
        maxWidth: "100%",
        // Block's own `overflow: clip` exists so a Bar's line clips at the
        // rounded corner rather than poking past it — but a lane straddles
        // the OUTLINE on purpose (the dot reads as "ON the border", the
        // usual port convention), which clip would cut clean off. Only
        // relaxed when there is something to straddle it with.
        // WHY the conditional spread, not `overflow: … : undefined`: an
        // `overflow: undefined` key merges over Block's own
        // `overflow: "clip"` and unsets it (React drops undefined-valued
        // style keys), so the lane-less Block would silently lose its
        // Bar-corner clip — the same undefined-key clobber measured live
        // on the RF host, 2026-09-14.
        ...(arrangement && placements ? { overflow: "visible" as const } : null),
      }}
    >
      {face.header === "band" ? (
        (ctx?.slots?.header ?? null)
      ) : (
        // "centered": the bench Block carries no title data of its own, so
        // this is demo content — the same role threePorts() plays for the
        // standalone PortEdge bench below. The Bar slot fill for this
        // instance still exists underneath (BLOCK_SLOTS always builds one);
        // it just isn't mounted here, kept reachable in the navigator only
        // — hiding is canvas-only, the same rule `members` already follows.
        <div
          data-slot="block-centered-header"
          style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}
        >
          <BlockHeader>
            <BlockGlyph>◆</BlockGlyph>
            <BlockTitle>Block</BlockTitle>
          </BlockHeader>
          {face.description ? <BlockDescription>Description</BlockDescription> : null}
        </div>
      )}
      {lockedId && members[lockedId] && (
        <div
          data-slot="port-locked"
          // The pin's centering transform is on the OUTER corner — the
          // same wall-boundary coordinate `portDotPlacement` speaks — so
          // `top`/`left` are the padding box's origin MINUS the border
          // width, not the padding box's own (0, 0).
          style={{
            position: "absolute",
            top: -BLOCK_BORDER_PX,
            left: -BLOCK_BORDER_PX,
            transform: "translate(-50%, -50%)",
            zIndex: 2,
          }}
        >
          {cascadeInto(members[lockedId], "right", true)}
        </div>
      )}
      <div data-slot="block-body" style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column", position: "relative" }}>
        {face.ports === "rows" && portRowIds.length > 0 && (
          <div data-slot="block-port-rows-bench">
            {portRowIds.map((id) => (
              <div key={id} data-member-id={id}>
                {members[id]}
              </div>
            ))}
          </div>
        )}
        {face.members === "shown" ? (ctx?.slots?.body ?? null) : null}
        {portLanesFor(lanesLeftRight)}
      </div>
      {/* typePlacement: "bottom" pins a demo type label, matching
          BlockFace's own TYPE_RENDER; "header" prints nothing here because
          that variant's type text lives inside the band's own right cell —
          already user-composed via ctx.slots.header — so there is nothing
          new to demo at the bench level. */}
      {face.typePlacement === "bottom" ? <BlockType>Type</BlockType> : null}
      {face.footer ? (ctx?.slots?.footer ?? null) : null}
      {portLanesFor(lanesTopBottom)}
    </Block>
  );
}

/**
 * Region's own slots (Zach, 2026-09-13): a corner and a body, the same
 * `SlotSpec` mechanism `BLOCK_SLOTS` already uses. The corner is filled by
 * a REAL `Block` instance, in Port view — the 2026-09-11 report's own C7
 * ruling, Zach's words: "a region is not a block but is composed using a
 * block." A Region is deliberately NOT a Block preset (see
 * `region.presets.ts`'s own empty `REGION_PRESETS`); this is the
 * composition that stands in for one.
 *
 * WHY the corner Block fill recursively brings Block's own slot fills too
 * (a Bar per end, a Flex per Bar cell, the body Flex): that is expected,
 * the same way a Bar composed into one of Block's own header/footer slots
 * already arrives two levels deep — `makeInstanceWithSlots` recurses on
 * whatever a slot's `fill` names, regardless of how deep that component's
 * own anatomy goes.
 */
export const REGION_SLOTS: SlotSpec[] = [
  {
    id: "corner",
    label: "Corner",
    region: "corner",
    fill: "Block",
    // Sized to `REGION_CORNER_SIZE` — the real, unscaled footprint
    // `region.tsx`'s corner wrapper now expects (its own `cornerSize`
    // prop default). Region no longer shrinks whatever it's handed via
    // CSS `scale`; the corner Block must arrive at its true size.
    fillProps: { view: "port", width: REGION_CORNER_SIZE.width, height: REGION_CORNER_SIZE.height },
  },
  { id: "body", label: "Body", region: "body", fill: "Flex", fillProps: { direction: "column", align: "stretch", gap: 6 } },
];

interface RegionRenderProps {
  kind?: RegionKind;
  width?: number;
  height?: number;
  radius?: number;
}

function renderRegion(props: Record<string, unknown>, _children?: ReactNode, ctx?: RenderContext): ReactNode {
  const p = props as RegionRenderProps;
  return (
    <Region kind={p.kind} width={p.width} height={p.height} radius={p.radius} corner={ctx?.slots?.corner}>
      {ctx?.slots?.body}
    </Region>
  );
}

export const REGISTRY: ComponentEntry[] = [
  registerComponent({
    name: "Port",
    fields: PORT_FIELDS,
    presets: PORT_PRESETS,
    render: (props) => <Port {...(props as Record<string, never>)} />,
  }),
  registerComponent({
    name: "Pill",
    fields: PILL_FIELDS,
    presets: PILL_PRESETS,
    // Pill folds `tone` into the override layer before resolving, so the
    // panel has to resolve against the same subject or its trace disagrees
    // with the pixels. Imported, not reimplemented.
    toSubject: pillResolutionSubject,
    render: (props) => <Pill {...(props as Record<string, never>)} />,
  }),
  registerComponent({
    name: "Glyph",
    fields: GLYPH_FIELDS,
    presets: GLYPH_PRESETS,
    render: (props) => <Glyph {...(props as Record<string, never>)} />,
  }),
  registerComponent({
    name: "TextBox",
    fields: TEXT_BOX_FIELDS,
    presets: TEXT_BOX_PRESETS,
    // WHY `inlineEdit` names `children` and nothing else: `children` is the
    // one flat property that IS the text (docs/TEXTBOX-EDITING-SPEC.md §1 —
    // "there is no `value` prop"), so it is also the one field the create
    // page's in-place editor is allowed to write through a pointer/keyboard
    // gesture rather than the inspector.
    inlineEdit: { field: "children" },
    render: (props, _children, ctx) => {
      const box = (
        <TextBox
          {...(props as Record<string, never>)}
          editing={ctx?.edit?.editing ?? false}
          onChange={ctx?.edit?.onChange}
          onCommit={ctx?.edit?.onCommit}
          onCancel={ctx?.edit?.onCancel}
        />
      );
      // WHY bare when nested: the dashed 220px frame is bench-only chrome
      // for a top-level specimen on the demo strip. Inside a Block's slot
      // (or any other member position) it would print a visible box around
      // a box, which is not what "add a TextBox to Header · left" means.
      if (ctx?.nested) return box;
      return <div style={{ width: 220, border: "1px dashed #ccc" }}>{box}</div>;
    },
  }),
  registerComponent({
    name: "Flex",
    fields: FLEX_FIELDS,
    presets: FLEX_PRESETS,
    members: MEMBER_SPECS.Flex,
    // An empty Flex paints nothing, which on the bench reads as a bug and
    // inside a Block hides the hole entirely. The dashed placeholder is
    // Zach's own sketch — "left slot", "Row 1" — and steps aside the moment
    // a member arrives.
    render: (props, children, ctx) => (
      <Flex {...(props as Record<string, never>)} data-slot-label={ctx?.slotLabel}>
        {children ?? (
          <span
            data-slot="flex-placeholder"
            // A placeholder must never be wider than its slot: inside a
            // narrow parent three "Header · …" labels overlapped each other.
            style={{ display: "inline-flex", alignItems: "center", minHeight: 24, minWidth: 0, maxWidth: "100%", padding: "0 8px", border: "1px dashed currentColor", opacity: 0.45, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", justifyContent: "center", ...(props.direction === "column" ? { alignSelf: "stretch", minHeight: 36 } : {}) }}
          >
            {ctx?.slotLabel ?? "Flex"}
          </span>
        )}
      </Flex>
    ),
  }),
  registerComponent({
    name: "Stack",
    fields: STACK_FIELDS,
    presets: STACK_PRESETS,
    members: MEMBER_SPECS.Stack,
    render: (props, children) => (
      <div style={{ width: 240, border: "1px dashed #ccc" }}>
        <Stack {...(props as Record<string, never>)}>
          {children ?? (
            <>
              {stackMember("Member A")}
              {stackMember("Member B")}
            </>
          )}
        </Stack>
      </div>
    ),
  }),
  registerComponent({
    name: "PortEdge",
    fields: PORT_EDGE_FIELDS,
    presets: PORT_EDGE_PRESETS,
    members: MEMBER_SPECS.PortEdge,
    render: (props, children) => (
      <div style={{ position: "relative", width: 260, height: 160, border: "1px dashed #ccc" }}>
        <PortEdge {...(props as Record<string, never>)}>{children ?? threePorts()}</PortEdge>
      </div>
    ),
  }),
  registerComponent({
    name: "Bar",
    fields: BAR_FIELDS,
    presets: BAR_PRESETS,
    slots: BAR_SLOTS,
    // The edge is not a field: it follows from which slot the Bar fills.
    render: (props, _children, ctx) => (
      <Bar {...(props as Record<string, never>)} edge={ctx?.slotId === "footer" ? "top" : "bottom"} left={ctx?.slots?.left} center={ctx?.slots?.center} right={ctx?.slots?.right} />
    ),
  }),
  registerComponent({
    name: "Block",
    fields: BLOCK_FIELDS,
    presets: BLOCK_PRESETS,
    slots: BLOCK_SLOTS,
    members: MEMBER_SPECS.Block,
    render: renderBlock,
  }),
  registerComponent({
    name: "PortEdges",
    fields: PORT_EDGES_FIELDS,
    presets: [],
    members: MEMBER_SPECS.PortEdges,
    render: renderPortEdges,
  }),
  registerComponent({
    name: "Region",
    fields: REGION_FIELDS,
    presets: REGION_PRESETS,
    slots: REGION_SLOTS,
    render: renderRegion,
  }),
];

/**
 * Seed props per component, as a LIST of genuinely different variations.
 *
 * WHY a list rather than one instance: the bench's whole purpose is checking
 * what a panel does when a selection disagrees — "it's good being able to
 * check the logic of what happens when you click multiple mixed instances".
 * If instance 2 were a copy of instance 1, nothing would ever read Mixed and
 * the bench would prove nothing. So each variation differs in at least one
 * field the panel actually shows.
 *
 * WHY the bench nonetheless opens with ONE: two instances and a pair of
 * checkboxes on first load reads as a puzzle rather than a primitive —
 * Zach, 2026-09-11: "I kinda wanted to see the primitive in isolation
 * first." Isolation is the default; disagreement is one click away.
 */
export const SEED_VARIANTS: Record<string, Record<string, unknown>[]> = {
  Port: [
    // WHY no `textLayout` on the first three: a Port added into a Block
    // lands on one of its lanes, and the lane cascades the inward layout
    // (label below a top-edge dot, right of a left-edge dot). An own value
    // wins over that cascade — the same trap the size rung hit, where a
    // seeded `size` beat the header's — so a seed carries only what the
    // bench must show. A bare Port's default is "right" regardless.
    { state: "empty", diameter: "md", children: "Port A" },
    { state: "wired", diameter: "md", children: "Port B" },
    { state: "received", diameter: "lg", children: "Port C" },
    { state: "valueSet", diameter: "sm", textLayout: "below", children: "Port D" },
  ],
  Pill: [
    { state: "wired", children: "Wired" },
    { state: "valueSet", children: "Default" },
    { state: "empty", children: "Empty" },
    { state: "received", children: "Received" },
  ],
  // WHY the first seed of a sized leaf sets no size: it is the one Add
  // uses, and an own size would beat whatever a header hands down — the
  // cascade must be visible on a freshly added member. The other seeds
  // still disagree, which is what the multi-select bench needs.
  Glyph: [
    { children: "🔍" },
    { size: "lg", children: "⚙️" },
    { size: "md", children: "◆" },
  ],
  TextBox: [
    { children: "Text Box" },
    { size: "lg", children: "Bigger text" },
    { size: "sm", children: "Small print" },
  ],
  Stack: [{}, { gap: "lg" }],
  PortEdge: [{ edge: "left" }, { edge: "right" }, { edge: "top" }],
  Flex: [{}, { justify: "between" }, { direction: "column", align: "stretch" }],
  Bar: [{}, { size: "lg" }, { line: false }],
  // WHY the first seed is a view, not a geometry override (2026-09-13): it
  // is what /create opens with AND what Add uses. "expanded" keeps the
  // band-header + body + wall-lanes composition — where the merged
  // members/port-lane workflows actually live — visible by default. Note
  // the footer Bar hides under Expanded's own `footer: false`; that is
  // deliberate, the preset stays the primary source of truth over what the
  // underlying slot fill happens to contain.
  Block: [{ view: "expanded" }, { view: "port" }, {}, { width: 480, height: 260 }],
  // A Region has no view selector of its own (region.presets.ts); its two
  // seeds instead disagree on `kind`, the one closed-vocabulary field it
  // does have.
  Region: [{}, { kind: "while" }],
};

export interface Instance extends Subject {
  /** Which registered component this instance is. Always the active component
   *  in a focused bench; the whole point of the mixed bench is that it varies. */
  type: string;
  /**
   * The ids of the instances this one holds, in order. Only present on an
   * instance whose component declares `members`. A held instance lives in
   * the same bench array as everything else — it just is not top-level —
   * so selecting it puts it in the inspector exactly like any other.
   * See members/model.ts for every derived fact (parent, depth, subtree).
   */
  members?: string[];
  /**
   * Set on an instance that fills one of its parent's slots. Such an
   * instance is created with the parent, cannot be removed, moved or
   * dragged, and prints its slot's label as its title.
   */
  slot?: { id: string; label: string; accepts?: string[] };
  /**
   * A Block's own Arrangements (Zach, 2026-09-12): named states, each with
   * a mode, live edges and an optional grouping set — see
   * `packages/bbox-ui/src/portPlacement.ts`. Present only on a Block;
   * `arrangement` is the id of the one currently active. Both default via
   * `makeInstance` the moment a Block is created, never left undefined for
   * one that exists — `activeArrangement`/`portPlacementsOf` still fall
   * back to `DEFAULT_ARRANGEMENT` for the rare instance built by hand
   * (a test fixture) without them.
   */
  arrangements?: Arrangement[];
  arrangement?: string;
  /**
   * A Port's placement, PER ARRANGEMENT id — never just one, because a
   * Port can be positioned differently in each of its Block's states.
   * Absent (or missing an entry for the active arrangement) is not an
   * error: `portPlacementsOf` fills the gap with `defaultPlacement`
   * without writing anything back.
   */
  placements?: Record<string, Placement>;
  /**
   * The function port: pinned at the Block's header-left corner, order 0,
   * never draggable, at most one per Block (enforced where a placement is
   * written, not here — this is just the stored fact).
   */
  locked?: boolean;
}

export function makeInstance(type: string, index: number, uid: number): Instance {
  const variants = SEED_VARIANTS[type] ?? [{}];
  const base: Instance = {
    id: `${type.toLowerCase()}-${uid}`,
    type,
    props: { ...variants[index % variants.length] },
  };
  // A Block always carries at least its "default" Arrangement — never
  // created bare and backfilled later, so every reader (the renderer, the
  // inspector, `activeArrangement`) can assume a fresh Block already has
  // one instead of special-casing "no arrangements yet".
  if (type === "Block" || type === "PortEdges") {
    return { ...base, arrangements: [DEFAULT_ARRANGEMENT], arrangement: DEFAULT_ARRANGEMENT.id };
  }
  return base;
}

/**
 * A fresh instance PLUS the instances that fill its slots, ids drawn from
 * `uid` upward (the caller advances `uid` by the returned length). The
 * first element is the instance itself, its `members` already pointing at
 * the fills in slot order. A component without slots returns one.
 */
export function makeInstanceWithSlots(type: string, index: number, uid: number): Instance[] {
  const self = makeInstance(type, index, uid);
  const slots = REGISTRY.find((e) => e.name === type)?.slots ?? [];
  if (slots.length === 0) return [self];
  let next = uid + 1;
  const fills: Instance[] = [];
  const fillIds: string[] = [];
  for (const slot of slots) {
    // A fill may itself have slots (a Bar's three cells): it brings them.
    const made = makeInstanceWithSlots(slot.fill, 0, next);
    next += made.length;
    const fill: Instance = {
      ...made[0]!,
      props: { ...(slot.fillProps ?? {}) },
      slot: { id: slot.id, label: slot.label, ...(slot.accepts ? { accepts: slot.accepts } : {}) },
    };
    fillIds.push(fill.id);
    fills.push(fill, ...made.slice(1));
  }
  return [{ ...self, members: fillIds }, ...fills];
}

/**
 * The cross-type bench. Zach, 2026-09-11: "a free flowing one where you can
 * add instances of any types of primitives so that you're able to check the
 * logic of what happens when you multiselect on various different types...
 * to see what are the things that you're able to update across all of them."
 */
export const MIXED_BENCH = "Mixed bench";

/**
 * The fields a panel may show when the selection spans several components.
 *
 * Intersection by id is not enough. Two components can both call a field
 * `size` and mean different option sets, and offering one control over both
 * would write a value that is legal for one and nonsense for the other. So a
 * field survives only when its id, kind AND option set all agree; anything
 * that merely shares a name is reported as excluded rather than silently
 * dropped, because "what can I edit across all of these" is the question the
 * bench exists to answer and a quiet omission is a wrong answer to it.
 */
export function sharedFields(entries: ComponentEntry[]): { fields: FieldSpec[]; excluded: string[] } {
  if (entries.length === 0) return { fields: [], excluded: [] };
  const [first, ...rest] = entries;
  const signature = (f: FieldSpec) =>
    `${f.kind}|${(f.options ?? []).map((o) => String(o.value)).join(",")}`;

  const fields: FieldSpec[] = [];
  const excluded: string[] = [];

  for (const field of first.fields) {
    // WHY two separate reasons and not one: "Stack has no State field" and
    // "Glyph's Size means something else" are different facts, and collapsing
    // them into one phrase told the reader the opposite of the truth in the
    // common case. A bench that explains why a field is missing has to
    // explain it correctly or it is worse than saying nothing.
    const absentFrom = rest.filter((e) => !e.fields.some((o) => o.id === field.id));
    const differsOn = rest.filter((e) =>
      e.fields.some((o) => o.id === field.id && signature(o) !== signature(field)),
    );
    if (absentFrom.length === 0 && differsOn.length === 0) fields.push(field);
    else if (differsOn.length > 0)
      excluded.push(`${field.label} (different options on ${differsOn.map((e) => e.name).join(", ")})`);
    else excluded.push(`${field.label} (not on ${absentFrom.map((e) => e.name).join(", ")})`);
  }

  const firstIds = new Set(first.fields.map((f) => f.id));
  const seen = new Set(excluded);
  for (const entry of rest) {
    for (const field of entry.fields) {
      if (firstIds.has(field.id)) continue;
      const line = `${field.label} (only on ${entry.name})`;
      if (!seen.has(line)) {
        seen.add(line);
        excluded.push(line);
      }
    }
  }
  return { fields, excluded };
}

/** The excluded list is for orientation, not for reading end to end — Port and
 *  Pill alone already produce seven entries. Show enough to see the shape. */
export const EXCLUDED_SHOWN = 5;


/** Label words for randomising a text field. Randomising a name to a UUID is
 *  noise; randomising it to a word keeps the preview readable, which is the
 *  point of the button. */
export const RANDOM_WORDS = ["alpha", "beta", "gamma", "delta", "signal", "frame", "pose", "goal", "mask", "tick"];

/**
 * A random legal value for one field, from the field's OWN declaration.
 *
 * WHY it reads the FieldSpec rather than a per-component table: a table would
 * be an eighth place that has to learn about a new component, and would go
 * stale silently the first time an option set changed. The schema already
 * says exactly what is legal here.
 */
export function randomValue(field: FieldSpec, roll: () => number): FieldValue | undefined {
  // A field may opt out (FieldSpec.randomize): host-computed state such as
  // Port's reveal-on-hover made instances vanish from the bench when rolled.
  if (field.randomize === false) return undefined;
  switch (field.kind) {
    case "segments": {
      const options = (field.options ?? []).filter((o) => o.randomize !== false);
      if (options.length === 0) return undefined;
      return options[Math.floor(roll() * options.length)]!.value;
    }
    case "toggle":
      return roll() < 0.5;
    case "number": {
      const min = field.min ?? 0;
      const max = field.max ?? min + 10;
      const step = field.step ?? 1;
      const steps = Math.max(1, Math.round((max - min) / step));
      return Math.round((min + Math.floor(roll() * (steps + 1)) * step) * 1000) / 1000;
    }
    case "text":
    // WHY "textarea" shares "text"'s branch rather than getting its own: this
    // switch has no `default` and returns `FieldValue | undefined`, so a
    // FieldKind this repo adds later can fall through here with no compile
    // error and no runtime warning — Randomize would silently no-op for it.
    // Handling it explicitly (even by reusing "text"'s word pool) is what
    // makes the omission a choice instead of an oversight; a multi-line
    // random value would defeat the "keeps the preview readable" point above.
    case "textarea":
      return RANDOM_WORDS[Math.floor(roll() * RANDOM_WORDS.length)]!;
  }
}

/**
 * Every focused bench opens with exactly ONE instance — a primitive in
 * isolation. The mixed bench opens with two DIFFERENT components, because a
 * bench of one type is just the focused view and would say nothing about the
 * cross-type question it exists to answer. Both pieces of an app's state read
 * from this one seed, so a selection can never start out pointing at an
 * instance that is not there.
 */
/**
 * The Block bench's own extra seed (Zach, 2026-09-12): three real Ports —
 * "in", "cfg", "out" — added as members with placements already resolved
 * for the default Arrangement (two on the left, one on the right), so the
 * very first Block on the bench shows lanes with something ON them
 * instead of an empty outline. The `t`s are `evenT`'s own even-spacing
 * values, not guessed — a seed is data the model would have produced
 * itself, never a stale value `refresh()` would immediately overwrite.
 */
function seedBlockPorts(block: Instance, uid: number): { block: Instance; ports: Instance[] } {
  const leftT = evenT(2, DEFAULT_ARRANGEMENT.spacing);
  const rightT = evenT(1, DEFAULT_ARRANGEMENT.spacing);
  const port = (id: string, name: string, edge: PortEdgeId, order: number, t: number): Instance => ({
    id,
    type: "Port",
    props: { children: name, edge, direction: edge === "left" ? "input" : "output" },
    placements: { [DEFAULT_ARRANGEMENT.id]: { edge, order, t } },
  });
  const ports = [
    port(`port-${uid}`, "in", "left", 0, leftT[0]!),
    port(`port-${uid + 1}`, "cfg", "left", 1, leftT[1]!),
    port(`port-${uid + 2}`, "out", "right", 0, rightT[0]!),
  ];
  return { block: { ...block, members: [...(block.members ?? []), ...ports.map((p) => p.id)] }, ports };
}

/**
 * The standalone bench's own fixture, deliberately the LAB's: eight ports
 * P1-P8 — four on top, one left, two right, one bottom — and a grouping set
 * that pairs two of them (P2 + P3, both on the top edge, so a rigid group
 * move and a collapse are visible on the busiest lane). Identical for every
 * variant, so a difference between two captures is a difference in
 * behaviour.
 */
function seedPortEdges(host: Instance, uid: number): { host: Instance; ports: Instance[] } {
  const layout: { name: string; edge: PortEdgeId }[] = [
    { name: "P1", edge: "top" },
    { name: "P2", edge: "top" },
    { name: "P3", edge: "top" },
    { name: "P4", edge: "top" },
    { name: "P5", edge: "left" },
    { name: "P6", edge: "right" },
    { name: "P7", edge: "right" },
    { name: "P8", edge: "bottom" },
  ];
  const perEdge = new Map<PortEdgeId, number>();
  const counts = new Map<PortEdgeId, number>();
  for (const item of layout) counts.set(item.edge, (counts.get(item.edge) ?? 0) + 1);
  const ports: Instance[] = layout.map((item, i) => {
    const order = perEdge.get(item.edge) ?? 0;
    perEdge.set(item.edge, order + 1);
    const ts = evenT(counts.get(item.edge) ?? 1, DEFAULT_ARRANGEMENT.spacing);
    return {
      id: `peport-${uid + i}`,
      type: "Port",
      props: {
        children: item.name,
        edge: item.edge,
        direction: item.edge === "left" || item.edge === "top" ? "input" : "output",
      },
      placements: { [DEFAULT_ARRANGEMENT.id]: { edge: item.edge, order, t: ts[order]! } },
    };
  });
  const arrangement: Arrangement = {
    ...DEFAULT_ARRANGEMENT,
    grouping: {
      id: "pair",
      label: "Pair",
      collapsed: false,
      assignments: {
        [ports[1]!.id]: { group: "pair", groupOrder: 1 },
        [ports[2]!.id]: { group: "pair", groupOrder: 2 },
      },
    },
  };
  return {
    host: {
      ...host,
      arrangements: [arrangement],
      arrangement: arrangement.id,
      members: [...(host.members ?? []), ...ports.map((p) => p.id)],
    },
    ports,
  };
}

export const INITIAL_BENCHES: Record<string, Instance[]> = (() => {
  const seeded: Record<string, Instance[]> = {};
  let n = 0;
  for (const entry of REGISTRY) {
    const made = makeInstanceWithSlots(entry.name, 0, n);
    n += made.length;
    if (entry.name === "Block") {
      const { block, ports } = seedBlockPorts(made[0]!, n);
      n += ports.length;
      seeded[entry.name] = [block, ...made.slice(1), ...ports];
      continue;
    }
    if (entry.name === "PortEdges") {
      const { host, ports } = seedPortEdges(made[0]!, n);
      n += ports.length;
      seeded[entry.name] = [host, ...made.slice(1), ...ports];
      continue;
    }
    seeded[entry.name] = made;
  }
  seeded[MIXED_BENCH] = [makeInstance("Port", 0, n++), makeInstance("Pill", 0, n++)];
  return seeded;
})();

export const INITIAL_UID = Object.values(INITIAL_BENCHES).reduce((n, list) => n + list.length, 0);
