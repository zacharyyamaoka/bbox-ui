// src/scene/region.loop.ts — the Loop PRESET: for / while, as data over the
// generic Region (docs/CONTROL-FLOW-PLAN.md lane B).
//
// There is no `LoopRegion` component here, and there deliberately never
// will be one — the same ruling `components/block.value.tsx:1-45` already
// carries ("a PRESET of components that already exist, not a component of
// its own"). `hosts/nodeViews.tsx`'s `region` case already draws the corner
// block from `data.ports` and the body from `bodyChildrenOf`; a loop is
// that renderer handed three fields. DP - Loop states it from the other
// side: "**a loop is a Region with one arm, plus one cable that comes
// back**… one Loop component with two header contracts rather than a For
// component and a While component."
//
// So everything below is a pure factory over the scene record — no React,
// no DOM, no layout. What it encodes is the GRAMMAR:
//
//   • "everything is a block" — the node these factories mint is ONE
//     `type: "region"` node whose `data.ports` land on a real `BlockPort`
//     in the frame's corner. A loop's `Iterable` is resolved by the exact
//     `[data-block-id]` → `[data-port-id]` walk any other block's port is.
//   • "never mix data and control lines" — nothing here mints a control
//     cable. The only edge factory is `carriedValueEdge`, and what it makes
//     is an ordinary DATA cable that is merely one turn late. `break` is a
//     mark (`HostNodeData.marks`, B5), the loop's arm is containment, and
//     "loop back" is a routing choice, not an edge kind.

import { REGION_NODE_TYPE } from "./region";
import type { ScenePosition, SceneEdge, SceneNode } from "./scene";
import type { WireStyleData } from "./sceneWires";
import type { HostNodeData } from "../hosts/hostScene";
import type { RegionView } from "../hosts/regionScene";

/**
 * The header's port ids — and its port LABELS, because they are the same
 * string.
 *
 * WHY the id IS the type and there is no name anywhere near it (DP - Loop;
 * donor `/home/bam/systemsketch/src/loop/loopModel.ts:55-70`, "A type and
 * nothing else. You do not NAME these — the collection's name lives on
 * whatever produces it, and the element has no name until a Block's port
 * gives it one. What the header can say is what KIND of thing crosses it,
 * so the inlet reads `Iterable` and the outlet reads `Iter`"): a header
 * port named `items` would be claiming to know what the collection is
 * called, which is the producer's business. `edgeSpecsOf` (nodeViews.tsx)
 * builds each item as `{ id, label: id }`, so writing the type here is
 * literally what paints it.
 */
export const LOOP_PORT_IDS = {
  /** `for`: the collection, consumed once at entry. */
  iterable: "Iterable",
  /** `for`: the element the header emits, once per turn. */
  iter: "Iter",
  /** `while`: the condition, re-evaluated after every pass. */
  bool: "Bool",
} as const;

export interface LoopNodeOptions {
  id: string;
  /** The corner block's header. Defaults per loop kind. */
  name?: string;
  /** Top-level: canvas space. With `parentId`: the parent's space. */
  position: ScenePosition;
  /** The FRAME's width/height — the corner hugs at `REGION_CORNER_WIDTH_PX`. */
  w?: number;
  h?: number;
  /** Default `"expanded"` (the P1 frame). `"opaque"` is the P5 card. */
  view?: RegionView;
  /** A chip in the corner block's header — the donor's `turn`, e.g.
   *  `"iteration 3 of 7"`. */
  badge?: string;
  /** A loop nested in another region or arm. */
  parentId?: string;
}

const DEFAULT_W = 400;
const DEFAULT_H = 300;

function loopNode(options: LoopNodeOptions, loop: "for" | "while", defaultName: string): SceneNode<HostNodeData> {
  const { id, name = defaultName, position, w = DEFAULT_W, h = DEFAULT_H, view = "expanded", badge, parentId } = options;
  return {
    id,
    type: REGION_NODE_TYPE,
    position,
    // WHY `definitionId` is not merely unset but unsettable from here: a
    // region is ISOLATED (`scene/region.ts:19-26`, the ruling lane A
    // implements) — it is a scope, not an occurrence of a shared
    // definition, so a loop that carried one would be claiming every loop
    // with that id is the same loop. `loop.test.ts` asserts the absence.
    ...(parentId === undefined ? null : { parentId }),
    data: {
      name,
      region: { kind: "loop", loop, view },
      ports: loop === "for" ? forPorts() : whilePorts(),
      w,
      h,
      ...(badge === undefined ? null : { badge }),
    },
  };
}

/** `for item in iterable`: the collection in on the left wall, the element
 *  out on the right. Both are real ports carrying ordinary cables — the
 *  element's cable is SOLID (donor loopModel.ts:15-20: dotted stays
 *  reserved for the back cable, and *this* turn's element is ordinary
 *  data). */
function forPorts(): HostNodeData["ports"] {
  return { left: [LOOP_PORT_IDS.iterable], right: [LOOP_PORT_IDS.iter] };
}

/**
 * `while condition`: a `Bool` inlet and NOTHING on the right wall.
 *
 * WHY the missing right wall is the design and not an omission (DP - Loop's
 * own header table, "Header output — for: typed `Iter` item outlet; while:
 * **none — the body owns the values it carries**"): a `while` is not a
 * renamed `for`. An iterable is consumed at entry and the header can
 * therefore hand out this turn's element; a condition is re-evaluated after
 * each pass and produces no element at all, so an outlet would have to emit
 * something the construct does not have. The tempting alternative — giving
 * `while` an `Iter` too "for symmetry" — mints a port with no value behind
 * it, which is exactly the kind of drawn-but-meaningless dot the typed
 * unnamed header exists to avoid.
 */
function whilePorts(): HostNodeData["ports"] {
  return { left: [LOOP_PORT_IDS.bool] };
}

/** `for other in others:` — `Iterable` in, `Iter` out, on the corner block. */
export function forLoopNode(options: LoopNodeOptions): SceneNode<HostNodeData> {
  return loopNode(options, "for", "For Loop");
}

/** `while condition:` — `Bool` in, no item outlet. */
export function whileLoopNode(options: LoopNodeOptions): SceneNode<HostNodeData> {
  return loopNode(options, "while", "While Loop");
}

export interface CarriedValueEdgeOptions {
  id: string;
  /** The block that carries the value: the cable leaves it and re-enters
   *  it, which is what makes the state ITS state. */
  nodeId: string;
  /** The port it leaves from (an output). */
  from: string;
  /** The port it comes back into (an input). */
  to: string;
  /** What produced the value before the first turn — spelled into the pill
   *  as `z⁻¹ = estimate()`. Omitted = the bare derived `z⁻¹`. */
  seed?: string;
}

/**
 * The carried value: `merge/Pose` → `merge/pose`, one turn late.
 *
 * WHY this is a DATA cable and not a control line — the load-bearing half
 * of the loop grammar (DP - Loop, "The carried value, and the `z⁻¹` edge"):
 * what travels here is a *value*, and the only thing that distinguishes it
 * from any other cable is WHEN it is read. So `variant: "delayed"` (the
 * dotted paint `trace.layout.ts:72-85` already ships) says "next
 * iteration", and no second kind of line is invented. The naive alternative
 * — a "loop back" control wire — would put control flow on a cable, which
 * is the one thing this language never does: control here is the
 * containment and the marks.
 *
 * WHY `routing: "elbow"` rides along: "go to the end first, then loop back"
 * is *format, not semantics* (DP - Loop) — default routing of the back
 * cable is right edge, bottom lane, back, which is exactly what the elbow
 * router with keep-outs produces once the cable is told to be orthogonal.
 * A whiteboard may bend it; nothing about the meaning changes if it does.
 *
 * WHY there is no `badge` when no seed is given: `sceneWires` derives
 * `"z⁻¹"` for every delayed edge that names none (plan Q7, "always draw the
 * pill"). Writing `badge: "z⁻¹"` here would author the derived value, and
 * the first change to the derivation would then silently skip every edge
 * this factory made.
 */
export function carriedValueEdge(options: CarriedValueEdgeOptions): SceneEdge<WireStyleData> {
  const { id, nodeId, from, to, seed } = options;
  return {
    id,
    source: nodeId,
    sourceHandle: from,
    target: nodeId,
    targetHandle: to,
    data: {
      variant: "delayed",
      routing: "elbow",
      ...(seed === undefined ? null : { badge: `z⁻¹ = ${seed}` }),
    },
  };
}
