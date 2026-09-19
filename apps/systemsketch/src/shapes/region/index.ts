// PLACEHOLDER — lane L5 replaces this file whole — Region shapes (Loop, Branch)
// (docs/SYSTEMSKETCH-REBUILD-PLAN.md §5). What is here is SCHEMA ONLY: the
// persisted props of `ss-region` exactly as plan §3 spells them, and nothing
// else. No frame-like containment, no arm rows, no corner-block wiring, no
// tools — those are L5's, and L5 overwrites this file.
//
// The two load-bearing ideas meet in this record's shape. `cornerBlockId`
// names a CHILD `ss-block`: a region grows no ports of its own, because a
// region's interface IS a real block ("everything is really a block"). And
// `arms` are rows inside the frame, not terminals — control flow is
// containment and arms, never a cable, so there is no edge field here at all.
//
// WHY the schema lands in L0 and not with its own lane (the one place this
// file departs from the lane brief's `regionKit = EMPTY_KIT`): the document
// model is ONE contract, not five. A record only enters a tldraw store if a
// registered util validates it, so with an empty kit a board written after L5
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
import { createElement } from "react";
import { HTMLContainer, Rectangle2d, ShapeUtil, T, createShapePropsMigrationSequence, type TLBaseShape } from "tldraw";

import type { ShapeKit } from "../registry";
import { REGION_SHAPE_TYPE } from "../types";

// The face every un-landed kind wears. Duplicated per placeholder rather than
// hoisted into `shared/`: `shared/` is L0's permanent write set and a lane
// deletes its placeholder whole, so a shared constant would outlive every one
// of its callers.
const UNBUILT_FACE_STYLE = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px dashed currentColor",
  borderRadius: 4,
  opacity: 0.55,
  font: "12px ui-monospace, monospace",
  pointerEvents: "all",
} as const;

export interface RegionArm {
  id: string;
  title: string;
  open: boolean;
  h: number;
}

export interface RegionShapeProps {
  w: number;
  h: number;
  kind: "for" | "while" | "branch" | "plain";
  name: string;
  /** The CHILD `ss-block` that IS this region's header contract. Empty until
   *  L5 creates one; never a port list of the region's own. */
  cornerBlockId: string;
  arms: RegionArm[];
}

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "ss-region": RegionShapeProps;
  }
}

export type RegionShape = TLBaseShape<"ss-region", RegionShapeProps>;

/** Schema only. L5 replaces this class with the real one. */
export class RegionShapeUtil extends ShapeUtil<RegionShape> {
  static override type = REGION_SHAPE_TYPE;

  static override props = {
    w: T.number,
    h: T.number,
    kind: T.literalEnum("for", "while", "branch", "plain"),
    name: T.string,
    cornerBlockId: T.string,
    arms: T.arrayOf(T.object({ id: T.string, title: T.string, open: T.boolean, h: T.number })),
  };

  // Version 0, declared now for the reason BlockShapeUtil records: the sequence
  // is what gives these props a version number in a saved file, and it cannot
  // be retrofitted once boards exist.
  static override migrations = createShapePropsMigrationSequence({ sequence: [] });

  override getDefaultProps(): RegionShapeProps {
    return { w: 480, h: 320, kind: "plain", name: "", cornerBlockId: "", arms: [] };
  }

  override getGeometry(shape: RegionShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override getIndicatorPath(shape: RegionShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }

  // WHY a visible "not built" face rather than `null`: a shape that validates,
  // occupies geometry and paints nothing is selectable emptiness — the worst
  // way to meet an un-landed lane. This says which lane owes it.
  override component(shape: RegionShape) {
    return createElement(
      HTMLContainer,
      { style: { ...UNBUILT_FACE_STYLE, width: shape.props.w, height: shape.props.h } },
      `${REGION_SHAPE_TYPE} — lane L5`,
    );
  }
}

export const regionKit: ShapeKit = {
  shapeUtils: [RegionShapeUtil],
  bindingUtils: [],
  tools: [],
  familyItems: [],
  toolUi: (_editor, tools) => tools,
};
