// src/shapes/shared/props.ts — the validators every persisted prop shares
// (docs/SYSTEMSKETCH-REBUILD-PLAN.md §3). tldraw's `T.*` is what makes a
// `.tldr` trustworthy: a record that does not validate never enters the
// store, so these three objects are the actual schema streams 3 and 4 write
// against.
//
// WHY the shared file rather than a copy per shape: `ss-block` and `ss-port`
// both carry `anchors`, and the day the anchor shape changes it has to change
// in ONE place or a half-migrated board validates on one shape and throws on
// the other.
import { T } from "tldraw";

import type { SlotOrigin } from "@trunk/components/port.layout";
import type { SpacingScheme } from "@trunk/components/portEdge.layout";
import type { PortEdgeArrangeMode } from "@trunk/components/portEdge";

/**
 * One declared port. A PAIR, not a triple: `id` is what a wire binding names,
 * and `declaration` is the one line the port's CodeEditor edits — `frame` or
 * `frame: Frame`.
 *
 * WHY there is no third `type` field, which is what this validator carried
 * until 2026-09-21 (ruling 8). Zach: "right now we just support by default
 * only a single line CodeEditor, we don't have this cnocept of Type as a
 * seperate thing.. You can parse it from the CodeEditor though for what
 * follows the : it just python". The type is DERIVED on read
 * (`@trunk/scene/portDeclaration`'s `portTypeOfDeclaration`), never stored
 * beside the name.
 *
 * What that rejects is not hypothetical: with `type` stored separately, the
 * only writer of it in the whole app was a fixture or the pyblocks backend.
 * `PortFace`'s rename session edited `props.name` alone, so a type on a board
 * could be READ by `lintScene` and painted on a free port, and could not be
 * changed by the person looking at it. Folding it into the line gives it an
 * editing surface for free — you type the `: float`.
 */
export const PortSpecV = T.object({
  id: T.string,
  declaration: T.string,
});

/**
 * A MEASURED dot centre, in shape-local px.
 *
 * WHY measured numbers and not a DOM lookup (lifted from
 * hosts/tldrawHost.tsx:19-31): tldraw paints edges in PAGE space, where no
 * DOM element of the shape exists at paint time. So the host sights each dot
 * once per layout change and stores the reading as plain numbers, which
 * survive pan, zoom AND rotation because they are projected through the
 * editor's own camera math rather than a rect ratio.
 *
 * `side` is `null` for a dot outside any rail — honest, rather than guessing
 * a wall for it.
 */
export const PortAnchorV = T.object({
  portId: T.string,
  x: T.number,
  y: T.number,
  side: T.nullable(T.literalEnum("top", "right", "bottom", "left")),
});

export const PointV = T.object({ x: T.number, y: T.number });

/**
 * One authored corner of an elbow cable (P-028), in the exact shape the
 * trunk's router persists: `@trunk/components/elbow/elbowPins.ts`'s
 * `ElbowPin`, which is itself a verbatim port of SystemSketch's.
 *
 * WHY the validator is spelled out here rather than derived from that type:
 * `T.*` is a RUNTIME wall — a `.tldr` written by pyblocks, by the archive, or
 * by a future version of this app has to be judged by a value, and a
 * TypeScript interface judges nothing. The two are pinned together by
 * `documentModel.test.ts`, which puts a real pin through the store, and by
 * `WireShapeProps.pins` being typed as `ElbowPin[]` — change the trunk's
 * interface and that assignment stops compiling.
 *
 * `axis` is the axis the SEGMENT runs along, so `"x"` (horizontal) means the
 * pin governs the segment's `y`. `t` is a fraction in the endpoint frame and
 * is deliberately NOT clamped to 0..1 here: the router's own `PIN_T_LIMIT`
 * (±6) is what bounds it, and a stricter wall here would reject a file the
 * router itself considers legal.
 */
export const ElbowPinV = T.object({
  index: T.number,
  axis: T.literalEnum("x", "y"),
  t: T.number,
  offset: T.number,
});

/* ------------------------------------------------------------------ */
/* Schema v2 (B-SCHEMA, docs/finish-2026-09-29/schema-inventory.md)   */
/* ------------------------------------------------------------------ */
//
// The validators below are the shared halves of the v2 props. Each one copies
// its vocabulary from the trunk type it names, value for value — the TS type
// is IMPORTED from the trunk, and `RecordProps<…>` on each ShapeUtil's
// `static props` is what fails `tsc` if the literal spelled here and the
// trunk's union ever disagree. The literals are spelled out (rather than
// spread from the trunk's runtime arrays) for the reason a shipped migration
// is frozen: a validator is what a SAVED board is judged by, so narrowing a
// trunk constant must not silently start refusing files that opened yesterday.
//
// Nothing in this lane READS any of these; the first reader of each is named
// in the inventory's "reads / writes" column.

/**
 * Where a port's label / secondary slot sits relative to its dot (P-119).
 * WHY these four and not P-119's "Left offset"/"Right offset" too: the trunk's
 * `SlotOrigin` (`components/port.layout.ts:250`) has four; two more need a
 * trunk design first (inventory §3). Widening needs no migration.
 */
export const SlotOriginV = T.literalEnum("top", "bottom", "left", "right");
export type { SlotOrigin };

/**
 * A remembered size for ONE block view (P-015/P-212). `null` = "never left
 * this view, so nothing is remembered" — `w`/`h` on the shape stay the live
 * box. WHY a nullable pair rather than numbers defaulting to the live box:
 * a default number would be a size the user never chose, and the first view
 * switch would "restore" it.
 */
export const ViewSizeV = T.nullable(T.object({ w: T.number, h: T.number }));
export interface ViewSize {
  w: number;
  h: number;
}

/** The fill override of one port (cluster 7 P-399): `auto` = derived from the
 *  bindings, exactly as `PortFace` / the rail paint it today. */
export const PortFillV = T.literalEnum("auto", "filled", "empty");
export type PortFill = "auto" | "filled" | "empty";

/**
 * One WALL of a block's port rail (P-118, cluster 8 P-356/P-269).
 *
 * `mode` is the trunk's own `PortEdgeArrangeMode` (`components/portEdge.tsx:122`)
 * and `spacing` its `SpacingScheme` (`components/portEdge.layout.ts:118`), with
 * `null` = "the view's own rule" (`railPlanFor`). `freeOffsets` is keyed by
 * port id — the trunk `PortEdge`'s own `freeOffsets` map — and is read only in
 * `custom` mode. WHY per wall: `PortEdge` is per wall, so "custom" is too.
 */
export const BlockRailV = T.object({
  enabled: T.boolean,
  mode: T.literalEnum("auto", "custom"),
  spacing: T.nullable(T.literalEnum("space-between", "space-evenly", "space-around")),
  freeOffsets: T.dict(T.string, T.number),
});
export interface BlockRail {
  enabled: boolean;
  mode: PortEdgeArrangeMode;
  spacing: SpacingScheme | null;
  freeOffsets: Record<string, number>;
}

/**
 * The per-port options of a RAIL port — a port declared on a block wall
 * (P-119; clusters 7 and 8: fill override, hidden, freeze lock, slot origins).
 *
 * WHY a block-level map keyed by port id (`ss-block.portOptions[id]`) and not
 * five more fields on `PortSpecV`: rail ports are not shapes, and `PortSpecV`
 * is the one port literal every writer in the app mints (`railLabel.ts`,
 * `cornerBlock.ts`, `edgeDropCatalog.ts`, the pyblocks backend). Growing it
 * would make every one of those literals invalid until it carried five
 * defaults; a keyed map leaves them all valid, and an ABSENT entry is the port
 * exactly as painted today. It is the same keyed pattern as the trunk's
 * `freeOffsets` above.
 */
export const RailPortOptionsV = T.object({
  fill: PortFillV,
  hidden: T.boolean,
  frozen: T.boolean,
  labelOrigin: T.nullable(SlotOriginV),
  secondaryOrigin: T.nullable(SlotOriginV),
});
export interface RailPortOptions {
  fill: PortFill;
  hidden: boolean;
  frozen: boolean;
  labelOrigin: SlotOrigin | null;
  secondaryOrigin: SlotOrigin | null;
}

/**
 * One member of a free port's label or secondary slot (P-201/P-208).
 *
 * - `builtin` names a part the face paints itself: `"label"` (the declaration,
 *   today's `RestingLabel`) or `"producers"` (P-250's badge).
 * - `shape` names a CHILD shape by id — "it could be three input boxes" is
 *   three `shape` members.
 *
 * A deleted default member is simply ABSENT from its list, which is what makes
 * the deletion survive a reload; there is no "deleted" flag to forget.
 */
export const SlotMemberV = T.object({
  kind: T.literalEnum("builtin", "shape"),
  id: T.string,
});
export interface SlotMember {
  kind: "builtin" | "shape";
  id: string;
}
