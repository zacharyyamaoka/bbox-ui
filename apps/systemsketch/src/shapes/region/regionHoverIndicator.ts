// src/shapes/region/regionHoverIndicator.ts — a region's corner card never
// wears an outline of its own: wherever tldraw would stroke the CARD, it
// strokes the whole REGION instead.
//
// WHY: Zach, 2026-09-22, hovering a For Loop's card and seeing only the card
// outlined: "when you hover on the corner block its the entire out frame that
// should become highlighted in blue.. More like an expanded block". A hover
// outline is a promise about what a click selects, and a click on the card
// already selects the region (`installRegionKit`'s `redirectCornerSelection`),
// so an outline hugging the card promised the one thing a click never gives.
//
// WHY EVERY LIST, not only hover (Codex audit, 2026-09-22): the card is still
// SELECTED alone during its own rename (`redirectCornerSelection`'s one
// carve-out), and it can be HINTED. An earlier cut swapped only the hovered
// id, so double-clicking the title flipped the outline from the frame back to
// the card — "never selectable by itself" contradicted in paint. The editing
// session still runs in the card; only the outline moves to the region.
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
// records stay the card, and only the PAINT is swapped: this subclass of the
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
    return super.getOverlays().map((overlay) => {
      const idsToDisplay = this.regionsForCards(overlay.props.idsToDisplay);
      // Hints too: a card both hovered and hinted would otherwise stroke the
      // frame (hover, swapped) AND the card (hint, unswapped).
      const hintingShapeIds = this.regionsForCards(overlay.props.hintingShapeIds);
      if (idsToDisplay === overlay.props.idsToDisplay && hintingShapeIds === overlay.props.hintingShapeIds) return overlay;
      return { ...overlay, props: { ...overlay.props, idsToDisplay, hintingShapeIds } };
    });
  }

  /** `ids` with every corner card replaced by its region, deduplicated in
   *  order. The SAME array back when nothing changed. */
  private regionsForCards(ids: TLShapeId[]): TLShapeId[] {
    if (!ids.some((id) => isRegionCornerBlock(this.editor, id))) return ids;
    const out: TLShapeId[] = [];
    for (const id of ids) {
      const target = isRegionCornerBlock(this.editor, id) ? (this.editor.getShape(id)!.parentId as TLShapeId) : id;
      if (!out.includes(target)) out.push(target);
    }
    return out;
  }
}
