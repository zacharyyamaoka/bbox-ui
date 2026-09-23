// src/hosts/frameNodeView.tsx — one `type: "frame"` scene node → the
// `Frame` component (components/frame.tsx), for every host that mounts
// `SceneNodeView`. The frame's members are its `parentId` children (the
// same `childrenOf` read a block makes), its ports are `data.ports` (the
// same walls a block has), and its toggles are `data.frame`
// (`hosts/frameScene.ts`).
//
// Built from `nodeViews.tsx`'s own exported helpers — `freeMemberOf` for a
// draggable free member, `withProducers` for the fan-in count, and
// `sceneWires.ts`'s `withWiredState` — so a frame's members drag and a
// frame's ports paint EXACTLY as a block's do. The one thing this file
// adds is the wiring of the frame's per-wall toggles (spacing mode and the
// custom offsets) to their scene writes.
//
// WHY the frame owns membership and layout here, and a block does not yet:
// Zach, 2026-09-22 — "what the frame gives you is membership... I think we
// want to associate all of that logic with the FRAME, not with a block."
// `BlockNodeView` keeps its own member wiring for now; docs/FRAME-PLAN.md
// is the migration that folds it onto this.

import type { ReactNode } from "react";

import type { BlockMember } from "../components/blockMembers";
import { Frame, type FrameWall } from "../components/frame";
import { BLOCK_SIDES, type BlockSide } from "../components/port.layout";
import type { PortEdgeItem } from "../components/portEdge";
import { childrenOf, type SceneNode } from "../scene/scene";
import { withWiredState } from "../scene/sceneWires";
import { frameCrossingMode, setWallOffsets } from "./frameScene";
import type { HostNodeData, HostScene } from "./hostScene";
import { useFreeMemberDrag } from "./memberDrag";
import { freeMemberOf, moveMember, reorderNodePorts, SceneNodeView, withProducers, type SceneNodeDecoration, type SceneNodeViewProps } from "./nodeViews";

/** One wall's `FrameWall` from the node's own data — the same item builder
 *  `nodeViews.tsx`'s `edgeSpecsOf` runs for a block's rail, plus the
 *  frame's spacing toggle and custom offsets. */
function wallOf(
  scene: HostScene,
  node: SceneNode<HostNodeData>,
  side: BlockSide,
  wired: ReadonlySet<string> | undefined,
  producers: ReadonlyMap<string, number> | undefined,
  onSceneChange: ((next: HostScene) => void) | undefined,
  decoration: SceneNodeDecoration | undefined,
): FrameWall | undefined {
  // Every wall of a frame IS a port edge, ports or not (Zach: "add 4 port
  // edges to all sides") — an empty rail is the drop target a drag lands
  // on and the line the sketch draws; only a wall the frame's own
  // `portEdges` leaves out has none (the Frame filters on that list).
  const portIds = node.data.ports?.[side] ?? [];
  const items = withProducers(
    withWiredState(
      portIds.map(
        (id): PortEdgeItem => ({
          id,
          label: node.data.portLabels?.[id] ?? id,
          type: node.data.portTypes?.[id],
          availability: decoration?.availability?.[id],
          diagnostics: decoration?.portDiagnostics?.[id],
          selected: decoration?.selectedPorts?.includes(id) || undefined,
        }),
      ),
      node.id,
      wired ?? new Set(),
    ),
    node.id,
    producers,
  );
  return {
    items,
    arrange: node.data.frame?.arrange?.[side] ?? "auto",
    offsets: node.data.frame?.offsets?.[side],
    onItemsChange: onSceneChange ? (next) => onSceneChange(reorderNodePorts(scene, node.id, side, next.map((item) => item.id))) : undefined,
    onOffsetsChange: onSceneChange ? (next) => onSceneChange(setWallOffsets(scene, node.id, side, next)) : undefined,
  };
}

export function FrameNodeView({ scene, node, wired, producers, onSceneChange, decorate, regionViews }: SceneNodeViewProps): ReactNode {
  const decoration = decorate?.(node);
  const frame = node.data.frame ?? {};
  const kids = childrenOf(scene, node.id);
  const layout = node.data.membersLayout ?? "free";
  const drag = useFreeMemberDrag({ onDragEnd: (id, next) => onSceneChange?.(moveMember(scene, id, next)) });
  const members: BlockMember[] = kids.map((kid) => {
    const content = <SceneNodeView scene={scene} node={kid} wired={wired} producers={producers} onSceneChange={onSceneChange} decorate={decorate} regionViews={regionViews} />;
    return layout === "free" ? freeMemberOf(kid, drag, content) : { id: kid.id, content };
  });
  const walls: Partial<Record<BlockSide, FrameWall>> = {};
  for (const side of BLOCK_SIDES) {
    const wall = wallOf(scene, node, side, wired, producers, onSceneChange, decoration);
    if (wall) walls[side] = wall;
  }
  return (
    <Frame
      id={node.id}
      title={node.data.name}
      titlePlacement={frame.titlePlacement ?? "above"}
      surface={frame.surface ?? "frame"}
      fit={frame.fit ?? "custom"}
      {...(node.data.w === undefined ? null : { width: node.data.w })}
      {...(node.data.h === undefined ? null : { height: node.data.h })}
      members={members}
      membersLayout={layout}
      portEdges={frame.portEdges}
      showPortEdgeLines={frame.showPortEdgeLines ?? false}
      walls={walls}
      // Detection is the host's; the frame paints rings only when its mode
      // says so. `off` and `port` paint none — in `port` mode the crossing
      // has become a real port, so a ring there would mark a cut twice.
      crossings={frameCrossingMode(node) === "ring" ? decoration?.crossings : undefined}
    />
  );
}
