import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
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

/**
 * Hand `textLayout` down to every Port inside the lane, looking THROUGH
 * Fragments on the way.
 *
 * WHY the recursion: a Fragment satisfies `isValidElement`, so a flat
 * `Children.map` + `cloneElement` put the prop on the Fragment itself, where
 * React warns in dev and no Port ever saw it. Both callers in this repo wrap
 * their ports in a Fragment, so the cascade was inert exactly where it was
 * used — setting a PortEdge's Text Layout to Top, Bot, Right or Left left
 * every child painting `right`.
 *
 * A Port that sets its own `textLayout` still wins, because the cascade is
 * only applied when the child's own prop is undefined. Known limit, stated
 * rather than hidden: an element that is neither a Port nor a Fragment (a
 * wrapping `div`, say) still stops the cascade at itself. Context would pass
 * through anything, but Port is deliberately callable as a plain function so
 * its tests can read real defaults off the returned tree, and a hook would
 * end that.
 */
function cascadeInto(children: ReactNode, textLayout: PortTextLayout): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    if (child.type === Fragment) {
      const fragment = child as ReactElement<{ children?: ReactNode }>;
      return cascadeInto(fragment.props.children, textLayout);
    }
    const element = child as ReactElement<{ textLayout?: PortTextLayout }>;
    return cloneElement(element, { textLayout: element.props.textLayout ?? textLayout });
  });
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
      {cascadeInto(children, cascadeTextLayout)}
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
