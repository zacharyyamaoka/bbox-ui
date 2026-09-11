import {
  Children,
  cloneElement,
  isValidElement,
  type ComponentProps,
} from "react";

import { cn } from "./lib/utils";
// WHY imported from `./port.layout`, not the frozen `./layout`: the real,
// landed `port.layout.ts` re-declares `BlockSide` itself, and §0's master
// export-lifetime list names `BlockSide` as one of the exports Integration
// deletes from `layout.ts` once this file lands — see portEdge.fields.ts's
// own deviation note for the full reasoning.
import { inwardTextLayout, type BlockSide, type PortTextLayout } from "./port.layout";
import type { PortEdgeLayout } from "./portEdge.fields";

/**
 * Which way the lane runs along a given wall: a left/right wall is
 * vertical, so its ports stack top-to-bottom; a top/bottom wall is
 * horizontal, so its ports run left-to-right. Order within `children` is
 * render order along the edge (T1-SPEC.md §4.6) — this function only
 * decides the axis, never a reversal.
 */
function edgeFlexDirection(edge: BlockSide): "column" | "row" {
  return edge === "left" || edge === "right" ? "column" : "row";
}

export interface PortEdgeProps extends ComponentProps<"div"> {
  edge?: BlockSide;
  layout?: PortEdgeLayout;
  /**
   * Cascades to any child that doesn't set its own `textLayout`. Omit it
   * and PortEdge derives a sensible one from `edge` itself
   * (`inwardTextLayout`) — see `portEdge.fields.ts`'s own `textLayout`
   * field comment for why the FieldSpec's static default can't express
   * that.
   */
  textLayout?: PortTextLayout;
  /**
   * Host/document-supplied. Never computed by PortEdge inspecting its own
   * `children` — which ports are hidden and why is document/data-model
   * state this component structurally cannot see (T1-SPEC.md §4.6).
   */
  hiddenCount?: number;
}

/**
 * A flex lane along one wall of a `Block`, holding real `<Port>` elements
 * as children. Answers which wall (`edge`) and how the lane distributes
 * its children (`layout`); cascades a default label placement to any
 * child that didn't set its own; can append a `+N more` disclosure row.
 *
 * WHY no `onReorder`: the reorder gesture belongs to the HOST (dnd-kit),
 * not to this component — PortEdge lays children out, it does not let
 * you drag them. See T1-SPEC.md §4.6's own "not a prop" list.
 */
export function PortEdge({
  edge = "left",
  layout = "evenly",
  textLayout,
  hiddenCount = 0,
  className,
  style,
  children,
  ...props
}: PortEdgeProps) {
  const cascadeTextLayout = textLayout ?? inwardTextLayout(edge);
  return (
    <div
      data-slot="port-edge"
      data-edge={edge}
      data-layout={layout}
      className={cn(
        "flex",
        edgeFlexDirection(edge) === "column" ? "flex-col" : "flex-row",
        layout === "evenly" && "justify-evenly",
        className,
      )}
      style={style}
      {...props}
    >
      {Children.map(children, (child) =>
        isValidElement<{ textLayout?: PortTextLayout }>(child)
          ? cloneElement(child, {
              textLayout: child.props.textLayout ?? cascadeTextLayout,
            })
          : child,
      )}
      {hiddenCount > 0 && (
        <span
          data-slot="port-edge-more"
          className="whitespace-nowrap text-xs text-muted-foreground"
        >
          +{hiddenCount} more
        </span>
      )}
    </div>
  );
}
