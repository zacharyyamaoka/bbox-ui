import { useDroppable } from "@dnd-kit/core";
import { SortableContext, type SortingStrategy } from "@dnd-kit/sortable";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

import type { Size, SpacingScheme } from "./types";

export function Container({
  id,
  items,
  strategy,
  axis,
  spacing,
  size,
  dashed,
  registerRef,
  onContextMenu,
  children,
}: {
  id: string;
  items: string[];
  strategy: SortingStrategy;
  axis: "row" | "column";
  spacing: SpacingScheme;
  size: Size;
  dashed?: boolean;
  registerRef?: (el: HTMLDivElement | null) => void;
  onContextMenu?: (e: MouseEvent<HTMLDivElement>) => void;
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
        ref={(el) => {
          setNodeRef(el);
          registerRef?.(el);
        }}
        className={`container container--${axis}${dashed ? " container--dashed" : ""}${isOver ? " is-over" : ""}`}
        style={style}
        onContextMenu={onContextMenu}
      >
        {children}
      </div>
    </SortableContext>
  );
}
