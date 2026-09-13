import { horizontalListSortingStrategy, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { PortTextLayout } from "@bbox-ui/core";
import type { MouseEvent } from "react";

import { SortablePortCard } from "./Card";
import { Container, EdgeLineMark } from "./Container";
import type { Distribution, EdgeSide, Size } from "./types";

const AXIS_FOR_EDGE: Record<EdgeSide, "row" | "column"> = {
  top: "row",
  bottom: "row",
  left: "column",
  right: "column",
};

// The label always flows INWARD, toward the Block this edge belongs to — the
// same rule bbox-ui's own `inwardTextLayout` encodes for a real Port anchored
// on a container boundary (see @bbox-ui/core/layout). Kept as a local literal
// map rather than importing that helper: it speaks in `BlockSide`/full
// `PortTextLayout`, and re-deriving "left/right" from this demo's four literal
// edges is clearer here than bridging the two vocabularies.
const INWARD_TEXT_LAYOUT: Record<EdgeSide, PortTextLayout> = {
  left: "right",
  right: "left",
  top: "bot",
  bottom: "top",
};

/**
 * One edge of a Block: a droppable, sortable strip of ports (or their
 * placeholder cards, pre-`showPorts`). Turns out "port edge" didn't need a
 * bespoke primitive — it's `Container` plus which way it faces.
 */
export function PortEdge({
  id,
  edge,
  items,
  distribution,
  size,
  showPorts,
  showContainer = true,
  showCenterLine = true,
  highlighted,
  onContextMenuContainer,
  onContextMenuCard,
}: {
  id: string;
  edge: EdgeSide;
  items: string[];
  distribution: Distribution;
  size: Size;
  showPorts: boolean;
  /** Dev-time box — off is how it sits once a real Block draws its own outline. */
  showContainer?: boolean;
  /** Dev-time guide for where the edge line actually is; a real Block IS the line. */
  showCenterLine?: boolean;
  highlighted?: boolean;
  onContextMenuContainer?: (e: MouseEvent<HTMLDivElement>) => void;
  onContextMenuCard?: (e: MouseEvent<HTMLDivElement>, cardId: string) => void;
}) {
  const axis = AXIS_FOR_EDGE[edge];
  const strategy = axis === "row" ? horizontalListSortingStrategy : verticalListSortingStrategy;

  return (
    <Container
      id={id}
      items={items}
      strategy={strategy}
      axis={axis}
      distribution={distribution}
      size={size}
      dashed
      showBox={showContainer}
      highlighted={highlighted}
      onContextMenu={onContextMenuContainer}
    >
      {showCenterLine ? <EdgeLineMark axis={axis} /> : null}
      {items.map((cardId) => (
        <SortablePortCard
          key={cardId}
          id={cardId}
          label={cardId}
          showPort={showPorts}
          textLayout={INWARD_TEXT_LAYOUT[edge]}
          onContextMenu={onContextMenuCard ? (e) => onContextMenuCard(e, cardId) : undefined}
        />
      ))}
    </Container>
  );
}
