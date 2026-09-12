import { useDraggable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";

import type { Orientation } from "./types";

export function SortableCard({
  id,
  label,
  orientation,
}: {
  id: string;
  label: string;
  orientation: Orientation;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card card--${orientation}${isDragging ? " is-dragging" : ""}`}
      {...attributes}
      {...listeners}
    >
      {label}
    </div>
  );
}

export function FreeCard({
  id,
  label,
  orientation,
  x,
  y,
}: {
  id: string;
  label: string;
  orientation: Orientation;
  x: number;
  y: number;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });

  const style: CSSProperties = {
    position: "absolute",
    left: x,
    top: y,
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card card--${orientation}${isDragging ? " is-dragging" : ""}`}
      {...attributes}
      {...listeners}
    >
      {label}
    </div>
  );
}

export function CardPreview({ label, orientation }: { label: string; orientation: Orientation }) {
  return <div className={`card card--${orientation} card--overlay`}>{label}</div>;
}
