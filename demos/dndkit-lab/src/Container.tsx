import { useDroppable } from "@dnd-kit/core";
import { SortableContext, type SortingStrategy } from "@dnd-kit/sortable";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

import { distributionStyle } from "./layout";
import type { Distribution, Size } from "./types";

/** The Block's edge itself, drawn as a straight line through the container. */
export function EdgeLineMark({ axis }: { axis: "row" | "column" }) {
  return <div className={`edge-line edge-line--${axis === "row" ? "horizontal" : "vertical"}`} />;
}

export function Container({
  id,
  items,
  strategy,
  axis,
  distribution,
  size,
  dashed,
  highlighted,
  showBox = true,
  registerRef,
  onContextMenu,
  children,
}: {
  id: string;
  items: string[];
  strategy: SortingStrategy;
  axis: "row" | "column";
  distribution: Distribution;
  size: Size;
  dashed?: boolean;
  /** The arrow tool's tip is currently snapped to this container's edge. */
  highlighted?: boolean;
  /**
   * Whether the container paints its own border/background. Off is how it'll
   * actually sit once integrated into a Block — the Block draws its own
   * outline, this is just a hit area — but it's still droppable and still
   * sized/laid out identically either way, so drag mechanics never change
   * when you toggle it.
   */
  showBox?: boolean;
  registerRef?: (el: HTMLDivElement | null) => void;
  onContextMenu?: (e: MouseEvent<HTMLDivElement>) => void;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const style: CSSProperties = {
    width: size.width,
    height: size.height,
    ...distributionStyle(axis, distribution),
  };

  return (
    <SortableContext id={id} items={items} strategy={strategy}>
      <div
        ref={(el) => {
          setNodeRef(el);
          registerRef?.(el);
        }}
        className={`container container--${axis}${dashed ? " container--dashed" : ""}${showBox ? "" : " container--boxless"}${isOver ? " is-over" : ""}${highlighted ? " is-arrow-target" : ""}`}
        style={style}
        onContextMenu={onContextMenu}
      >
        {children}
      </div>
    </SortableContext>
  );
}
