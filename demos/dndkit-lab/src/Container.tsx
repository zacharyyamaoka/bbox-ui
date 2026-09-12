import { useDroppable } from "@dnd-kit/core";
import { SortableContext, type SortingStrategy } from "@dnd-kit/sortable";
import type { CSSProperties, ReactNode } from "react";

import type { Size, SpacingScheme } from "./types";

export function Container({
  id,
  items,
  strategy,
  axis,
  spacing,
  size,
  children,
}: {
  id: string;
  items: string[];
  strategy: SortingStrategy;
  axis: "row" | "column";
  spacing: SpacingScheme;
  size: Size;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const style: CSSProperties = {
    width: size.width,
    height: size.height,
    justifyContent: spacing,
  };

  return (
    <SortableContext id={id} items={items} strategy={strategy}>
      <div
        ref={setNodeRef}
        className={`container container--${axis}${isOver ? " is-over" : ""}`}
        style={style}
      >
        {children}
      </div>
    </SortableContext>
  );
}
