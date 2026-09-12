import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, horizontalListSortingStrategy, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useRef, useState } from "react";
import type { ReactNode } from "react";

import { CardPreview, FreeCard, SortableCard } from "./Card";
import { Container } from "./Container";
import { CONTAINER_PADDING, clamp, mainAxisPositions, type Point } from "./layout";
import { SpacingControl } from "./SpacingControl";
import type { Direction, Orientation, Size, SpacingScheme } from "./types";

type ContainerId = "top" | "right" | "bottom" | "left";
const CONTAINER_IDS: ContainerId[] = ["top", "right", "bottom", "left"];

const AXIS: Record<ContainerId, "row" | "column"> = {
  top: "row",
  bottom: "row",
  left: "column",
  right: "column",
};

// A port's peg is drawn perpendicular to the edge it's mounted on — top/bottom
// edges hold upright (portrait) pegs, left/right edges hold sideways
// (landscape) ones. Orientation therefore belongs to the CONTAINER, not the
// card: the same port flips shape when it crosses to an adjacent edge.
const ORIENTATION: Record<ContainerId, Orientation> = {
  top: "portrait",
  bottom: "portrait",
  left: "landscape",
  right: "landscape",
};

// The polarity arrow always points away from the center Block, so it's the
// exact opposite reading of which side of the board a container sits on.
const DIRECTION: Record<ContainerId, Direction> = {
  top: "N",
  right: "E",
  bottom: "S",
  left: "W",
};

const CARD_SIZE: Record<Orientation, Size> = {
  portrait: { width: 70, height: 100 },
  landscape: { width: 100, height: 70 },
};

const CONTAINER_SIZE: Record<ContainerId, Size> = {
  top: { width: 520, height: 140 },
  bottom: { width: 520, height: 140 },
  left: { width: 200, height: 420 },
  right: { width: 200, height: 420 },
};

const INITIAL_ITEMS: Record<ContainerId, string[]> = {
  top: ["P1", "P2", "P3", "P4"],
  right: ["P5", "P6"],
  bottom: ["P7"],
  left: ["P8", "P9", "P10"],
};

function findContainer(items: Record<ContainerId, string[]>, id: string): ContainerId | undefined {
  if ((CONTAINER_IDS as string[]).includes(id)) return id as ContainerId;
  return CONTAINER_IDS.find((key) => items[key].includes(id));
}

/** Where the flex layout (auto mode) is currently placing every card in one container. */
function computeContainerFreePositions(
  containerId: ContainerId,
  ids: string[],
  scheme: SpacingScheme,
): Record<string, Point> {
  const axis = AXIS[containerId];
  const orientation = ORIENTATION[containerId];
  const cardSize = CARD_SIZE[orientation];
  const containerSize = CONTAINER_SIZE[containerId];

  const mainSize = (axis === "row" ? containerSize.width : containerSize.height) - 2 * CONTAINER_PADDING;
  const crossSize = (axis === "row" ? containerSize.height : containerSize.width) - 2 * CONTAINER_PADDING;
  const cardMain = axis === "row" ? cardSize.width : cardSize.height;
  const cardCross = axis === "row" ? cardSize.height : cardSize.width;

  const mains = mainAxisPositions(ids.length, mainSize, cardMain, scheme);
  const cross = (crossSize - cardCross) / 2;

  const result: Record<string, Point> = {};
  ids.forEach((id, i) => {
    const main = mains[i] + CONTAINER_PADDING;
    const crossPos = cross + CONTAINER_PADDING;
    result[id] = axis === "row" ? { x: main, y: crossPos } : { x: crossPos, y: main };
  });
  return result;
}

function computeAllFreePositions(
  items: Record<ContainerId, string[]>,
  scheme: SpacingScheme,
): Record<string, Point> {
  return CONTAINER_IDS.reduce<Record<string, Point>>((acc, id) => {
    Object.assign(acc, computeContainerFreePositions(id, items[id], scheme));
    return acc;
  }, {});
}

/** On leaving Custom mode, order each container by where cards were visually left, so Auto doesn't reshuffle them. */
function sortByFreePosition(
  items: Record<ContainerId, string[]>,
  positions: Record<string, Point>,
): Record<ContainerId, string[]> {
  const next = { ...items };
  for (const id of CONTAINER_IDS) {
    const axis = AXIS[id];
    next[id] = [...items[id]].sort((a, b) => {
      const pa = positions[a] ?? { x: 0, y: 0 };
      const pb = positions[b] ?? { x: 0, y: 0 };
      return axis === "row" ? pa.x - pb.x : pa.y - pb.y;
    });
  }
  return next;
}

function FreeContainer({
  id,
  size,
  registerRef,
  children,
}: {
  id: ContainerId;
  size: Size;
  registerRef: (id: ContainerId, el: HTMLDivElement | null) => void;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const axis = AXIS[id];
  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        registerRef(id, el);
      }}
      className={`container container--${axis} container--free${isOver ? " is-over" : ""}`}
      style={{ width: size.width, height: size.height }}
    >
      {children}
    </div>
  );
}

export function PortBoard() {
  const [items, setItems] = useState<Record<ContainerId, string[]>>(INITIAL_ITEMS);
  const [spacing, setSpacing] = useState<SpacingScheme>("space-between");
  const [custom, setCustom] = useState(false);
  const [freePositions, setFreePositions] = useState<Record<string, Point>>(() =>
    computeAllFreePositions(INITIAL_ITEMS, "space-between"),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const containerRefs = useRef<Record<ContainerId, HTMLDivElement | null>>({
    top: null,
    right: null,
    bottom: null,
    left: null,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function registerContainerRef(id: ContainerId, el: HTMLDivElement | null) {
    containerRefs.current[id] = el;
  }

  function handleToggleCustom(next: boolean) {
    if (next) {
      setFreePositions(computeAllFreePositions(items, spacing));
    } else {
      setItems((prev) => sortByFreePosition(prev, freePositions));
    }
    setCustom(next);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragOver(event: DragOverEvent) {
    if (custom) return;
    const { active, over } = event;
    if (!over) return;
    const activeCardId = active.id as string;
    const overId = over.id as string;
    const activeContainer = findContainer(items, activeCardId);
    const overContainer = findContainer(items, overId);
    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    setItems((prev) => {
      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];
      const overIndex = overItems.indexOf(overId);
      const newIndex = overIndex >= 0 ? overIndex : overItems.length;

      return {
        ...prev,
        [activeContainer]: activeItems.filter((id) => id !== activeCardId),
        [overContainer]: [
          ...overItems.slice(0, newIndex),
          activeCardId,
          ...overItems.slice(newIndex),
        ],
      };
    });
  }

  function handleFreeDragEnd(event: DragEndEvent) {
    const { active, delta, over } = event;
    const cardId = active.id as string;
    const fromContainer = findContainer(items, cardId);
    if (!fromContainer) return;
    const toContainer = (over?.id as ContainerId | undefined) ?? fromContainer;

    setFreePositions((prev) => {
      const current = prev[cardId] ?? { x: CONTAINER_PADDING, y: CONTAINER_PADDING };
      let nextX = current.x + delta.x;
      let nextY = current.y + delta.y;

      if (toContainer !== fromContainer) {
        const fromEl = containerRefs.current[fromContainer];
        const toEl = containerRefs.current[toContainer];
        if (fromEl && toEl) {
          const fromRect = fromEl.getBoundingClientRect();
          const toRect = toEl.getBoundingClientRect();
          nextX += fromRect.left - toRect.left;
          nextY += fromRect.top - toRect.top;
        }
      }

      const cardSize = CARD_SIZE[ORIENTATION[toContainer]];
      const bounds = CONTAINER_SIZE[toContainer];
      nextX = clamp(nextX, CONTAINER_PADDING, Math.max(bounds.width - CONTAINER_PADDING - cardSize.width, CONTAINER_PADDING));
      nextY = clamp(nextY, CONTAINER_PADDING, Math.max(bounds.height - CONTAINER_PADDING - cardSize.height, CONTAINER_PADDING));

      return { ...prev, [cardId]: { x: nextX, y: nextY } };
    });

    if (toContainer !== fromContainer) {
      setItems((prev) => {
        const next = { ...prev };
        next[fromContainer] = next[fromContainer].filter((id) => id !== cardId);
        next[toContainer] = [...next[toContainer], cardId];
        return next;
      });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (custom) {
      handleFreeDragEnd(event);
      return;
    }
    const { active, over } = event;
    if (!over) return;
    const activeCardId = active.id as string;
    const overId = over.id as string;
    const activeContainer = findContainer(items, activeCardId);
    const overContainer = findContainer(items, overId);
    if (!activeContainer || !overContainer || activeContainer !== overContainer) return;

    const activeIndex = items[activeContainer].indexOf(activeCardId);
    const overIndex = items[overContainer].indexOf(overId);
    if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
      setItems((prev) => ({
        ...prev,
        [overContainer]: arrayMove(prev[overContainer], activeIndex, overIndex),
      }));
    }
  }

  const activeContainerId = activeId ? (findContainer(items, activeId) ?? "top") : "top";
  const activeOrientation = ORIENTATION[activeContainerId];
  const activeDirection = DIRECTION[activeContainerId];

  return (
    <section className="stage">
      <header className="stage__header">
        <h2>3. Four containers around a block — the port interaction</h2>
        <p>
          Drag a card (port) to any of the four edges. In Auto mode the containers evenly
          space their cards as you move things around; turn on Custom and cards stop
          reflowing — they stay exactly where you drop them, and still move between edges.
          Each card's arrow is its polarity — it always points away from the Block, and
          flips the instant the card crosses to a different edge.
        </p>
        <div className="controls-row">
          <label className="toggle">
            <input
              type="checkbox"
              checked={custom}
              onChange={(e) => handleToggleCustom(e.target.checked)}
            />
            Custom (freeform position)
          </label>
          <SpacingControl value={spacing} onChange={setSpacing} disabled={custom} />
        </div>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="board">
          <div className="board__top">
            {custom ? (
              <FreeContainer id="top" size={CONTAINER_SIZE.top} registerRef={registerContainerRef}>
                {items.top.map((id) => (
                  <FreeCard
                    key={id}
                    id={id}
                    label={id}
                    orientation="portrait"
                    direction={DIRECTION.top}
                    x={freePositions[id]?.x ?? CONTAINER_PADDING}
                    y={freePositions[id]?.y ?? CONTAINER_PADDING}
                  />
                ))}
              </FreeContainer>
            ) : (
              <Container
                id="top"
                items={items.top}
                strategy={horizontalListSortingStrategy}
                axis="row"
                spacing={spacing}
                size={CONTAINER_SIZE.top}
              >
                {items.top.map((id) => (
                  <SortableCard
                    key={id}
                    id={id}
                    label={id}
                    orientation="portrait"
                    direction={DIRECTION.top}
                  />
                ))}
              </Container>
            )}
          </div>

          <div className="board__left">
            {custom ? (
              <FreeContainer id="left" size={CONTAINER_SIZE.left} registerRef={registerContainerRef}>
                {items.left.map((id) => (
                  <FreeCard
                    key={id}
                    id={id}
                    label={id}
                    orientation="landscape"
                    direction={DIRECTION.left}
                    x={freePositions[id]?.x ?? CONTAINER_PADDING}
                    y={freePositions[id]?.y ?? CONTAINER_PADDING}
                  />
                ))}
              </FreeContainer>
            ) : (
              <Container
                id="left"
                items={items.left}
                strategy={verticalListSortingStrategy}
                axis="column"
                spacing={spacing}
                size={CONTAINER_SIZE.left}
              >
                {items.left.map((id) => (
                  <SortableCard
                    key={id}
                    id={id}
                    label={id}
                    orientation="landscape"
                    direction={DIRECTION.left}
                  />
                ))}
              </Container>
            )}
          </div>

          <div className="board__center">
            <div className="block">Block</div>
          </div>

          <div className="board__right">
            {custom ? (
              <FreeContainer id="right" size={CONTAINER_SIZE.right} registerRef={registerContainerRef}>
                {items.right.map((id) => (
                  <FreeCard
                    key={id}
                    id={id}
                    label={id}
                    orientation="landscape"
                    direction={DIRECTION.right}
                    x={freePositions[id]?.x ?? CONTAINER_PADDING}
                    y={freePositions[id]?.y ?? CONTAINER_PADDING}
                  />
                ))}
              </FreeContainer>
            ) : (
              <Container
                id="right"
                items={items.right}
                strategy={verticalListSortingStrategy}
                axis="column"
                spacing={spacing}
                size={CONTAINER_SIZE.right}
              >
                {items.right.map((id) => (
                  <SortableCard
                    key={id}
                    id={id}
                    label={id}
                    orientation="landscape"
                    direction={DIRECTION.right}
                  />
                ))}
              </Container>
            )}
          </div>

          <div className="board__bottom">
            {custom ? (
              <FreeContainer id="bottom" size={CONTAINER_SIZE.bottom} registerRef={registerContainerRef}>
                {items.bottom.map((id) => (
                  <FreeCard
                    key={id}
                    id={id}
                    label={id}
                    orientation="portrait"
                    direction={DIRECTION.bottom}
                    x={freePositions[id]?.x ?? CONTAINER_PADDING}
                    y={freePositions[id]?.y ?? CONTAINER_PADDING}
                  />
                ))}
              </FreeContainer>
            ) : (
              <Container
                id="bottom"
                items={items.bottom}
                strategy={horizontalListSortingStrategy}
                axis="row"
                spacing={spacing}
                size={CONTAINER_SIZE.bottom}
              >
                {items.bottom.map((id) => (
                  <SortableCard
                    key={id}
                    id={id}
                    label={id}
                    orientation="portrait"
                    direction={DIRECTION.bottom}
                  />
                ))}
              </Container>
            )}
          </div>
        </div>

        <DragOverlay>
          {activeId ? (
            <CardPreview label={activeId} orientation={activeOrientation} direction={activeDirection} />
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}
