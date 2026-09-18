/**
 * src/components/blockPort.layout.ts — the pure half of `BlockPort`
 * (docs/BLOCK-PORT-EDGES-PLAN.md §2/§3, phase A1).
 *
 * Two jobs, both closed-form and both unit-testable without a DOM:
 *
 *  1. `railPlanFor` — the view→placement rules, RESTATED AS PortEdge PROPS.
 *     SystemSketch's `layoutBlock.ts` is the target spec for the behaviour
 *     (each row below cites the donor line it reproduces); not one line of
 *     it is ported. The governing principle (Zach, 2026-09-17): "System
 *     sketch is a great reference for the target spec, but we need to
 *     refactor to use our component based approach." A layout problem
 *     `portEdge.tsx` already solves is expressed as its props, never
 *     re-implemented here.
 *
 *  2. `railBoxFor` — where the rail sits and how long it is, given the
 *     Block's MEASURED bands (D-A5: a Block hugs its content, so any closed
 *     form over props lies the moment a header wraps). The measuring is the
 *     component's, app-level and legal here (the D8 precedent — the app may
 *     measure itself, the core may not); the arithmetic on those measured
 *     numbers is pure and lives here.
 *
 * WHY a rail's CONTENT box — not its border box — is what spans the band:
 * `PortEdge`'s track carries its own `CONTAINER_BORDER` + `CONTAINER_PADDING`
 * before the first slot box, so a rail laid flush with the band would start
 * its first dot 16px further in than the band top and the "packed from the
 * body top" rule would quietly become "packed from 16px below the body top".
 * Insetting the border box by `RAIL_MAIN_INSET_PX` makes the stated rule the
 * measured one: first dot centre at `bandTop + slotMainPx / 2`, exactly.
 */
import { PORT_DIAMETERS, PORT_LABEL_GAP, PORT_RING_OVERHANG_PX, type BlockSide, type PortSize } from "./port.layout";
import { CONTAINER_BORDER, CONTAINER_PADDING, DEFAULT_ALIGN_GAP, type Distribution } from "./portEdge.layout";

/* ------------------------------------------------------------------ */
/* Vocabulary — the donor's own two enums, by value                    */
/* ------------------------------------------------------------------ */

/** Donor `BLOCK_PRESENTATION_VIEWS` (`blockModel.ts:96`). */
export type BlockView = "simple" | "port" | "expanded";
export const BLOCK_VIEWS: BlockView[] = ["simple", "port", "expanded"];
export const BLOCK_VIEW_LABELS: Record<BlockView, string> = {
  simple: "Simple",
  port: "Port",
  expanded: "Expanded",
};

/** Donor `PORT_LAYOUTS` (`blockModel.ts:106`); default `inline`
 *  (`blockModel.ts:622`). */
export type BlockPortLayout = "inline" | "offset";
export const BLOCK_PORT_LAYOUTS: BlockPortLayout[] = ["inline", "offset"];
export const BLOCK_PORT_LAYOUT_LABELS: Record<BlockPortLayout, string> = {
  inline: "Inline",
  offset: "Offset",
};

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/**
 * The main-axis size of ONE slot box on a rail.
 *
 * WHY this is re-declared instead of imported: it mirrors `portEdge.tsx`'s
 * module-private `EMPTY_SLOT_MIN_PX`, the size a slot takes when `showCard`
 * is false — which is exactly how a rail is configured (`BlockPort` never
 * turns cards on, since the Block itself is the card). `portEdge.tsx` does
 * not export it, and A1 is authorised exactly one surgical edit to that file
 * (D-A7's `renderCollapsed`), which this is not.
 *
 * A duplicated constant that must match is only safe if a mismatch is loud,
 * so it is pinned where a drift fails rather than hides: the dormant unit
 * test's own case, and — the one that runs today — `BlockPort.stories.tsx`'s
 * `ClassicDag`, which MEASURES a rendered `[data-slot="port-edge-member"]`
 * box and asserts it equals this number. Change `EMPTY_SLOT_MIN_PX` without
 * changing this and that story goes red.
 */
export const PORT_EDGE_SLOT_MIN_PX = 24;

/** The gap between adjacent slot boxes on an `aligned` rail — PortEdge's
 *  own default align gap, reused rather than a second number. */
export const RAIL_GAP_PX = DEFAULT_ALIGN_GAP;

/**
 * Constant clearance between a wall's first/last dot and the block's corner,
 * on a spread rail. Donor `RAIL_END_MARGIN_PX` (`layoutBlock.ts:115`, used
 * by `placeHorizontalRails`); the donor's own test pins the *property* that
 * this margin stays constant regardless of block size
 * (`portLensPlacement.test.ts:189-198`), which is why it is a constant here
 * too and not a fraction of the wall.
 */
export const RAIL_END_MARGIN_PX = 18;

/** How far into a `PortEdge` track's border box its first slot box starts:
 *  the track's own border plus its own padding. */
export const RAIL_MAIN_INSET_PX = CONTAINER_BORDER + CONTAINER_PADDING;

/**
 * The rail's CROSS-axis size. Half of it is what the rail is pushed out by,
 * so the track's cross centre — which `alignItems: center` already puts
 * every dot on (`portEdge.tsx`'s track style) — lands exactly on the
 * Block's border line. Derived, never a literal.
 */
export const RAIL_CROSS_PX = PORT_EDGE_SLOT_MIN_PX + 2 * RAIL_MAIN_INSET_PX;

/**
 * Which edge `portLayout: "offset"` pushes down. The donor offsets the
 * OUTPUT lane (`outputStart = slot + inputs.length`, `layoutBlock.ts:461`)
 * and outputs live on the right wall (`portSideForDirection`), so "offset"
 * is a statement about the right edge specifically — not about "whichever
 * edge you happened to declare second".
 */
export const OFFSET_TRAILING_EDGE: BlockSide = "right";

export function railAxisFor(edge: BlockSide): "row" | "column" {
  return edge === "left" || edge === "right" ? "column" : "row";
}

/** Centre-to-centre distance between adjacent dots on an `aligned` rail. */
export function railPitchPx(slotMainPx: number = PORT_EDGE_SLOT_MIN_PX, gap: number = RAIL_GAP_PX): number {
  return slotMainPx + gap;
}

/**
 * §4b·S4 / D-A3 — the EXACT push-in that puts the trailing lane's first
 * port one full pitch below the leading lane's last port, which is what the
 * donor's `outputStart = slot + inputs.length` means in pixels.
 *
 * `portEdge.layout.ts`'s `offsetPaddingFor` is a self-described
 * approximation (`count * gap`, "ignores card size") with zero call sites;
 * it is deliberately neither used nor deleted here. The difference is not
 * cosmetic: with today's numbers it under-shoots by `leadCount * slotMainPx`
 * — 72px on a three-port lane — so the two lanes would visibly interleave
 * instead of one starting below the other.
 */
export function offsetEdgePaddingPx(
  leadCount: number,
  slotMainPx: number = PORT_EDGE_SLOT_MIN_PX,
  gap: number = RAIL_GAP_PX,
): number {
  return Math.max(0, leadCount) * (slotMainPx + gap);
}

/* ------------------------------------------------------------------ */
/* railPlanFor — the view→placement table, as PortEdge props           */
/* ------------------------------------------------------------------ */

/** Which of the Block's bands a rail's content box spans. */
export type RailBand = "block" | "body";

export interface RailPlanInput {
  view: BlockView;
  /** Port view only; ignored elsewhere. */
  portLayout: BlockPortLayout;
  edge: BlockSide;
  /** Every port id on THIS edge, in order. */
  itemIds: string[];
  /** Ports on the lane this edge is offset behind — the left edge's count,
   *  when planning the right edge under `portLayout: "offset"`. */
  leadCount: number;
  /** `view === "simple"` by default; the async gallery passes false so a
   *  Simple face spreads its ports along the walls instead of collapsing
   *  them (donor `layoutBlock.ts:1286-1296`). */
  collapsePorts: boolean;
  /**
   * E-3 (Zach, 2026-09-17): every populated edge on the BLOCK, not just this
   * one — "port" view's spacing default depends on the SET ("if port edges
   * on all 4 sides... distribute and around. if port edges just on left or
   * right... aligned to edge and to the start"), and a single edge cannot
   * see its siblings to answer that on its own. Optional, defaulting to
   * `[edge]` (this edge and no sibling), so an existing caller that only
   * ever planned one edge at a time — `blockPort.layout.test.ts`'s own
   * fixtures, `BlockPortLane.stories.tsx`'s lane-availability probe — keeps
   * its prior single-edge reading with no call-site change required.
   * `BlockPort` (blockPort.tsx) is the one caller that DOES see every edge,
   * and always passes the real set.
   */
  populatedEdges?: BlockSide[];
}

/** Exactly the subset of `PortEdgeProps` a view rule decides, plus the two
 *  geometry facts `railBoxFor` needs. Nothing here is a new layout
 *  primitive — every field is a prop `PortEdge` already shipped. */
export interface RailPlan {
  distribution: Distribution;
  groups: string;
  groupMode: "off" | "grouped" | "collapsed";
  band: RailBand;
  /** Main-axis inset applied to the rail's CONTENT box at both ends. */
  endMarginPx: number;
  /** True when this rail draws one stand-in dot for the whole wall. */
  collapsed: boolean;
}

/**
 * The four view rules of docs/BLOCK-PORT-EDGES-PLAN.md §3, and nothing else.
 * Every branch returns props `PortEdge` already understands.
 *
 * | rule             | donor spec (target behaviour)                        | props returned here                                       |
 * |------------------|------------------------------------------------------|-----------------------------------------------------------|
 * | simple           | all ports coincident at `height / 2`                 | `groupMode:"collapsed"` + a groups line naming every id,   |
 * |                  | (`layoutBlock.ts:1282,1301-1330`)                    | `distribute / space-evenly`, rail over the whole block     |
 * | port + inline    | input row i and output row i share a slot            | both rails `aligned / start / gap`, `edgePadding: 0`       |
 * |                  | (`planBodySlots`, `:461`), packed from the body top  |                                                            |
 * |                  | (`:1434-1435`)                                       |                                                            |
 * | port + offset    | outputs start at slot `inputs.length` (`:461`)       | right rail's `edgePadding = leadCount * (slot + gap)`      |
 * | port + populated | a populated top/bottom wall anywhere on the block    | EVERY edge `distribute / space-around` (E-3 below)         |
 * | top/bottom       |                                                       |                                                             |
 * | expanded         | evenly across the section (`:592`)                   | both rails `distribute / space-evenly`, body band          |
 * | spread-on-simple | walls, constant 18px end margin (`:1286-1296`)       | `distribute / space-between` + `RAIL_END_MARGIN_PX`        |
 *
 * WHY `space-evenly` and not `space-between` for the collapsed slot: with a
 * single box `mainAxisPositions` returns `[0]` for `space-between` (pinning
 * it to the top of the rail) and `[free / 2]` for `space-evenly` — and the
 * donor's midpoint is the entire point of simple view.
 *
 * WHY top/bottom walls ignore `view` when choosing their BAND (not their
 * distribution — see E-3 below): a horizontal rail has no "body band" to
 * speak of — the donor spreads them along the full wall with a constant end
 * margin in every view (`placeHorizontalRails`). Only the collapse case
 * differs, and it differs the same way on every wall.
 *
 * E-3 (Zach, 2026-09-17): "if port edges on all 4 sides. then the edges
 * should all be distribute and around. if port edges just on left or right,
 * then it should be aligned to edge and to the start... (thats the classic
 * port view of course then in expanded we do distribute)." So in PORT view
 * specifically, the whole block's set of populated edges — `populatedEdges`
 * — decides every populated edge's distribution, not the view alone: a
 * populated top or bottom wall (including a row-axis edge's own trivial
 * membership in that set — a top rail's plan IS itself "a populated top
 * wall") switches every populated edge, left/right included, to
 * `distribute/space-around`; left/right-only stays the existing
 * `aligned/start` pairing. "if there is only 1 port it should be in the
 * middle" needs no special case — `mainAxisPositions`' own `space-around`
 * branch already centres a lone box (`portEdge.layout.ts`'s own docblock
 * quotes the CSS spec on exactly this). "in expanded we do distribute" is
 * an acknowledgement, not a second case to build — `view === "expanded"`
 * already always distributes, below, untouched by this rule.
 */
export function railPlanFor(input: RailPlanInput): RailPlan {
  const { view, portLayout, edge, itemIds, leadCount, collapsePorts, populatedEdges = [edge] } = input;

  if (view === "simple" && collapsePorts) {
    return {
      // Every id on one line: `computeSlots` clusters them into ONE slot, so
      // the whole wall renders as a single box. A line naming fewer than two
      // known ids is dropped by the parser (a group of one is just an
      // ungrouped port) — harmless, because a one-port wall is already one
      // slot, and `BlockPort` draws it the same bare dot either way.
      groups: itemIds.join(", "),
      groupMode: "collapsed",
      distribution: { mode: "distribute", scheme: "space-evenly" },
      band: "block",
      endMarginPx: 0,
      collapsed: true,
    };
  }

  if (view === "port") {
    const hasHorizontalWall = populatedEdges.some((e) => e === "top" || e === "bottom");
    if (hasHorizontalWall) {
      const row = railAxisFor(edge) === "row";
      return {
        groups: "",
        groupMode: "off",
        distribution: { mode: "distribute", scheme: "space-around" },
        // Row-axis rails keep spanning the whole block — the band a
        // horizontal wall has always used (see the WHY above); column-axis
        // rails stay in the body band exactly as the left/right-only case
        // below does. Only the SCHEME changed, never where the rail sits.
        band: row ? "block" : "body",
        endMarginPx: row ? RAIL_END_MARGIN_PX : 0,
        collapsed: false,
      };
    }
    // Left/right only, no sibling top/bottom wall — the pre-E-3 pairing,
    // unchanged.
    const offset = portLayout === "offset" && edge === OFFSET_TRAILING_EDGE;
    return {
      groups: "",
      groupMode: "off",
      distribution: {
        mode: "aligned",
        anchor: "start",
        gap: RAIL_GAP_PX,
        edgePadding: offset ? offsetEdgePaddingPx(leadCount) : 0,
      },
      band: "body",
      endMarginPx: 0,
      collapsed: false,
    };
  }

  // Spread-on-simple, and every horizontal wall OUTSIDE port view: along
  // the whole wall, with the donor's constant corner clearance.
  if (view === "simple" || railAxisFor(edge) === "row") {
    return {
      groups: "",
      groupMode: "off",
      distribution: { mode: "distribute", scheme: "space-between" },
      band: "block",
      endMarginPx: RAIL_END_MARGIN_PX,
      collapsed: false,
    };
  }

  // view === "expanded", column axis (row axis was already handled above)
  return {
    groups: "",
    groupMode: "off",
    distribution: { mode: "distribute", scheme: "space-evenly" },
    band: "body",
    endMarginPx: 0,
    collapsed: false,
  };
}

/* ------------------------------------------------------------------ */
/* railBoxFor — where the rail sits, from the Block's measured bands    */
/* ------------------------------------------------------------------ */

/**
 * The Block's geometry as `BlockPort`'s wrapper sees it — every number in
 * WRAPPER-LOCAL pixels, so a rail can be positioned with plain `left`/`top`.
 * `bodyTop`/`bodyBottom` bound the band between header and footer (the
 * region holding body and members), which is what the donor calls the body
 * section. `headerTop` is undefined when the Block renders no header at
 * all — the function port (see `functionPortCenterPx` below) has nowhere
 * to sit in that case and stays unrendered rather than degrading to some
 * other line.
 */
export interface BlockBands {
  blockLeft: number;
  blockTop: number;
  blockWidth: number;
  blockHeight: number;
  bodyTop: number;
  bodyBottom: number;
  headerTop?: number;
}

export interface RailBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The rail's border box, positioned so that (a) its cross centre lands on
 * the Block's border line and (b) its CONTENT box spans exactly the planned
 * band, inset by `endMarginPx` at each end.
 */
export function railBoxFor(edge: BlockSide, plan: RailPlan, bands: BlockBands): RailBox {
  const axis = railAxisFor(edge);

  if (axis === "column") {
    const bandStart = plan.band === "body" ? bands.bodyTop : bands.blockTop;
    const bandEnd = plan.band === "body" ? bands.bodyBottom : bands.blockTop + bands.blockHeight;
    const contentStart = bandStart + plan.endMarginPx;
    const contentEnd = bandEnd - plan.endMarginPx;
    const borderLine = edge === "left" ? bands.blockLeft : bands.blockLeft + bands.blockWidth;
    return {
      left: borderLine - RAIL_CROSS_PX / 2,
      top: contentStart - RAIL_MAIN_INSET_PX,
      width: RAIL_CROSS_PX,
      height: Math.max(contentEnd - contentStart, 0) + 2 * RAIL_MAIN_INSET_PX,
    };
  }

  const contentStart = bands.blockLeft + plan.endMarginPx;
  const contentEnd = bands.blockLeft + bands.blockWidth - plan.endMarginPx;
  const borderLine = edge === "top" ? bands.blockTop : bands.blockTop + bands.blockHeight;
  return {
    left: contentStart - RAIL_MAIN_INSET_PX,
    top: borderLine - RAIL_CROSS_PX / 2,
    width: Math.max(contentEnd - contentStart, 0) + 2 * RAIL_MAIN_INSET_PX,
    height: RAIL_CROSS_PX,
  };
}

/**
 * Where an `aligned` rail's first dot CENTRE lands along the main axis, in
 * wrapper-local px — the closed form the stories assert against, so the
 * stated rule ("packed from the body top") and the measured rule are the
 * same sentence. Returns `null` for a `distribute` plan, whose positions
 * depend on the rail's own length and are measured instead.
 */
export function alignedFirstCentrePx(
  plan: RailPlan,
  bands: BlockBands,
  slotMainPx: number = PORT_EDGE_SLOT_MIN_PX,
): number | null {
  if (plan.distribution.mode !== "aligned") return null;
  const bandStart = plan.band === "body" ? bands.bodyTop : bands.blockTop;
  return bandStart + plan.endMarginPx + plan.distribution.edgePadding + slotMainPx / 2;
}

/* ------------------------------------------------------------------ */
/* functionPortCenterPx — the header's reserved pin-1 port              */
/* ------------------------------------------------------------------ */

/**
 * Where the function port's dot CENTRE lands, in wrapper-local px: on the
 * Block's left border line (`blockLeft`, the same wall convention every
 * rail dot straddles — see `railBoxFor`'s column-axis case), vertically at
 * the header band's own centre line (`headerTop`..`bodyTop`, since
 * `bodyTop` IS the header's bottom edge whenever a header exists — see
 * `BlockBands`'s own doc).
 *
 * Zach, 2026-09-17 (a variable that is itself a function reserves "a
 * special port on the header left edge... at most 1 port there and you
 * cannot move it"): position is what carries the meaning, so this is a
 * closed form, not a slot in a `PortEdge` distribution — there is no
 * `RailPlan` for it and it never becomes one.
 *
 * Returns `null` when the Block renders no header (`headerTop` absent) —
 * there is no header centre line to sit on.
 */
export function functionPortCenterPx(bands: BlockBands): { x: number; y: number } | null {
  if (bands.headerTop == null) return null;
  return { x: bands.blockLeft, y: (bands.headerTop + bands.bodyTop) / 2 };
}

/* ------------------------------------------------------------------ */
/* functionPortHeaderInsetPx — where the header's OWN content starts     */
/* (D-5)                                                                */
/* ------------------------------------------------------------------ */

/**
 * How far a header's own content must sit from the Block's left wall so it
 * starts exactly where a body port's LABEL would start — not where the
 * port's DOT does. Zach's screenshot (153855) draws this literally: a red
 * line runs through "Planner" and through "gain"/"reset"/"pose" below it —
 * the labels, not the dots — captioned "offset is same as ports.."
 *
 * A body port on the left wall centres its DOT on `blockLeft`
 * (`functionPortCenterPx`'s own note; `railBoxFor`'s column-axis case puts
 * every rail's cross-centre on the same line), and `LabeledPort`
 * (labeledPort.tsx) anchors its label `PORT_RING_OVERHANG_PX +
 * PORT_LABEL_GAP` clear of the dot's own RING, past the dot's radius — so
 * the label's left edge sits exactly `radius + PORT_RING_OVERHANG_PX +
 * PORT_LABEL_GAP` past `blockLeft`. That delta does not depend on the
 * Block's box at all — the dot and the header both start flush on the same
 * wall — so it is a closed form over the port's OWN diameter, not a value
 * read off `BlockBands`, and it is exactly what "if there is no label then
 * the bar content should start where the label WOULD start" asks for: the
 * number is the same whether a real label is rendered or not.
 *
 * `BlockPort` itself never touches a header's content (D-A1's own rule —
 * `Block` is composed from the outside) — this is the number a CALLER
 * applies to its own header content, e.g. as a `<Bar style={{ paddingLeft:
 * functionPortHeaderInsetPx(diameter) }}>`'s explicit inline override of
 * `Bar`'s own `px-3` gutter (bar.tsx's own public `style` escape hatch,
 * not a hardcoded pixel — see `BlockPort.stories.tsx`'s
 * `FunctionPortHeaderInset`).
 */
export function functionPortHeaderInsetPx(diameter: PortSize = "md"): number {
  const diameterPx = typeof diameter === "number" ? diameter : PORT_DIAMETERS[diameter];
  return diameterPx / 2 + PORT_RING_OVERHANG_PX + PORT_LABEL_GAP;
}
