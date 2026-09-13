/**
 * The five port-edge implementations, and the one place a host picks
 * between them. Losing variants stay until Zach picks (his standing rule) —
 * so this array is the durable artifact of the round, not scaffolding to
 * delete.
 */
import { V1_LANE_SORTABLE } from "./v1-laneSortable";
import { V2_LANE_MATH } from "./v2-laneMath";
import { V3_SLOT_DROPPABLES } from "./v3-slotDroppables";
import { V4_RUBBER_BAND } from "./v4-rubberBand";
import { V5_PAGE_SPACE } from "./v5-pageSpace";
import type { PortEdgesImpl } from "./contract";

export const PORT_EDGE_VARIANTS: PortEdgesImpl[] = [
  V1_LANE_SORTABLE,
  V2_LANE_MATH,
  V3_SLOT_DROPPABLES,
  V4_RUBBER_BAND,
  V5_PAGE_SPACE,
];

/** V1 is the applied default — the lab ported as-is is what Zach pointed at
 *  ("something that should look like this: claude/dndkit-lab"), so ignoring
 *  the switcher gets you the reference behaviour. */
export const DEFAULT_PORT_EDGE_VARIANT = PORT_EDGE_VARIANTS[0].id;

export function findPortEdgeVariant(id: string | null | undefined): PortEdgesImpl {
  return PORT_EDGE_VARIANTS.find((v) => v.id === id) ?? PORT_EDGE_VARIANTS[0];
}

export {
  LANE_BAND_PX,
  LaneBox,
  PortCard,
  PortEdgesModelProvider,
  PortGhost,
  isHorizontal,
  laneDroppableId,
  laneOf,
  laneSlots,
  nearestLiveEdge,
  pointerToIndex,
  pointerToT,
  usePortEdgesModel,
  type LaneSlot,
  type PortEdgesImpl,
  type PortEdgesModel,
} from "./contract";
