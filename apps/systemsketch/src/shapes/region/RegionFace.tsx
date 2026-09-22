// src/shapes/region/RegionFace.tsx — what an `ss-region` looks like: the
// trunk's own `Region`, fed from persisted props.
//
// Nothing is drawn here. Stream 1 landed `@trunk/components/blockRegion.tsx` (the
// React Flow "Labeled Group Node" look Zach named in `Pasted image
// 20260918192040.png`: a thin 1px frame, a real card integral to its
// top-left, a stack of titled arm rows), so this file's whole job is to turn
// `shape.props` into that component's props.
//
// WHAT THIS LANE'S BRIEF GUESSED, AND WHAT SHIPPED (plan §7 wrote the
// contract before stream 1's plan existed and said to adapt THIS file to the
// real one): the component takes `corner`/`cornerSize`, not `label`, and it
// has no `children` — arms and body are props. Its `kind` vocabulary is the
// region-view one (`loop`/`branch`/`group`), not the document's four
// `ss-region` kinds, so `TRUNK_KIND` below is the mapping.
//
// ── THE CORNER IS NOT PAINTED HERE ──────────────────────────────────────
// `corner` is `null` on purpose. In the DOM host the corner card is part of
// the region's own subtree (`@trunk/hosts/nodeViews.tsx`'s `RegionNodeView`
// builds a `BlockPort` and hands it over); here it is a REAL CHILD SHAPE —
// an `ss-block` named by `cornerBlockId` — that tldraw paints, hit-tests,
// clips, carries and persists on its own. That is what "everything is really
// a block" buys: the corner's ports are wireable by the same gesture as any
// other block's, with no region-specific code anywhere in `shapes/wire/`.
// The component still needs to KNOW how tall that card is, which is what
// `cornerSize` is for — read from the child's own measured props, so the
// frame's first arm starts exactly under the card that is on screen.
//
// There is no measurement pass here (`shared/nodeShapeComponent.tsx`'s
// `NodeShapeFrame` is deliberately not used, and this is the one node kind
// that skips it): a region's box is AUTHORED — drawn by the box tool, then
// resized by a handle — never hugged from its own content. A measured write
// would read the paint back into the props the paint came from and fight
// `resizeBox` for the box.
import { HTMLContainer, useEditor, useValue } from "tldraw";

import { BlockRegion, type RegionArm as RegionArmView, type RegionKind as TrunkRegionKind } from "@trunk/components/blockRegion";

import { REGION_SHAPE_TYPE } from "../types";
import { regionLayoutOf, REGION_NAME_TAB_PX } from "./cornerBlock";
import type { RegionKind, RegionShape } from "./RegionShapeUtil";

/** The document's four kinds → the three the view kit paints. A `for` and a
 *  `while` are ONE component with two header contracts (DP - Loop, quoted in
 *  `@trunk/scene/region.loop.ts:8-12`), which is exactly why the view has no
 *  separate `for` case to map onto. */
const TRUNK_KIND: Record<RegionKind, TrunkRegionKind> = {
  for: "loop",
  while: "loop",
  branch: "branch",
  plain: "group",
};

/**
 * A region with no corner block still has a NAME, and a stored name that
 * nothing paints is a property rendered untruthfully. So a cornerless region
 * wears its name as a plain tab in the same slot the card would occupy —
 * fixed at `REGION_NAME_TAB_PX` tall, because the geometry
 * (`RegionShapeUtil.getGeometry`) has to agree with this without measuring
 * it.
 */
function NameTab({ name }: { name: string }) {
  return (
    <div
      data-slot="region-name-tab"
      className="flex items-center rounded-tl-[var(--bbox-skin-radius,var(--radius-lg))] rounded-br-[var(--bbox-skin-radius,var(--radius-lg))] border border-border bg-background px-2 text-xs text-muted-foreground"
      style={{ height: REGION_NAME_TAB_PX }}
    >
      {name}
    </div>
  );
}

export function RegionFace({ shape }: { shape: RegionShape }) {
  const editor = useEditor();
  const { kind, name, cornerBlockId, arms } = shape.props;

  // WHY the layout is read through `useValue` rather than computed inline:
  // it depends on the CORNER BLOCK's measured box, which is a different
  // record. `useValue` is what makes this face repaint the moment that card's
  // own measurement settles — without it, the first arm would sit wherever
  // the card's stale height said, until something else re-rendered.
  const layout = useValue("ss-region layout", () => regionLayoutOf(editor, shape), [editor, shape]);

  const armViews: RegionArmView[] = arms.map((arm) => ({
    id: arm.id,
    title: arm.title,
    open: arm.open,
    bodyHeight: arm.h,
    onOpenChange: (open: boolean) => {
      editor.updateShape({
        id: shape.id,
        type: REGION_SHAPE_TYPE,
        props: { arms: arms.map((each) => (each.id === arm.id ? { ...each, open } : each)) },
      });
    },
  }));

  return (
    <HTMLContainer
      style={{
        width: layout.width,
        height: layout.height,
        // The corner card's dots straddle the frame's own wall, and an arm
        // title may hang a pixel past it — the same overflow every other face
        // in this app needs.
        overflow: "visible",
        pointerEvents: "all",
      }}
      onPointerDownCapture={(event) => {
        // The fold chevron owns its own press. `markEventAsHandled` (never
        // `stopPropagation`, per `shared/pointerOwnership.ts`'s note on
        // breaking a child's pointer capture) hides it from tldraw, so
        // clicking the chevron folds the arm instead of starting a translate
        // of the region the arm header is also the drag surface for.
        if ((event.target as Element).closest('[data-slot="folding-chevron"]')) {
          editor.markEventAsHandled(event);
        }
      }}
    >
      <BlockRegion
        id={shape.id}
        kind={TRUNK_KIND[kind]}
        // The opaque projection is a LENS over the document (lane cf:E) and
        // is driven by scene data, not by a persisted prop — there is no
        // `view` in `ss-region`'s schema, so this face always draws the
        // expanded frame. Owed: wiring `regionViewOf`/`toggleRegionView`
        // through L4's floating toolbar.
        view="expanded"
        corner={cornerBlockId ? null : name ? <NameTab name={name} /> : null}
        cornerSize={{ w: layout.corner.w, h: layout.corner.h }}
        width={layout.width}
        height={layout.height}
        // Members are CHILD SHAPES — tldraw paints, moves and clips them, and
        // `sceneFromRecords` reads them as `parentId`. Handing them to the
        // component as well would paint each one twice.
        arms={armViews}
      />
    </HTMLContainer>
  );
}
