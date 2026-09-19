// src/shapes/types.ts — the closed vocabulary of the SystemSketch document
// (docs/SYSTEMSKETCH-REBUILD-PLAN.md §3). Every string here is a string a
// saved `.tldr` carries, so this file is a CONTRACT: the pyblocks backend
// (stream 3) and the source-code view (stream 4) target these exact names.
//
// WHY the `ss-` prefix rather than the archive's bare `block`/`code`/`loop`
// (plan §8.1): it cannot collide with the trunk bench's own `bbox-node` or
// the frozen adapter's `bbox-block` when two React trees share one engine,
// and it makes a saved file self-describing about which app wrote it.
//
// WHY constants and not inline literals: `src/document/stockBoundary.test.ts`
// imports this module and asserts each value — one file to read when asking
// "what can be in the document", and one file a later lane cannot quietly
// disagree with.

export const BLOCK_SHAPE_TYPE = "ss-block" as const;
export const CODE_SHAPE_TYPE = "ss-code" as const;
export const PORT_SHAPE_TYPE = "ss-port" as const;
export const WIRE_SHAPE_TYPE = "ss-wire" as const;
export const REGION_SHAPE_TYPE = "ss-region" as const;

export const WIRE_BINDING_TYPE = "ss-wire-binding" as const;

/** Every shape type that is a NODE — a thing a wire may name, a thing the
 *  derived scene turns into a `BlockScene` node. A wire is not a node. */
export const NODE_SHAPE_TYPES = ["ss-block", "ss-code", "ss-port", "ss-region"] as const;

// Tool ids (`BaseBoxShapeTool.id`). The wire has no tool on purpose — it is a
// press-drag from a port dot (L3), never a thing you arm and then draw.
export const BLOCK_TOOL_ID = "ss-block";
export const CODE_TOOL_ID = "ss-code";
export const PORT_TOOL_ID = "ss-port";
export const LOOP_TOOL_ID = "ss-loop";
export const BRANCH_TOOL_ID = "ss-branch";

/** The one `portId` a floating `ss-port` speaks. A free port is a one-port
 *  node — the smallest block — so its single anchor always has this id. */
export const FLOATING_PORT_ID = "port";

/** The four walls a rail can be mounted on, in the trunk's own spelling
 *  (`@trunk/components/port.layout`'s `BlockSide`). Declared here as a value
 *  so the validators below and a later lane's menus share one list. */
export const PORT_SIDES = ["top", "right", "bottom", "left"] as const;

export type PortSide = (typeof PORT_SIDES)[number];
export type NodeShapeType = (typeof NODE_SHAPE_TYPES)[number];
