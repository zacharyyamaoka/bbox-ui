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
import { useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent, ReactNode } from "react";

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

// How close the arrow's tip has to get to an edge line, in px, before it
// snaps and would spawn a port there on release.
const EDGE_SNAP_THRESHOLD = 28;

type Tool = "select" | "arrow";

interface DraftArrow {
  start: Point;
  end: Point;
}

interface ContextMenuState {
  clientX: number;
  clientY: number;
  target: { type: "container"; containerId: ContainerId } | { type: "card"; cardId: string };
}

interface EdgeLine {
  orientation: "h" | "v";
  pos: number;
  from: number;
  to: number;
}

interface EdgeSnap {
  containerId: ContainerId;
  /** Board-local — for rendering the ghost card and ping. */
  local: Point;
  /** Viewport — for addCardAt, which measures against getBoundingClientRect(). */
  client: Point;
}

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

/**
 * The Block's edge as a straight line through the container, in board-local
 * px. Every edge here is axis-aligned by construction (top/bottom are
 * horizontal, left/right are vertical), so a hit-test only ever needs to
 * compare a single coordinate — no line/point vector math.
 */
function computeEdgeLine(containerId: ContainerId, containerEl: HTMLDivElement, boardRect: DOMRect): EdgeLine {
  const rect = containerEl.getBoundingClientRect();
  const left = rect.left - boardRect.left;
  const top = rect.top - boardRect.top;
  if (AXIS[containerId] === "row") {
    return { orientation: "h", pos: top + rect.height / 2, from: left, to: left + rect.width };
  }
  return { orientation: "v", pos: left + rect.width / 2, from: top, to: top + rect.height };
}

function EdgeLineMark({ axis }: { axis: "row" | "column" }) {
  return <div className={`edge-line edge-line--${axis === "row" ? "horizontal" : "vertical"}`} />;
}

function FreeContainer({
  id,
  size,
  registerRef,
  onContextMenu,
  highlighted,
  children,
}: {
  id: ContainerId;
  size: Size;
  registerRef: (id: ContainerId, el: HTMLDivElement | null) => void;
  onContextMenu?: (e: MouseEvent<HTMLDivElement>) => void;
  highlighted?: boolean;
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
      className={`container container--${axis} container--free container--dashed${isOver ? " is-over" : ""}${highlighted ? " is-arrow-target" : ""}`}
      style={{ width: size.width, height: size.height }}
      onContextMenu={onContextMenu}
    >
      <EdgeLineMark axis={axis} />
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
  const [tool, setTool] = useState<Tool>("select");
  const [draftArrow, setDraftArrow] = useState<DraftArrow | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const boardRef = useRef<HTMLDivElement | null>(null);
  const containerRefs = useRef<Record<ContainerId, HTMLDivElement | null>>({
    top: null,
    right: null,
    bottom: null,
    left: null,
  });
  const nextIdRef = useRef(11);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function registerContainerRef(id: ContainerId, el: HTMLDivElement | null) {
    containerRefs.current[id] = el;
  }

  // --- Add / delete cards (context menu + arrow-drop share these) ---

  function addCardAt(containerId: ContainerId, clientPoint: Point) {
    const id = `P${nextIdRef.current++}`;
    setItems((prev) => ({ ...prev, [containerId]: [...prev[containerId], id] }));

    const cardSize = CARD_SIZE[ORIENTATION[containerId]];
    const bounds = CONTAINER_SIZE[containerId];
    const containerEl = containerRefs.current[containerId];
    let x = CONTAINER_PADDING;
    let y = CONTAINER_PADDING;
    if (containerEl) {
      const rect = containerEl.getBoundingClientRect();
      x = clientPoint.x - rect.left - cardSize.width / 2;
      y = clientPoint.y - rect.top - cardSize.height / 2;
    }
    x = clamp(x, CONTAINER_PADDING, Math.max(bounds.width - CONTAINER_PADDING - cardSize.width, CONTAINER_PADDING));
    y = clamp(y, CONTAINER_PADDING, Math.max(bounds.height - CONTAINER_PADDING - cardSize.height, CONTAINER_PADDING));
    setFreePositions((prev) => ({ ...prev, [id]: { x, y } }));
  }

  function deleteCard(cardId: string) {
    setItems((prev) => {
      const next = { ...prev };
      for (const id of CONTAINER_IDS) next[id] = next[id].filter((c) => c !== cardId);
      return next;
    });
    setFreePositions((prev) => {
      if (!(cardId in prev)) return prev;
      const next = { ...prev };
      delete next[cardId];
      return next;
    });
  }

  function handleContainerContextMenu(e: MouseEvent<HTMLDivElement>, containerId: ContainerId) {
    e.preventDefault();
    setContextMenu({ clientX: e.clientX, clientY: e.clientY, target: { type: "container", containerId } });
  }

  function handleCardContextMenu(e: MouseEvent<HTMLDivElement>, cardId: string) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ clientX: e.clientX, clientY: e.clientY, target: { type: "card", cardId } });
  }

  // Close the context menu on any click outside it, and on Escape; enter/exit
  // the arrow tool on 'a' / Escape, tldraw-style.
  useEffect(() => {
    if (!contextMenu) return;
    function onPointerDown(e: globalThis.PointerEvent) {
      if (!(e.target as HTMLElement).closest(".context-menu")) setContextMenu(null);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [contextMenu]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setTool("select");
        setDraftArrow(null);
        setContextMenu(null);
        return;
      }
      if (e.key.toLowerCase() === "a" && tool === "select" && !contextMenu && !activeId) {
        setTool("arrow");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tool, contextMenu, activeId]);

  // --- Arrow tool: draw a line, snap its tip to an axis-aligned edge ---

  function boardLocalPoint(e: { clientX: number; clientY: number }): Point {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function findEdgeSnap(point: Point): EdgeSnap | null {
    const boardRect = boardRef.current?.getBoundingClientRect();
    if (!boardRect) return null;
    for (const id of CONTAINER_IDS) {
      const el = containerRefs.current[id];
      if (!el) continue;
      const line = computeEdgeLine(id, el, boardRect);
      let local: Point | null = null;
      if (line.orientation === "h") {
        if (
          Math.abs(point.y - line.pos) <= EDGE_SNAP_THRESHOLD &&
          point.x >= line.from - EDGE_SNAP_THRESHOLD &&
          point.x <= line.to + EDGE_SNAP_THRESHOLD
        ) {
          local = { x: clamp(point.x, line.from, line.to), y: line.pos };
        }
      } else if (
        Math.abs(point.x - line.pos) <= EDGE_SNAP_THRESHOLD &&
        point.y >= line.from - EDGE_SNAP_THRESHOLD &&
        point.y <= line.to + EDGE_SNAP_THRESHOLD
      ) {
        local = { x: line.pos, y: clamp(point.y, line.from, line.to) };
      }
      if (local) {
        return { containerId: id, local, client: { x: boardRect.left + local.x, y: boardRect.top + local.y } };
      }
    }
    return null;
  }

  function handleOverlayPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (tool !== "arrow") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const point = boardLocalPoint(e);
    setDraftArrow({ start: point, end: point });
  }

  function handleOverlayPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!draftArrow) return;
    setDraftArrow((prev) => (prev ? { ...prev, end: boardLocalPoint(e) } : prev));
  }

  function handleOverlayPointerUp() {
    if (!draftArrow) return;
    const snap = findEdgeSnap(draftArrow.end);
    if (snap) addCardAt(snap.containerId, snap.client);
    setDraftArrow(null);
    setTool("select");
  }

  const liveSnap = draftArrow ? findEdgeSnap(draftArrow.end) : null;

  // --- Sortable drag (unrelated to the arrow tool above) ---

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

  function renderContainer(id: ContainerId, axis: "row" | "column", strategy: typeof horizontalListSortingStrategy) {
    const highlighted = liveSnap?.containerId === id;
    if (custom) {
      return (
        <FreeContainer
          id={id}
          size={CONTAINER_SIZE[id]}
          registerRef={registerContainerRef}
          onContextMenu={(e) => handleContainerContextMenu(e, id)}
          highlighted={highlighted}
        >
          {items[id].map((cardId) => (
            <FreeCard
              key={cardId}
              id={cardId}
              label={cardId}
              orientation={ORIENTATION[id]}
              direction={DIRECTION[id]}
              x={freePositions[cardId]?.x ?? CONTAINER_PADDING}
              y={freePositions[cardId]?.y ?? CONTAINER_PADDING}
              onContextMenu={(e) => handleCardContextMenu(e, cardId)}
            />
          ))}
        </FreeContainer>
      );
    }
    return (
      <Container
        id={id}
        items={items[id]}
        strategy={strategy}
        axis={axis}
        spacing={spacing}
        size={CONTAINER_SIZE[id]}
        dashed
        registerRef={(el) => registerContainerRef(id, el)}
        onContextMenu={(e) => handleContainerContextMenu(e, id)}
      >
        <EdgeLineMark axis={axis} />
        {items[id].map((cardId) => (
          <SortableCard
            key={cardId}
            id={cardId}
            label={cardId}
            orientation={ORIENTATION[id]}
            direction={DIRECTION[id]}
            onContextMenu={(e) => handleCardContextMenu(e, cardId)}
          />
        ))}
      </Container>
    );
  }

  return (
    <section className="stage">
      <header className="stage__header">
        <h2>3. Four containers around a block — the port interaction</h2>
        <p>
          Drag a card (port) to any of the four edges. In Auto mode the containers evenly
          space their cards as you move things around; turn on Custom and cards stop
          reflowing — they stay exactly where you drop them, and still move between edges.
          Each card's arrow is its polarity — it always points away from the Block, and
          flips the instant the card crosses to a different edge. Right-click a container to
          add a card, or a card to delete it.
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
          <span className={`tool-hint${tool === "arrow" ? " is-active" : ""}`}>
            {tool === "arrow" ? (
              "Drawing — release near an edge to create a port there (Esc to cancel)"
            ) : (
              <>
                Press <kbd>A</kbd> to draw an arrow — it creates a port where it meets an edge
              </>
            )}
          </span>
        </div>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="board" ref={boardRef}>
          <div className="board__top">{renderContainer("top", "row", horizontalListSortingStrategy)}</div>
          <div className="board__left">{renderContainer("left", "column", verticalListSortingStrategy)}</div>
          <div className="board__center">
            <div className="block">Block</div>
          </div>
          <div className="board__right">{renderContainer("right", "column", verticalListSortingStrategy)}</div>
          <div className="board__bottom">{renderContainer("bottom", "row", horizontalListSortingStrategy)}</div>

          <div
            className={`board-arrow-overlay${tool === "arrow" ? " is-active" : ""}`}
            onPointerDown={handleOverlayPointerDown}
            onPointerMove={handleOverlayPointerMove}
            onPointerUp={handleOverlayPointerUp}
          >
            <svg width="100%" height="100%">
              <defs>
                <marker
                  id="dndkit-lab-arrowhead"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" style={{ fill: "var(--accent)" }} />
                </marker>
              </defs>
              {draftArrow ? (
                <line
                  x1={draftArrow.start.x}
                  y1={draftArrow.start.y}
                  x2={draftArrow.end.x}
                  y2={draftArrow.end.y}
                  style={{ stroke: "var(--accent)", strokeWidth: 2 }}
                  markerEnd="url(#dndkit-lab-arrowhead)"
                />
              ) : null}
            </svg>
            {liveSnap ? (
              <div
                className={`card card--ghost card--${ORIENTATION[liveSnap.containerId]}`}
                style={{
                  left: liveSnap.local.x - CARD_SIZE[ORIENTATION[liveSnap.containerId]].width / 2,
                  top: liveSnap.local.y - CARD_SIZE[ORIENTATION[liveSnap.containerId]].height / 2,
                }}
              >
                <span className="card__label">+</span>
              </div>
            ) : null}
          </div>
        </div>

        <DragOverlay>
          {activeId ? (
            <CardPreview label={activeId} orientation={activeOrientation} direction={activeDirection} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {contextMenu ? (
        <div className="context-menu" style={{ left: contextMenu.clientX, top: contextMenu.clientY }}>
          {contextMenu.target.type === "container" ? (
            <button
              type="button"
              onClick={() => {
                addCardAt(contextMenu.target.type === "container" ? contextMenu.target.containerId : "top", {
                  x: contextMenu.clientX,
                  y: contextMenu.clientY,
                });
                setContextMenu(null);
              }}
            >
              Add card
            </button>
          ) : (
            <button
              type="button"
              className="is-destructive"
              onClick={() => {
                if (contextMenu.target.type === "card") deleteCard(contextMenu.target.cardId);
                setContextMenu(null);
              }}
            >
              Delete
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
