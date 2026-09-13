/**
 * V1 · Lane Sortable is the applied port-edge implementation (Zach,
 * 2026-09-12: "something that should look like this: claude/dndkit-lab" —
 * the lab ported as-is). Four sibling architectures (Lane Math, Slot
 * Droppables, Rubber Band, Page Space) were built and compared alongside it
 * and are recorded in `reports/media/port-edge-v5-2026-09-12.html`; once
 * Zach picked V1 they became liability rather than optionality and were
 * deleted, along with the switcher that chose between them.
 */
export { V1_LANE_SORTABLE as PORT_EDGE_IMPL } from "./v1-laneSortable";
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
