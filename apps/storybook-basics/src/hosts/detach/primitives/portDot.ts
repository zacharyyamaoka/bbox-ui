/**
 * src/hosts/detach/primitives/portDot.ts — a `Port`'s dot
 * (`data-slot="port-dot"`, `../../../components/port.tsx:543`) as a stock
 * ellipse, coloured by the state the component ACTUALLY PAINTED.
 *
 * This file is the bottom of the detach hierarchy, and it is the one part
 * that was already primitive-shaped before RULING 5 — it arrived as
 * `definitions/port.ts`'s `emitPortPrimitives`, a function `definitions/
 * block.ts` called per port inside a loop it drove from SCENE DATA. What
 * changed is only who finds it: the walk does, off the rendered DOM, so
 * every port in every composite lowers — a port on a rail, the header's
 * function port (`blockPort.tsx`'s `BlockFunctionPort`, which the
 * scene-driven loop could not see because it is not in `node.data.ports`),
 * a port inside a member Block. Same rule, no caller.
 *
 * STATE COMES OFF THE PAINTED DOM, not off scene data (carried over
 * verbatim from `definitions/port.ts`, whose reasoning this file inherits):
 * `PortState` is COMPUTED by the host at render time
 * (`../../nodeViews.tsx`'s `withWiredState`, from `wiredPorts(scene)`) — the
 * scene only ever names a port, it never stores whether it is wired. Rather
 * than re-deriving that fact a second time here (a second implementation of
 * the same rule that could silently diverge), this reads the SAME fact
 * `Port` already painted into `data-state`, because the paint IS the
 * derivation's only consumer.
 */
import type { TLDefaultColorStyle } from "tldraw";

import { boxRelativeTo, geoAtBox, inflateBox } from "../stockShapes";
import type { DetachablePrimitive } from "./detachablePrimitive";

/** `../../../components/port.layout.ts:53-54` (PORT_SURFACE_RING_PX /
 *  PORT_STATE_RING_PX), re-declared rather than imported for the reason the
 *  donor file gave: the values are load-bearing enough (they size the stock
 *  ring) that a literal citation beats an import of a private-feeling pair,
 *  and `PortRing.stories.tsx`'s own dot measurements go red before this
 *  file's output could silently drift. */
const PORT_SURFACE_RING_PX = 2;
const PORT_STATE_RING_PX = 3;
const PORT_RING_OVERHANG_PX = PORT_SURFACE_RING_PX + PORT_STATE_RING_PX;

/**
 * The dot's stock ring per `data-state`. Ported from the donor's own table
 * (`packages/adapter-tldraw/src/detach/portPrimitives.ts:79-86`,
 * `STATE_STOCK_RING`) for the three states it shares; `received` is THIS
 * app's own addition and has no donor precedent, so it is a fresh judgement
 * call: stock `"green"` is the closest named colour to the live
 * `--bbox-received` token's intent ("fully lit, data just flowed").
 */
const STATE_STOCK_RING: Record<string, { color: TLDefaultColorStyle; fill: "none" | "solid" | "fill" }> = {
  empty: { color: "black", fill: "none" },
  valueSet: { color: "grey", fill: "solid" },
  wired: { color: "orange", fill: "fill" },
  received: { color: "green", fill: "fill" },
};

export const PORT_DOT_SLOT = "port-dot";

export const portDotPrimitive: DetachablePrimitive = {
  slot: PORT_DOT_SLOT,
  // The dot owns its halo and core (`port.tsx:603`, `:618`) — they are the
  // same painted circle, not separate parts.
  descend: false,
  groupsSubtree: false,
  emit(context, el) {
    const state = el.getAttribute("data-state") ?? "empty";
    const paint = STATE_STOCK_RING[state] ?? STATE_STOCK_RING.empty;
    const ringBox = inflateBox(boxRelativeTo(context.origin, el, context.editor), PORT_RING_OVERHANG_PX);
    return [geoAtBox(ringBox, { geo: "ellipse", ...paint })];
  },
};
