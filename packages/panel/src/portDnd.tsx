/**
 * packages/panel/src/portDnd.tsx
 *
 * The dispatcher: one place that chooses WHICH port-edge implementation is
 * live, and adapts the Block's own call sites to the `PortEdgesImpl`
 * contract (`portEdges/contract.tsx`).
 *
 * This file used to BE the implementation — one DndContext per Block, a
 * DragOverlay cloning `outerHTML`, and drop math read from the DOM. Zach,
 * 2026-09-12: "The ports are buggy when you move them though — stretching to
 * strange dimensions. I think before we integrate this into the block, let's
 * please get the 'port edge' component working." So the implementation moved
 * into `portEdges/`, five ways, behind a switcher; this file is now the seam
 * that makes them interchangeable and keeps `bench.tsx`/`render-instance.tsx`
 * from knowing which one is mounted.
 *
 * WHY the old ghost stretched, since the answer constrains every variant:
 * `<DragOverlay adjustScale>` does not mean "let my modifier's scale
 * through". dnd-kit's DndContext unconditionally bakes
 * `scaleX = over.rect.width / activeNodeRect.width` into the transform every
 * draggable reads (@dnd-kit/core 6.3.1, core.esm.js:2997 -> `adjustScale`,
 * :515); the PROP is only the flag that stops PositionedOverlay resetting it
 * to 1 (:3657). The ghost was therefore scaled to whatever LANE it was over
 * — measured live at zoom 1: a 33x24 ghost painted 364x26 over the 364x26
 * top lane (scaleX 10.9217) and 26x52 over the 26x52 left lane (scaleY
 * 2.16667). It only showed on the DOM render because the old zoom modifier
 * short-circuited to the identity function at zoom 1 and overwrote the scale
 * at any other. No variant passes `adjustScale`; host zoom is applied by us,
 * on the ghost's own inner div. See `portEdges/contract.tsx`'s `PortGhost`.
 */
import { createContext, useContext, useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Arrangement, PortEdgeId, Placements } from "@bbox-ui/core";

import { DEFAULT_PORT_EDGE_VARIANT, findPortEdgeVariant } from "./portEdges";
import type { PortEdgesModel } from "./portEdges";

/** Which of the five is live. A plain string on a context so a host can flip
 *  it from a switcher and every Block re-mounts its drag machinery; the
 *  losing four stay compiled in until Zach picks. */
export const PortEdgeVariantContext = createContext<string>(DEFAULT_PORT_EDGE_VARIANT);

export function usePortEdgeVariant() {
  return findPortEdgeVariant(useContext(PortEdgeVariantContext));
}

/**
 * How zoomed the host that mounted this subtree currently is. The plain DOM
 * render provides 1; React Flow provides `useViewport().zoom`; tldraw
 * provides `editor.getZoomLevel()`. Page-space geometry is client geometry
 * divided by this.
 */
export const HostZoomContext = createContext(1);

export function portLaneId(ownerId: string, edge: PortEdgeId): string {
  return `${ownerId}:lane:${edge}`;
}

export interface PortDndProviderProps {
  blockId: string;
  arrangement: Arrangement;
  placements: Placements;
  members: Record<string, ReactNode>;
  lockedMemberIds?: string[];
  /** `portIds` is every port the gesture carries — one, or all of a group's
   *  members in landing order (see portEdges/contract.tsx's `moveSlot`). */
  onMovePort: (blockId: string, portIds: string[], edge: PortEdgeId, target: { index: number } | { t: number }) => void;
  children: ReactNode;
}

/**
 * Mounted by `render-instance.tsx` around ONE Block's own render (Zach's
 * ruling: "nested contexts across Blocks are fine"), so a port drag can only
 * ever collide with THAT Block's four lanes.
 */
export function PortDndProvider({
  blockId,
  arrangement,
  placements,
  members,
  lockedMemberIds,
  onMovePort,
  children,
}: PortDndProviderProps) {
  const impl = usePortEdgeVariant();
  const zoom = useContext(HostZoomContext);
  const model: PortEdgesModel = useMemo(
    () => ({
      ownerId: blockId,
      arrangement,
      placements,
      locked: new Set(lockedMemberIds ?? []),
      members,
      zoom,
      onMovePort: (portIds, edge, target) => onMovePort(blockId, portIds, edge, target),
    }),
    [blockId, arrangement, placements, members, lockedMemberIds, zoom, onMovePort],
  );
  return <impl.Provider model={model}>{children}</impl.Provider>;
}

/**
 * One lane, drawn by whichever implementation is live. `bench.tsx`'s
 * `renderLane` is a plain function and cannot read a context itself, so this
 * component is the hook boundary between it and the variant.
 */
export function PortLane({ edge, style }: { edge: PortEdgeId; style?: CSSProperties }) {
  const impl = usePortEdgeVariant();
  return <impl.Lane edge={edge} style={style} />;
}
