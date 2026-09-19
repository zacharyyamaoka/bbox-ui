// PLACEHOLDER — lane L3 replaces this file whole — Wires (shape + bindings +
// drag gesture) (docs/SYSTEMSKETCH-REBUILD-PLAN.md §5). What is here is SCHEMA
// ONLY: the persisted props of `ss-wire` and `ss-wire-binding` exactly as plan
// §3 spells them, and nothing else. No Trace paint, no elbow routing, no
// press-drag-from-a-dot gesture, no `install()` — those are L3's, and L3
// overwrites this file.
//
// There is no `variant: "control"` and there never will be. Control flow is
// containment and arms, never a cable (plan §2) — so the validator below is
// the place that enforces "never mix data and control lines" at the document
// level, before any lane can draw one.
//
// WHY the schema lands in L0 and not with its own lane (the one place this
// file departs from the lane brief's `wireKit = EMPTY_KIT`): the document
// model is ONE contract, not five. A record only enters a tldraw store if a
// registered util validates it, so with an empty kit a board written after L3
// lands cannot be OPENED by an app where it has not — the `.tldr` is refused,
// not degraded. `src/document/documentModel.test.ts`'s `registry` describe is
// that rule made executable, and it is an L0 acceptance line: SHAPE_UTILS
// publishes all five types and BINDING_UTILS the one binding type from day 0.
// Vocabulary is shared and frozen early; BEHAVIOUR is what a lane owns.
//
// WHY this spells the empty kit's other fields out instead of spreading
// registry.ts's `EMPTY_KIT`: registry.ts imports THIS file, so a value import
// back would close a module cycle and the const would be read while still in
// its temporal dead zone — measured here as "Cannot read properties of
// undefined (reading 'shapeUtils')" the first time the registry was loaded. An
// `import type` is erased, so the cycle never exists at runtime.
import {
  BindingUtil,
  Rectangle2d,
  ShapeUtil,
  T,
  createBindingPropsMigrationSequence,
  createShapePropsMigrationSequence,
  type TLBaseBinding,
  type TLBaseShape,
} from "tldraw";

import type { ShapeKit } from "../registry";
import { PointV } from "../shared/props";
import { WIRE_BINDING_TYPE, WIRE_SHAPE_TYPE } from "../types";

export interface WireShapeProps {
  variant: "data" | "async" | "delayed";
  routing: "straight" | "slanted" | "curved" | "elbow";
  color: string;
  /** Shape-local LOOSE terminal positions, read only for a terminal that has
   *  no binding. A bound terminal is re-derived from the port's measured
   *  anchor, never from these numbers. */
  start: { x: number; y: number };
  end: { x: number; y: number };
}

export interface WireBindingProps {
  terminal: "start" | "end";
  portId: string;
}

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "ss-wire": WireShapeProps;
  }
  interface TLGlobalBindingPropsMap {
    "ss-wire-binding": WireBindingProps;
  }
}

export type WireShape = TLBaseShape<"ss-wire", WireShapeProps>;
export type WireBinding = TLBaseBinding<"ss-wire-binding", WireBindingProps>;

/** Schema only. L3 replaces this class with the real one. */
export class WireShapeUtil extends ShapeUtil<WireShape> {
  static override type = WIRE_SHAPE_TYPE;

  static override props = {
    // Three DATA variants. A control line is not a variant of a cable; it is
    // not a cable (plan §2). The validator is what makes that structural.
    variant: T.literalEnum("data", "async", "delayed"),
    routing: T.literalEnum("straight", "slanted", "curved", "elbow"),
    color: T.string,
    start: PointV,
    end: PointV,
  };

  // Version 0, declared now for the reason BlockShapeUtil records: the sequence
  // is what gives these props a version number in a saved file, and it cannot
  // be retrofitted once boards exist.
  static override migrations = createShapePropsMigrationSequence({ sequence: [] });

  override getDefaultProps(): WireShapeProps {
    // Elbow is Zach's datum (plan §3): a system diagram reads as orthogonal runs.
    return { variant: "data", routing: "elbow", color: "", start: { x: 0, y: 0 }, end: { x: 120, y: 0 } };
  }

  override getGeometry(shape: WireShape) {
    // The loose terminals' bounding box — the only geometry a wire has before
    // L3 derives it from the bound anchors. `isFilled` false: a cable is a
    // line, so a click inside the box it spans is a click on the canvas.
    const { start, end } = shape.props;
    return new Rectangle2d({
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.max(Math.abs(end.x - start.x), 1),
      height: Math.max(Math.abs(end.y - start.y), 1),
      isFilled: false,
    });
  }

  override getIndicatorPath(shape: WireShape) {
    const path = new Path2D();
    path.moveTo(shape.props.start.x, shape.props.start.y);
    path.lineTo(shape.props.end.x, shape.props.end.y);
    return path;
  }

  override component() {
    // Deliberately nothing: unlike a node, an unpainted wire is not
    // "selectable emptiness" — its geometry is a line, and L3 owns every pixel
    // of the Trace that draws it.
    return null;
  }
}

/** Schema only. L3 replaces this class with the real one. One binding per
 *  terminal; the binding stores IDENTITY (which port), never a position. */
export class WireBindingUtil extends BindingUtil<WireBinding> {
  static override type = WIRE_BINDING_TYPE;

  static override props = {
    terminal: T.literalEnum("start", "end"),
    portId: T.string,
  };

  static override migrations = createBindingPropsMigrationSequence({ sequence: [] });

  override getDefaultProps(): Partial<WireBindingProps> {
    // `start` is the SOURCE; the arrowhead is at `end` (plan §3).
    return { terminal: "start", portId: "" };
  }
}

export const wireKit: ShapeKit = {
  shapeUtils: [WireShapeUtil],
  bindingUtils: [WireBindingUtil],
  // No tool on purpose: a wire is a press-drag from a port dot (L3), never a
  // thing you arm and then draw.
  tools: [],
  familyItems: [],
  toolUi: (_editor, tools) => tools,
};
