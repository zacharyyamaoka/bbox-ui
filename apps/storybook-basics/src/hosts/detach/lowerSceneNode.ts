/**
 * src/hosts/detach/lowerSceneNode.ts — the shared BODY of every scene-node
 * kind's `lowerNode`: find what the node actually painted, walk it through
 * the primitive registry, group the result and stamp the record.
 *
 * RULING 5's payoff at the kind layer. Before this file every kind carried
 * its own hand-written lowering, which is why exactly one kind existed and
 * why `definitions/index.ts` listed `glyph`/`code`/`value` as owed work:
 * each one meant another bespoke DOM walk. A kind is now a `matches`
 * predicate plus a record — the lowering itself is shared, so registering a
 * new scene-node type is a handful of lines and it inherits every primitive
 * automatically.
 *
 * WHY the wrapper lookup is scoped to THIS editor's registered container
 * (`./editorContainer.ts`) and never `document`: `shapeIdForNode` mints a
 * DETERMINISTIC id per scene-node id, so a gallery mounting several hosts at
 * once can legitimately have the SAME `data-shape-id`/`data-scene-node` pair
 * on screen more than once. A `document`-wide query silently grabbed
 * whichever host's element came first in DOM order (measured 2026-09-18).
 */
import type { Editor, TLShape } from "tldraw";

import type { LoweredNode } from "./detachableKind";
import type { DetachedRecord } from "./detachModel";
import { containerFor } from "./editorContainer";
import { lowerToGroup } from "./lowerShared";
import { lowerSubtree, PRIMITIVE_REGISTRY, type PrimitiveRegistry } from "./primitives";
import { renderedLineMeasureFor } from "./stockShapes";

export interface LowerSceneNodeOptions {
  /** The scene node id this shape renders — the `data-scene-node` stamp
   *  `BboxNodeShapeComponent` puts on the wrapper (`../tldrawHost.tsx`). */
  nodeId: string;
  record: DetachedRecord;
  /** Overridable so a test can drive the walk with synthetic primitives. */
  registry?: PrimitiveRegistry;
}

export function lowerSceneNodeShape(editor: Editor, shape: TLShape, options: LowerSceneNodeOptions): LoweredNode | null {
  const scope = containerFor(editor) ?? document;
  const shapeEl = scope.querySelector<HTMLElement>(`[data-shape-id="${shape.id}"]`);
  const wrapper = shapeEl?.querySelector<HTMLElement>(`[data-scene-node="${options.nodeId}"]`);
  if (!wrapper) return null;

  const { shapes, nestedRows } = lowerSubtree(
    { editor, origin: wrapper, measureRendered: renderedLineMeasureFor(editor) },
    wrapper,
    options.registry ?? PRIMITIVE_REGISTRY,
  );
  if (shapes.length === 0) return null;

  // Every box the walk measured is relative to `wrapper` — i.e. it starts
  // near (0, 0), the WRAPPER's own top-left. But `lowerToGroup` creates
  // these primitives with `parentId: shape.parentId` (the original
  // `bbox-node`'s OWN parent, e.g. the page) — a SIBLING replacement, not a
  // child nested inside the original shape's transform — so a
  // wrapper-relative box has to be shifted into that parent's frame by the
  // original shape's own (x, y) before it means anything there. Measured
  // 2026-09-18: omitting this shift put every detached primitive exactly
  // (shape.x, shape.y) off from the live component it replaced.
  const inParentFrame = shapes.map((partial) => ({
    ...partial,
    x: (partial.x ?? 0) + shape.x,
    y: (partial.y ?? 0) + shape.y,
  }));

  return lowerToGroup(editor, {
    shape,
    shapes: inParentFrame,
    // The first shape the walk emitted is the outermost box the composite
    // painted (DOM order is paint order), which is what a rebuild wants to
    // measure the group's origin from.
    anchorKind: "bbox-node-anchor",
    nestedRows,
    record: options.record,
  });
}
