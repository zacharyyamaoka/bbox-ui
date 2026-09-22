// src/components/frame.layout.ts — the pure geometry under `Frame`
// (./frame.tsx): where its four port edges sit, how a point ALONG A WALL
// becomes a slot on that wall's rail (auto order or a custom offset), and
// how an auto-fit frame sizes itself around its members.
//
// Zach, 2026-09-22 ("Getting the auto port edges"): "what the frame gives
// you is membership, inside and outside memberships, free vs stacked
// layout, edge to edge vs inset, custom vs auto fit... I think we want to
// associate all of that logic with the FRAME, not with a block." And on
// spacing: "Eventually if you have auto spacing it would look like. it
// detects the intersection point, adds a port, and then moves the port
// based on the spacing requirements..."
//
// ── WHAT IS NOT WRITTEN HERE ──────────────────────────────────────────
// The rail's box (`railBoxFor`), its cross size and insets (`RAIL_*`), and
// the spacing constraint of Custom mode (`constrainPortPositions`,
// `autoSlotOffsets`) are `blockPort.layout.ts`'s and `portSpacing.layout.
// ts`'s, called unchanged. This file only converts between the WALL's
// parameter (`t`, 0..1 along the wall, what a crossing reports) and the
// RAIL's parameter (a slot's leading edge in px inside the track's content
// box, what `PortEdge.freeOffsets` stores), and picks the insertion index
// for Auto mode. A second spacing engine here would be the "two
// derivations of one number" failure the spacing files already warn about.
//
// PROVENANCE: class (c), ours, ad hoc. `wallSlotOffset` is a linear remap
// plus a clamp; `insertPortAtWall` composes `insertionIndex`-style ordering
// with the existing constraint function; `fitBoxToMembers` is a bounding
// box plus padding. No prior art claimed.
//
// Pure: no React, no DOM.

import type { BlockSide } from "./port.layout";
import { PORT_EDGE_SLOT_MIN_PX, RAIL_END_MARGIN_PX, RAIL_MAIN_INSET_PX, railAxisFor, railBoxFor, type BlockBands, type RailBox, type RailPlan } from "./blockPort.layout";
import type { Distribution } from "./portEdge.layout";
import { autoSlotOffsets, constrainPortPositions, MIN_PORT_GAP_PX, type CustomNeighbourMode } from "./portSpacing.layout";

/* ------------------------------------------------------------------ */
/* Faces — the naming half; the directions live in scene/wallPort.ts   */
/* ------------------------------------------------------------------ */

export const OPPOSITE_SIDE: Record<BlockSide, BlockSide> = { left: "right", right: "left", top: "bottom", bottom: "top" };

/**
 * A wall port has TWO faces: the outer one an outside cable meets, and the
 * inner one a member's cable meets — and they point opposite ways along
 * the wall's normal (52a1b92 `wallPort.ts` :21-37, "A WALL PORT HAS TWO
 * FACES": `WireLayer` derives a terminal's direction from the rail its dot
 * is mounted on, so a single-faced dot would send the inner cable back out
 * through the wall). The outer face is the port's own id; the inner face is
 * a second handle on the SAME node, named with this suffix. `@` is never a
 * `portKey` separator (`/`) and never a character this kit mints into a
 * port id, so `p@inner` cannot collide with a real port.
 */
export const INNER_FACE_SUFFIX = "@inner";

export function innerFaceHandle(portId: string): string {
  return `${portId}${INNER_FACE_SUFFIX}`;
}

export function isInnerFaceHandle(handle: string | null | undefined): boolean {
  return typeof handle === "string" && handle.endsWith(INNER_FACE_SUFFIX) && handle.length > INNER_FACE_SUFFIX.length;
}

/** `p@inner` → `p`; any other handle → itself. Naming only — whether the
 *  string IS an inner face is a structural question the scene answers
 *  (`scene/wallPort.ts`'s `withWallFaces`, `hosts/frameScene.ts`'s
 *  `resolveWallHandle`): an authored port spelt this way is its own port. */
export function outerPortIdOf(handle: string): string {
  return isInnerFaceHandle(handle) ? handle.slice(0, -INNER_FACE_SUFFIX.length) : handle;
}

/**
 * The face marker is a RESERVED namespace for ids this kit mints (judge
 * round 1, finding 7): a port id a host is about to mint may not contain it,
 * or `<that id>` and `<some port>@inner` would be one string with two
 * meanings. Enforced where wall ports are ingested (`addWallPort` refuses
 * such an id); an id that was AUTHORED this way before the rule keeps its
 * one authored meaning through structural resolution instead.
 */
export function isReservedPortId(portId: string): boolean {
  return portId.includes(INNER_FACE_SUFFIX);
}

/* ------------------------------------------------------------------ */
/* The frame's box, as bands                                           */
/* ------------------------------------------------------------------ */

/** A frame's measured box, in the frame ROOT's own px (the element that
 *  carries `data-block-id`), plus its header band when the title is drawn
 *  as a header bar inside the box. */
export interface FrameBox {
  left: number;
  top: number;
  width: number;
  height: number;
  /** The header bar's height inside the box; 0 with the title above or
   *  absent. */
  headerPx: number;
}

/**
 * The frame's box as `railBoxFor`'s `BlockBands`: the body band is the box
 * minus its header. A frame has no footer.
 */
export function frameBands(box: FrameBox): BlockBands {
  return {
    blockLeft: box.left,
    blockTop: box.top,
    blockWidth: box.width,
    blockHeight: box.height,
    bodyTop: box.top + box.headerPx,
    bodyBottom: box.top + box.height,
    ...(box.headerPx > 0 ? { headerTop: box.top } : {}),
  };
}

/**
 * The frame's rail plan for `side`: every wall spans its own full length
 * with the donor's constant corner clearance (`RAIL_END_MARGIN_PX`, the
 * gaps at the corners in Zach's sketch), distributed `space-evenly` — the
 * expanded-view rule `railPlanFor` already applies to column walls — with
 * the caller's `distribution` winning when given. Column walls run in the
 * BODY band (under a header bar), row walls the whole box.
 */
export function frameRailPlan(side: BlockSide, distribution?: Distribution): RailPlan {
  return {
    distribution: distribution ?? { mode: "distribute", scheme: "space-evenly" },
    groups: "",
    groupMode: "off",
    band: railAxisFor(side) === "column" ? "body" : "block",
    endMarginPx: RAIL_END_MARGIN_PX,
    collapsed: false,
  };
}

/** Where the rail for `side` sits in the frame root's px — `railBoxFor`
 *  over the frame's bands, nothing of its own. */
export function frameRailBox(side: BlockSide, box: FrameBox, distribution?: Distribution): RailBox {
  return railBoxFor(side, frameRailPlan(side, distribution), frameBands(box));
}

/** The rail's CONTENT box along its main axis — where slot offsets are
 *  measured from and how long the track is — in the frame root's px. */
export interface WallTrack {
  /** Main-axis start of the track's content box, in root px. */
  contentStart: number;
  /** Main-axis length of the content box. */
  contentLength: number;
  /** Main-axis start of the WALL itself (the box edge), in root px. */
  wallStart: number;
  /** The wall's full length. */
  wallLength: number;
}

export function wallTrack(side: BlockSide, box: FrameBox, distribution?: Distribution): WallTrack {
  const rail = frameRailBox(side, box, distribution);
  const column = railAxisFor(side) === "column";
  return {
    contentStart: (column ? rail.top : rail.left) + RAIL_MAIN_INSET_PX,
    contentLength: (column ? rail.height : rail.width) - 2 * RAIL_MAIN_INSET_PX,
    wallStart: column ? box.top : box.left,
    wallLength: column ? box.height : box.width,
  };
}

/* ------------------------------------------------------------------ */
/* t on the wall ↔ a slot on the rail                                  */
/* ------------------------------------------------------------------ */

/**
 * The slot LEADING EDGE (px from the track's content start — the unit
 * `PortEdge.freeOffsets` stores) whose dot centre lands at `t` along the
 * wall, clamped so the whole slot stays inside the track.
 *
 * WHY clamped and not refused: a crossing right at a corner (`t` ≈ 0 or 1)
 * is a real crossing; the port it becomes simply parks at the end of the
 * track, which is the nearest place a port can be. `constrainPortPositions`
 * then clamps it again against its neighbours and the minimum gap.
 */
export function wallSlotOffset(t: number, track: WallTrack, slotMainPx: number = PORT_EDGE_SLOT_MIN_PX): number {
  const centre = track.wallStart + t * track.wallLength - track.contentStart;
  const leading = centre - slotMainPx / 2;
  return Math.min(Math.max(leading, 0), Math.max(track.contentLength - slotMainPx, 0));
}

/** The inverse: the wall `t` a slot at `offset` (its leading edge) centres
 *  on. Used by the auto-mode insertion to rank the existing ports. */
export function wallTOfSlot(offset: number, track: WallTrack, slotMainPx: number = PORT_EDGE_SLOT_MIN_PX): number {
  if (!(track.wallLength > 0)) return 0;
  const centre = track.contentStart + offset + slotMainPx / 2;
  return (centre - track.wallStart) / track.wallLength;
}

export interface InsertPortAtWallInput {
  /** The wall's current port order. */
  order: readonly string[];
  /** Custom mode's stored offsets (ignored in auto mode). */
  offsets?: Readonly<Record<string, number>>;
  mode: "auto" | "custom";
  /** The wall's `Distribution` — what auto mode positions from. */
  distribution: Distribution;
  track: WallTrack;
  /** The new port's id and where the crossing met the wall. */
  id: string;
  t: number;
  slotMainPx?: number;
  minGap?: number;
  neighbour?: CustomNeighbourMode;
}

export interface InsertPortAtWallResult {
  /** The new order, the new port in it. */
  order: string[];
  /** Custom mode: every port's leading edge after the insertion, the new
   *  one clamped by order and minimum gap. Auto mode: the auto layout's
   *  own offsets for the new order — informational, a `PortEdge` in auto
   *  mode derives them itself. */
  offsets: Record<string, number>;
  /** Where the new port actually landed, 0..1 along the wall. */
  t: number;
}

/**
 * Insert port `id` where a crossing met the wall at `t`.
 *
 *   AUTO   — "lands at the intersection, then the edge re-spaces it": the
 *            index is where `t` falls among the EXISTING ports' centres
 *            (the auto layout's own), and the returned offsets are the
 *            auto layout for the new order — the port has moved to its
 *            evenly-spaced slot, which is the whole point of auto.
 *   CUSTOM — "stays at the intersection, clamped by order and minimum
 *            spacing": the same index (order is by position in Custom too),
 *            the new port's requested offset is the crossing's, and
 *            `constrainPortPositions` clamps it against its neighbours.
 *
 * Total: an `id` already on the wall returns the wall unchanged.
 */
export function insertPortAtWall(input: InsertPortAtWallInput): InsertPortAtWallResult {
  const { order, mode, distribution, track, id, t } = input;
  const slotMainPx = input.slotMainPx ?? PORT_EDGE_SLOT_MIN_PX;
  const minGap = input.minGap ?? MIN_PORT_GAP_PX;
  const sizes = Object.fromEntries(order.map((portId) => [portId, slotMainPx]));
  const current =
    mode === "custom" && input.offsets
      ? constrainPortPositions({ ...input.offsets }, { order: [...order], minGap, span: track.contentLength, slotSize: slotMainPx, mode: input.neighbour ?? "stop" }).offsets
      : autoSlotOffsets([...order], sizes, track.contentLength, distribution);
  if (order.includes(id)) return { order: [...order], offsets: current, t: wallTOfSlot(current[id] ?? 0, track, slotMainPx) };

  const existingTs = order.map((portId) => wallTOfSlot(current[portId] ?? 0, track, slotMainPx));
  const at = existingTs.findIndex((existing) => existing > t);
  const index = at === -1 ? order.length : at;
  const nextOrder = [...order.slice(0, index), id, ...order.slice(index)];

  if (mode === "auto") {
    const offsets = autoSlotOffsets(nextOrder, { ...sizes, [id]: slotMainPx }, track.contentLength, distribution);
    return { order: nextOrder, offsets, t: wallTOfSlot(offsets[id], track, slotMainPx) };
  }
  const requested = { ...current, [id]: wallSlotOffset(t, track, slotMainPx) };
  const { offsets } = constrainPortPositions(requested, {
    order: nextOrder,
    minGap,
    span: track.contentLength,
    slotSize: slotMainPx,
    mode: input.neighbour ?? "stop",
    active: id,
  });
  return { order: nextOrder, offsets, t: wallTOfSlot(offsets[id], track, slotMainPx) };
}

/* ------------------------------------------------------------------ */
/* Auto fit — the frame hugs its members                               */
/* ------------------------------------------------------------------ */

export interface MemberBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The smallest box, in the members region's own px, that holds every
 * member with `padding` of air around the union — never smaller than
 * `min`. Members are measured by the component (rendered boxes), which is
 * the same legality `blockPort.tsx`'s band measuring and `scene/
 * fitToContent.ts`'s `blockExpandedFitHeight` already rely on; the
 * arithmetic on the measurements is here.
 */
export function fitBoxToMembers(members: readonly MemberBox[], padding: number, min: { width: number; height: number }): { width: number; height: number } {
  if (members.length === 0) return { width: min.width, height: min.height };
  let right = 0;
  let bottom = 0;
  for (const member of members) {
    right = Math.max(right, member.x + member.w);
    bottom = Math.max(bottom, member.y + member.h);
  }
  return { width: Math.max(min.width, right + padding), height: Math.max(min.height, bottom + padding) };
}
