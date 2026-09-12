import { useDraggable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties, MouseEvent } from "react";

import type { Direction, Orientation } from "./types";

const ROTATION: Record<Direction, number> = { N: 0, E: 90, S: 180, W: 270 };

function DirectionArrow({ direction }: { direction: Direction }) {
  return (
    <svg
      className="card__arrow"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      style={{ transform: `rotate(${ROTATION[direction]}deg)` }}
    >
      <path d="M12 1 L21 15 L14 15 L14 23 L10 23 L10 15 L3 15 Z" fill="currentColor" />
    </svg>
  );
}

function CardBody({ label, direction }: { label: string; direction?: Direction }) {
  return (
    <>
      {direction ? <DirectionArrow direction={direction} /> : null}
      <span className="card__label">{label}</span>
    </>
  );
}

export function SortableCard({
  id,
  label,
  orientation,
  direction,
  onContextMenu,
}: {
  id: string;
  label: string;
  orientation: Orientation;
  direction?: Direction;
  onContextMenu?: (e: MouseEvent<HTMLDivElement>) => void;
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
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
    >
      <CardBody label={label} direction={direction} />
    </div>
  );
}

export function FreeCard({
  id,
  label,
  orientation,
  direction,
  x,
  y,
  onContextMenu,
}: {
  id: string;
  label: string;
  orientation: Orientation;
  direction?: Direction;
  x: number;
  y: number;
  onContextMenu?: (e: MouseEvent<HTMLDivElement>) => void;
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
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
    >
      <CardBody label={label} direction={direction} />
    </div>
  );
}

export function CardPreview({
  label,
  orientation,
  direction,
}: {
  label: string;
  orientation: Orientation;
  direction?: Direction;
}) {
  return (
    <div className={`card card--${orientation} card--overlay`}>
      <CardBody label={label} direction={direction} />
    </div>
  );
}
