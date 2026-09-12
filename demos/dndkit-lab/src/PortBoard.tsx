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
import {
  CONTAINER_BORDER,
  CONTAINER_PADDING,
  clamp,
  innerBoxSize,
  mainAxisPositions,
  type Point,
} from "./layout";
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
  /** Board-local — where the ghost card and the snapped arrow tip are drawn. */
  local: Point;
  /**
   * How far along the container's main axis the snap landed, measured from
   * its padding-box origin — the one number `addCardAt` needs. Keeping the
   * snap in the container's own space means the drop point never makes a
   * round trip back out through viewport coordinates to be re-measured.
   */
  mainOffset: number;
}

function findContainer(items: Record<ContainerId, string[]>, id: string): ContainerId | undefined {
  if ((CONTAINER_IDS as string[]).includes(id)) return id as ContainerId;
  return CONTAINER_IDS.find((key) => items[key].includes(id));
}

/**
 * The fixed cross-axis coordinate that puts a card exactly on the edge
 * line — top/bottom containers are locked in y, left/right in x. Free mode
 * only ever gives a card freedom along the main axis; this is what the
 * edge actually meant by "a line", not just a container boundary.
 *
 * WHY it centres in the PADDING box and ignores CONTAINER_PADDING: the edge
 * line is at 50% of that same padding box, and a free card's `top`/`left` is
 * resolved against it too. Measuring the old way (content box + padding)
 * dropped the border, landing every Custom-mode card 2px off the line it was
 * supposed to be sitting on — and 2px off the ghost that previewed it.
 */
function crossCenterFor(containerId: ContainerId): number {
  const axis = AXIS[containerId];
  const cardSize = CARD_SIZE[ORIENTATION[containerId]];
  const innerBox = innerBoxSize(CONTAINER_SIZE[containerId]);
  const crossSize = axis === "row" ? innerBox.height : innerBox.width;
  const cardCross = axis === "row" ? cardSize.height : cardSize.width;
  return (crossSize - cardCross) / 2;
}

/** Main-axis size of the content box the flex layout distributes cards across. */
function mainContentSize(containerId: ContainerId): number {
  const innerBox = innerBoxSize(CONTAINER_SIZE[containerId]);
  const main = AXIS[containerId] === "row" ? innerBox.width : innerBox.height;
  return main - 2 * CONTAINER_PADDING;
}

/**
 * Hold a free-positioned card inside its container's padding box, and pinned
 * to the edge line on the cross axis. Every path that places a card — the
 * arrow tool, the context menu, and the end of a free drag — goes through
 * here, so they cannot disagree about where "on the line" is.
 */
function clampCardPosition(containerId: ContainerId, point: Point): Point {
  const cardSize = CARD_SIZE[ORIENTATION[containerId]];
  const innerBox = innerBoxSize(CONTAINER_SIZE[containerId]);
  const x = clamp(
    point.x,
    CONTAINER_PADDING,
    Math.max(innerBox.width - CONTAINER_PADDING - cardSize.width, CONTAINER_PADDING),
  );
  const y = clamp(
    point.y,
    CONTAINER_PADDING,
    Math.max(innerBox.height - CONTAINER_PADDING - cardSize.height, CONTAINER_PADDING),
  );
  const cross = crossCenterFor(containerId);
  return AXIS[containerId] === "row" ? { x, y: cross } : { x: cross, y };
}

/** Where the flex layout (auto mode) is currently placing every card in one container. */
function computeContainerFreePositions(
  containerId: ContainerId,
  ids: string[],
  scheme: SpacingScheme,
): Record<string, Point> {
  const axis = AXIS[containerId];
  const cardSize = CARD_SIZE[ORIENTATION[containerId]];
  const cardMain = axis === "row" ? cardSize.width : cardSize.height;

  const mains = mainAxisPositions(ids.length, mainContentSize(containerId), cardMain, scheme);
  const crossPos = crossCenterFor(containerId);

  const result: Record<string, Point> = {};
  ids.forEach((id, i) => {
    const main = mains[i] + CONTAINER_PADDING;
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
function computeEdgeLine(containerId: ContainerId, rect: DOMRect, boardRect: DOMRect): EdgeLine {
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

  /**
   * Create a card `mainOffset` px along a container's main axis, measured
   * from its padding-box origin — that offset is the new card's CENTRE, so it
   * lands exactly under the arrow tip (or the right-click) that asked for it.
   */
  function addCardAt(containerId: ContainerId, mainOffset: number) {
    const id = `P${nextIdRef.current++}`;
    const axis = AXIS[containerId];
    const cardSize = CARD_SIZE[ORIENTATION[containerId]];
    const cardMain = axis === "row" ? cardSize.width : cardSize.height;

    setItems((prev) => {
      // WHY an insertion index and not just a position: in Auto mode the flex
      // layout owns position outright, so "create it where I dropped" can only
      // mean "in the slot my drop point fell in". Appending sent every
      // arrow-drawn port to the far end of the row instead — contradicting the
      // ghost card that had just previewed it in place.
      const existing = prev[containerId];
      const laidOut = computeContainerFreePositions(containerId, existing, spacing);
      const insertAt = existing.filter((cardId) => {
        const p = laidOut[cardId];
        return (axis === "row" ? p.x : p.y) + cardMain / 2 < mainOffset;
      }).length;
      return {
        ...prev,
        [containerId]: [...existing.slice(0, insertAt), id, ...existing.slice(insertAt)],
      };
    });

    const main = mainOffset - cardMain / 2;
    const seed = axis === "row" ? { x: main, y: 0 } : { x: 0, y: main };
    setFreePositions((prev) => ({ ...prev, [id]: clampCardPosition(containerId, seed) }));
  }

  /** Where a viewport point falls along one container's main axis, in its padding box. */
  function mainOffsetFromClient(containerId: ContainerId, clientPoint: Point): number {
    const el = containerRefs.current[containerId];
    if (!el) return CONTAINER_PADDING;
    const rect = el.getBoundingClientRect();
    const along = AXIS[containerId] === "row" ? clientPoint.x - rect.left : clientPoint.y - rect.top;
    return along - CONTAINER_BORDER;
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
        // Dropping the draft also tears down the window listeners, so the
        // pointerup that ends a cancelled drag can no longer spawn a port.
        setTool("select");
        setDraftArrow(null);
        setContextMenu(null);
        return;
      }
      // `A` is a bare shortcut, so Ctrl/Cmd+A (select all) and text entry must
      // not arm the tool. Checkboxes and buttons are left alone — they don't
      // consume letters, and the Custom toggle is the control most likely to
      // hold focus when you reach for the arrow tool.
      const target = e.target as HTMLElement | null;
      const typing = target?.closest(
        "input:not([type='checkbox']):not([type='radio']), textarea, [contenteditable='true']",
      );
      if (e.ctrlKey || e.metaKey || e.altKey || typing) return;
      if (e.key.toLowerCase() === "a" && tool === "select" && !contextMenu && !activeId) {
        setTool("arrow");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tool, contextMenu, activeId]);

  // --- Arrow tool: draw a line, snap its tip to an axis-aligned edge ---

  /**
   * The single coordinate space this whole tool works in: px relative to
   * `.board`. It is read live from getBoundingClientRect on every event, so
   * scrolling and reflow can never stale it.
   *
   * WHY it is also a layout contract: the overlay that DRAWS in this space is
   * `position: absolute; inset: 0`, so the two only agree while `.board` is a
   * positioned ancestor. Take `position: relative` off `.board` and this
   * function keeps returning correct numbers while everything drawn from them
   * silently moves to the page's top-left corner — which is exactly how this
   * shipped broken. See the WHY on `.board` in index.css.
   */
  function boardLocalPoint(e: { clientX: number; clientY: number }): Point {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function findEdgeSnap(point: Point): EdgeSnap | null {
    const boardRect = boardRef.current?.getBoundingClientRect();
    if (!boardRect) return null;

    let best: (EdgeSnap & { distance: number }) | null = null;
    for (const id of CONTAINER_IDS) {
      const el = containerRefs.current[id];
      if (!el) continue;
      const line = computeEdgeLine(id, el.getBoundingClientRect(), boardRect);
      // Every edge is axis-aligned by construction, so "across" is the single
      // coordinate the hit-test measures and "along" is the one it slides on.
      const across = line.orientation === "h" ? point.y : point.x;
      const along = line.orientation === "h" ? point.x : point.y;

      const distance = Math.abs(across - line.pos);
      if (distance > EDGE_SNAP_THRESHOLD) continue;
      if (along < line.from - EDGE_SNAP_THRESHOLD || along > line.to + EDGE_SNAP_THRESHOLD) continue;
      // WHY nearest rather than first match: the four snap bands are disjoint
      // in today's layout, so list order happened to be harmless — but that is
      // a property of the current CONTAINER_SIZE/grid numbers, not of the
      // hit-test, and it would break silently the moment they move.
      if (best && best.distance <= distance) continue;

      const snappedAlong = clamp(along, line.from, line.to);
      best = {
        containerId: id,
        local:
          line.orientation === "h"
            ? { x: snappedAlong, y: line.pos }
            : { x: line.pos, y: snappedAlong },
        mainOffset: snappedAlong - line.from - CONTAINER_BORDER,
        distance,
      };
    }
    return best;
  }

  /**
   * The press starts the gesture; `window` owns the rest of it (see below).
   */
  function handleOverlayPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (tool !== "arrow" || e.button !== 0) return;
    // Suppresses the text selection an unmodified drag across the page would
    // otherwise start — the job setPointerCapture used to be doing here.
    e.preventDefault();
    const point = boardLocalPoint(e);
    setDraftArrow({ start: point, end: point });
  }

  /**
   * The live part of the drag listens on `window`, not on the overlay.
   *
   * WHY, and why not setPointerCapture: the overlay is exactly the board's
   * box, so releasing the mouse just outside it — off the end of an arrow you
   * dragged toward an edge — is an ordinary thing to do. The overlay's own
   * pointerup never fires for that release, which left the draft arrow stuck
   * on screen and the tool armed with no way out but Escape. Pointer capture
   * is the usual answer and the old code reached for it, but it is a
   * capability that can be lost (measured: this app's own capture is released
   * before the next event arrives under CDP-driven input) and relying on it
   * makes finishing a gesture conditional. A window listener cannot be lost.
   *
   * Re-subscribing per move is deliberate: every handler below then closes
   * over the current render, so no stale `items`/`spacing` can leak into the
   * card this gesture creates.
   */
  useEffect(() => {
    if (!draftArrow) return;

    function onMove(e: globalThis.PointerEvent) {
      const point = boardLocalPoint(e);
      setDraftArrow((prev) => (prev ? { ...prev, end: point } : prev));
    }
    function onUp(e: globalThis.PointerEvent) {
      // WHY the release event's own point and not `draftArrow.end`: the final
      // pointermove can be coalesced away, and a bare click produces none at
      // all — either would snap the port to a stale position.
      const snap = findEdgeSnap(boardLocalPoint(e));
      if (snap) addCardAt(snap.containerId, snap.mainOffset);
      setDraftArrow(null);
      setTool("select");
    }
    function onCancel() {
      setDraftArrow(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    // No dependency array on purpose — see above. Adding one re-introduces the
    // stale closure this shape exists to avoid.
  });

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

      // The drag itself is free in both axes (the card follows the pointer
      // exactly, mid-gesture) — only ON DROP does the cross axis snap back
      // onto the edge line, leaving just the main axis draggable.
      return { ...prev, [cardId]: clampCardPosition(toContainer, { x: nextX, y: nextY }) };
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
        highlighted={highlighted}
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
          >
            <svg>
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
                  // Once the tip is in range the line ends ON the edge, not at
                  // the raw pointer — the arrow showing the snap is what makes
                  // the snap legible before you commit to it.
                  x2={liveSnap ? liveSnap.local.x : draftArrow.end.x}
                  y2={liveSnap ? liveSnap.local.y : draftArrow.end.y}
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
                const containerId =
                  contextMenu.target.type === "container" ? contextMenu.target.containerId : "top";
                addCardAt(
                  containerId,
                  mainOffsetFromClient(containerId, { x: contextMenu.clientX, y: contextMenu.clientY }),
                );
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
