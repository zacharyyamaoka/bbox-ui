// src/shapes/region/regionHoverIndicator.ts — hovering a region's corner card
// outlines the WHOLE region.
//
// WHY: Zach, 2026-09-22, hovering a For Loop's card and seeing only the card
// outlined: "when you hover on the corner block its the entire out frame that
// should become highlighted in blue.. More like an expanded block". A hover
// outline is a promise about what a click selects, and a click on the card
// already selects the region (`installRegionKit`'s `redirectCornerSelection`),
// so an outline hugging the card promised the one thing a click never gives.
//
// WHY PAINT, NOT THE RECORD (tried first, 2026-09-22, and reverted): rewriting
// `instance_page_state.hoveredShapeId` from the card to its region painted the
// right outline, but tldraw 5.3.2 READS that record to decide what a gesture
// acts on — `SelectTool/childStates/Idle.mjs` `onDoubleClick` (and
// `onPointerDown`, `onRightClick`) take `editor.getHoveredShape()` as the hit
// shape. A double-click on the card then targeted the region, which cannot
// edit, and the card's rename never opened: `regionRigid.smoke.test.tsx`'s
// "a double-click on the card's title renames the CARD in place" went red with
// `waitFor timed out after 10000ms — the card's editing session`. It would also
// have hidden the card from `wire/wireTunnel.ts`'s hover attention. So the
// record stays the card, and only the PAINT is swapped: this subclass of the
// stock `ShapeIndicatorOverlayUtil` hands the stock renderer the region's id
// where it would have stroked the card's.
//
// WHY the `overlayUtils` prop and not `editor.overlays.registerUtil` from
// `installRegionKit`: `registerUtil` is `@internal` and throws
// `Duplicate overlay util type: "shape_indicator"` once the stock util is in
// (`@tldraw/editor` `OverlayManager.mjs` `registerUtil`). The documented seam
// is `<Tldraw overlayUtils>`, whose `mergeArraysAndReplaceDefaults("type", …)`
// (`tldraw/dist-esm/lib/Tldraw.mjs:124-127`) replaces the default util of the
// same static `type` — this one keeps `shape_indicator`, so it REPLACES the
// stock hover/selection indicator rather than drawing a second one.
import { ShapeIndicatorOverlayUtil, type TLShapeId, type TLShapeIndicatorOverlay } from "tldraw";

import { isRegionCornerBlock } from "./cornerBlock";

export class RegionAwareShapeIndicatorOverlayUtil extends ShapeIndicatorOverlayUtil {
  override getOverlays(): TLShapeIndicatorOverlay[] {
    const overlays = super.getOverlays();
    const hovered = this.editor.getHoveredShapeId();
    // Only the HOVER paint is swapped. A card that is itself selected — its
    // own rename session, the one time it can be — keeps its own outline.
    if (!hovered || this.editor.getSelectedShapeIds().includes(hovered) || !isRegionCornerBlock(this.editor, hovered)) return overlays;
    const regionId = this.editor.getShape(hovered)!.parentId as TLShapeId;
    return overlays.map((overlay) => {
      if (!overlay.props.idsToDisplay.includes(hovered)) return overlay;
      const ids = overlay.props.idsToDisplay.filter((id) => id !== hovered);
      if (!ids.includes(regionId)) ids.push(regionId);
      return { ...overlay, props: { ...overlay.props, idsToDisplay: ids } };
    });
  }
}
