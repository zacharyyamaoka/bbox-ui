// src/hosts/frameScene.ts — this host family's FRAME vocabulary
// (`HostNodeData.frame`, `type: "frame"`) and the writes a frame's port
// edges make: add a wall port, remove one, split a cable through a wall,
// unsplit it, and delete with the link set. Pure: no React, no DOM — it
// lives in `hosts/` only because it reads `HostNodeData`, which the scene
// kit never learns about (the same licence `regionScene.ts` claims).
//
// The scene-side rules are `scene/wallPort.ts` (crossings, faces, the
// chain split) and `scene/links.ts` (the linked set); this file binds them
// to where THIS host keeps its ports (`data.ports[side]`, `portLabels`,
// `portTypes`) and to the frame's own per-wall settings.
//
// WHY every behaviour here is a TOGGLE in the data, not a fixed rule
// (Zach, 2026-09-22: "These are all toggable as we may use in different
// scenarios"): `frame.crossings` (`off` | `ring` | `port`), `frame.arrange`
// per wall (`auto` | `custom`), and the validation switch a story holds —
// each is a field a host reads, never a constant a component bakes in.
//
// WHY a split-minted port carries EXPLICIT faces (`frame.faces[portId]`):
// the wall's convention (left/top receive, right/bottom emit —
// `hostScene.ts`'s `SINK_SIDES`) is the DEFAULT face of a port someone
// placed by hand, but a cable that was split ENTERED or LEFT through a
// specific wall, and with validation off that can be an input through the
// right wall. The faces of that port are a fact about the cable it was cut
// from, so they are written down rather than re-derived from the wall.

import { insertPortAtWall, isInnerFaceHandle, isReservedPortId, outerPortIdOf, type WallTrack } from "../components/frame.layout";
import type { FrameFit, FrameSurface, FrameTitlePlacement } from "../components/frame";
import type { BlockSide } from "../components/port.layout";
import type { PortEdgeArrangeMode } from "../components/portEdge";
import { deleteWithLinks, type DeleteWithLinksResult, type ObjectRef } from "../scene/links";
import type { PortDirectionOf, PortsOf, PortTypeOf } from "../scene/model";
import { childrenOf, type SceneNode } from "../scene/scene";
import {
  splitEdgeAtWalls,
  unsplitWallPort,
  wallFacesFor,
  withFaceTypes,
  withInnerFaces,
  withWallFaces,
  type SplitAtWallsResult,
  type WallCrossing,
  type WallFace,
  type WallPortFaces,
} from "../scene/wallPort";
import { hostPolarityOf, hostPortsOf, type HostNodeData, type HostScene } from "./hostScene";

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

/** `SceneNode.type` for a frame. One spelling, in one place. */
export const FRAME_NODE_TYPE = "frame";

/**
 * What a frame does where a cable crosses its wall. Detection runs in every
 * mode — this only decides what is DRAWN or MINTED:
 *   `off`  — nothing;
 *   `ring` — a small hollow ring at the crossing (Option 1);
 *   `port` — a real port on the wall, the cable split through it (Option 2).
 */
export type FrameCrossingMode = "off" | "ring" | "port";

/** `data.frame` on a `type: "frame"` node — the frame's own toggles. The
 *  ports themselves stay in `data.ports`, exactly as a block's do, so every
 *  reader of `ports`/`portLabels`/`portTypes` works on a frame unchanged. */
export interface FrameData {
  /** Default `"ring"`. */
  crossings?: FrameCrossingMode;
  /** Per-wall spacing mode. Absent = `"auto"`. */
  arrange?: Partial<Record<BlockSide, PortEdgeArrangeMode>>;
  /** Custom mode's slot offsets, per wall (`PortEdge.freeOffsets`). */
  offsets?: Partial<Record<BlockSide, Record<string, number>>>;
  /** Explicit faces per port id. Absent = derived from the wall. */
  faces?: Record<string, WallPortFaces>;
  titlePlacement?: FrameTitlePlacement;
  surface?: FrameSurface;
  fit?: FrameFit;
  showPortEdgeLines?: boolean;
  /** Which walls carry a port edge. Absent = all four. */
  portEdges?: BlockSide[];
}

export function isFrameNode(node: SceneNode<HostNodeData>): boolean {
  return node.type === FRAME_NODE_TYPE;
}

/**
 * Which nodes have WALLS a cable can cross: a frame, or an expanded block
 * that holds members. Detection runs against these; port INSERTION is a
 * frame's (a block's rail has no inner face yet — docs/FRAME-PLAN.md).
 */
export function isWallContainer(scene: HostScene, node: SceneNode<HostNodeData>): boolean {
  if (isFrameNode(node)) return true;
  return (node.type ?? "block") === "block" && node.data.view === "expanded" && childrenOf(scene, node.id).length > 0;
}

export function wallContainerIds(scene: HostScene): string[] {
  return scene.nodes.filter((node) => isWallContainer(scene, node)).map((node) => node.id);
}

export function frameCrossingMode(node: SceneNode<HostNodeData>): FrameCrossingMode {
  return node.data.frame?.crossings ?? "ring";
}

function writeFrame(scene: HostScene, frameId: string, patch: Partial<FrameData>): HostScene {
  const index = scene.nodes.findIndex((node) => node.id === frameId);
  if (index === -1) return scene;
  const node = scene.nodes[index];
  const nodes = scene.nodes.slice();
  nodes[index] = { ...node, data: { ...node.data, frame: { ...(node.data.frame ?? {}), ...patch } } };
  return { ...scene, nodes };
}

/** The mode toggle, as a scene write: ONE field on ONE node. */
export function setFrameCrossingMode(scene: HostScene, frameId: string, mode: FrameCrossingMode): HostScene {
  const node = scene.nodes.find((candidate) => candidate.id === frameId);
  if (!node || frameCrossingMode(node) === mode) return scene;
  return writeFrame(scene, frameId, { crossings: mode });
}

export function setWallArrange(scene: HostScene, frameId: string, side: BlockSide, arrange: PortEdgeArrangeMode): HostScene {
  const node = scene.nodes.find((candidate) => candidate.id === frameId);
  if (!node || (node.data.frame?.arrange?.[side] ?? "auto") === arrange) return scene;
  return writeFrame(scene, frameId, { arrange: { ...(node.data.frame?.arrange ?? {}), [side]: arrange } });
}

export function setWallOffsets(scene: HostScene, frameId: string, side: BlockSide, offsets: Record<string, number>): HostScene {
  const node = scene.nodes.find((candidate) => candidate.id === frameId);
  if (!node) return scene;
  return writeFrame(scene, frameId, { offsets: { ...(node.data.frame?.offsets ?? {}), [side]: offsets } });
}

/* ------------------------------------------------------------------ */
/* Ports on a wall — reading                                           */
/* ------------------------------------------------------------------ */

/** The wall an AUTHORED port sits on — `data.ports` exactly as written,
 *  no face grammar applied. */
function sideOfAuthored(node: SceneNode<HostNodeData>, portId: string): BlockSide | undefined {
  for (const side of Object.keys(node.data.ports ?? {}) as BlockSide[]) {
    if ((node.data.ports?.[side] ?? []).includes(portId)) return side;
  }
  return undefined;
}

/** What a handle on a node's wall names, resolved STRUCTURALLY. */
export interface WallHandle {
  /** The authored port. */
  portId: string;
  side: BlockSide;
  face: WallFace;
}

/**
 * Which authored port, on which wall, through which face a handle names —
 * and the one rule that makes `@inner` safe (judge round 1, finding 7):
 * an AUTHORED id wins. `temperature@inner` written into `data.ports` is
 * that port's own outer face; only a handle that is NOT authored, spells
 * `<p>@inner`, and whose `<p>` IS authored, is `<p>`'s inner face.
 * `undefined` for anything else.
 */
export function resolveWallHandle(node: SceneNode<HostNodeData>, handle: string): WallHandle | undefined {
  const authored = sideOfAuthored(node, handle);
  if (authored !== undefined) return { portId: handle, side: authored, face: "outer" };
  if (isInnerFaceHandle(handle)) {
    const outer = outerPortIdOf(handle);
    const side = sideOfAuthored(node, outer);
    if (side !== undefined) return { portId: outer, side, face: "inner" };
  }
  return undefined;
}

/** The wall a port sits on, or `undefined` when the node does not carry
 *  it. Accepts either face's handle (`resolveWallHandle`). */
export function sideOfPort(node: SceneNode<HostNodeData>, portId: string): BlockSide | undefined {
  return resolveWallHandle(node, portId)?.side;
}

export function wallPortExists(scene: HostScene, nodeId: string, portId: string): boolean {
  const node = scene.nodes.find((candidate) => candidate.id === nodeId);
  return node !== undefined && sideOfPort(node, portId) !== undefined;
}

/** `true` when `ref.portId` is written into `ref.nodeId`'s `data.ports` —
 *  the structural test every face resolver here is built on. */
export function isAuthoredPort(scene: HostScene): (ref: { nodeId: string; portId: string }) => boolean {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  return (ref) => {
    const node = byId.get(ref.nodeId);
    return node !== undefined && sideOfAuthored(node, ref.portId) !== undefined;
  };
}

/** A wall port's two faces, keyed by its AUTHORED id: the explicit record
 *  when the host wrote one, else derived from the wall's own convention.
 *  `undefined` for anything that is not an authored port on a wall
 *  container. */
export function frameFacesOf(scene: HostScene): (ref: { nodeId: string; portId: string }) => WallPortFaces | undefined {
  const polarity = hostPolarityOf(scene);
  return (ref) => {
    const node = scene.nodes.find((candidate) => candidate.id === ref.nodeId);
    if (!node || !isWallContainer(scene, node) || sideOfAuthored(node, ref.portId) === undefined) return undefined;
    const explicit = node.data.frame?.faces?.[ref.portId];
    if (explicit) return explicit;
    const outer = polarity(ref);
    return outer === undefined ? undefined : wallFacesFor(outer);
  };
}

/** `hostPortsOf` + every wall port's inner face (an authored id that
 *  already spells one is left as the one port it is). */
export function framePortsOf(scene: HostScene): PortsOf {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  return withInnerFaces(hostPortsOf(scene), (nodeId) => {
    const node = byId.get(nodeId);
    return node !== undefined && isWallContainer(scene, node);
  });
}

/** `hostPolarityOf` + the faces, resolved structurally. */
export function frameDirectionOf(scene: HostScene): PortDirectionOf {
  return withWallFaces(hostPolarityOf(scene), frameFacesOf(scene), isAuthoredPort(scene));
}

/** `data.portTypes[port]` as a one-tag vocabulary, for either face.
 *  `undefined` (no declared type) means "unconstrained", `lint.ts`'s
 *  convention. */
export function frameTypeOf(scene: HostScene): PortTypeOf {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  return withFaceTypes((ref) => {
    const type = byId.get(ref.nodeId)?.data.portTypes?.[ref.portId];
    return type === undefined ? undefined : [type];
  }, isAuthoredPort(scene));
}

/* ------------------------------------------------------------------ */
/* Ports on a wall — writing                                           */
/* ------------------------------------------------------------------ */

export interface AddWallPortInput {
  containerId: string;
  side: BlockSide;
  portId: string;
  /** Where along the wall, 0..1 — decides the ORDER in auto mode and the
   *  offset in custom mode. Absent = append. */
  t?: number;
  label?: string;
  type?: string;
  faces?: WallPortFaces;
  /** The wall's measured track (`frame.layout.ts`'s `wallTrack`) — needed
   *  to place by `t`. Absent = append to the wall's order. */
  track?: WallTrack;
}

/**
 * Put a port on a wall. In AUTO mode the port takes the index its `t`
 * implies and the edge re-spaces it; in CUSTOM mode it stays where the
 * cable crossed, clamped by order and the minimum gap
 * (`insertPortAtWall`). A port that already exists is a no-op.
 */
export function addWallPort(scene: HostScene, input: AddWallPortInput): HostScene {
  // The face marker is reserved for handles this kit derives; a minted id
  // that contained it would be one string with two meanings (finding 7).
  if (isReservedPortId(input.portId)) return scene;
  const index = scene.nodes.findIndex((node) => node.id === input.containerId);
  if (index === -1) return scene;
  const node = scene.nodes[index];
  if (sideOfPort(node, input.portId) !== undefined) return scene;
  const order = node.data.ports?.[input.side] ?? [];
  const arrange = node.data.frame?.arrange?.[input.side] ?? "auto";
  const stored = node.data.frame?.offsets?.[input.side];
  let nextOrder: string[];
  let nextOffsets: Record<string, number> | undefined = stored;
  if (input.t !== undefined && input.track) {
    const placed = insertPortAtWall({
      order,
      offsets: stored,
      mode: arrange,
      distribution: { mode: "distribute", scheme: "space-evenly" },
      track: input.track,
      id: input.portId,
      t: input.t,
    });
    nextOrder = placed.order;
    if (arrange === "custom") nextOffsets = placed.offsets;
  } else {
    nextOrder = [...order, input.portId];
  }
  const data: HostNodeData = {
    ...node.data,
    ports: { ...(node.data.ports ?? {}), [input.side]: nextOrder },
    ...(input.label === undefined ? {} : { portLabels: { ...(node.data.portLabels ?? {}), [input.portId]: input.label } }),
    ...(input.type === undefined ? {} : { portTypes: { ...(node.data.portTypes ?? {}), [input.portId]: input.type } }),
  };
  if (input.faces || nextOffsets !== stored) {
    data.frame = {
      ...(node.data.frame ?? {}),
      ...(input.faces ? { faces: { ...(node.data.frame?.faces ?? {}), [input.portId]: input.faces } } : {}),
      ...(nextOffsets !== stored ? { offsets: { ...(node.data.frame?.offsets ?? {}), [input.side]: nextOffsets ?? {} } } : {}),
    };
  }
  const nodes = scene.nodes.slice();
  nodes[index] = { ...node, data };
  return { ...scene, nodes };
}

/** Take a port off its wall — its label, type, faces and offset with it.
 *  Edges naming it are NOT touched here (that is `deleteWithLinks`'s or
 *  the caller's decision). Unknown port: the same scene. */
export function removeWallPort(scene: HostScene, ref: { nodeId: string; portId: string }): HostScene {
  const index = scene.nodes.findIndex((node) => node.id === ref.nodeId);
  if (index === -1) return scene;
  const node = scene.nodes[index];
  const resolved = resolveWallHandle(node, ref.portId);
  if (resolved === undefined) return scene;
  const { side, portId } = resolved;
  // A record with the port's entry removed — and NO record at all once it
  // is empty, so add → remove leaves the node byte-identical (finding 5's
  // round trip: `portLabels: {}` is not "no labels").
  const without = <T,>(record: Record<string, T> | undefined): Record<string, T> | undefined => {
    if (!record || !(portId in record)) return record;
    const { [portId]: _gone, ...rest } = record;
    return Object.keys(rest).length === 0 ? undefined : rest;
  };
  const setOrDrop = (target: Record<string, unknown>, key: string, value: unknown): void => {
    if (value === undefined) delete target[key];
    else target[key] = value;
  };
  const data: HostNodeData = {
    ...node.data,
    ports: { ...(node.data.ports ?? {}), [side]: (node.data.ports?.[side] ?? []).filter((id) => id !== portId) },
  };
  setOrDrop(data as Record<string, unknown>, "portLabels", without(node.data.portLabels));
  setOrDrop(data as Record<string, unknown>, "portTypes", without(node.data.portTypes));
  const frame = node.data.frame;
  if (frame) {
    const nextFrame: Record<string, unknown> = { ...frame };
    setOrDrop(nextFrame, "faces", without(frame.faces));
    if (frame.offsets) {
      const offsets: Record<string, Record<string, number>> = { ...(frame.offsets as Record<string, Record<string, number>>) };
      const sideOffsets = without(offsets[side]);
      if (sideOffsets) offsets[side] = sideOffsets;
      else delete offsets[side];
      setOrDrop(nextFrame, "offsets", Object.keys(offsets).length === 0 ? undefined : offsets);
    }
    setOrDrop(data as Record<string, unknown>, "frame", Object.keys(nextFrame).length === 0 ? undefined : nextFrame);
  }
  const nodes = scene.nodes.slice();
  nodes[index] = { ...node, data };
  return { ...scene, nodes };
}

/* ------------------------------------------------------------------ */
/* The split, bound to this host's ports                               */
/* ------------------------------------------------------------------ */

export interface SplitAtFrameWallsOptions {
  /** The wall's measured track, so the minted port lands where the cable
   *  crossed. Absent = appended to the wall's order. */
  trackOf?(containerId: string, side: BlockSide): WallTrack | undefined;
  /** Default: `<containerId>:<edgeId>:<i>`. */
  mintPortId?(crossing: WallCrossing, index: number, edgeId: string): string;
  /** The label every minted port wears. Default `"port"` (Zach's sketch). */
  label?: string;
}

/**
 * `splitEdgeAtWalls` with this host's `addPort`: the minted port takes the
 * cable's declared TYPE (the source end's, else the target's — `data.
 * portTypes`) and EXPLICIT faces from the crossing's direction (entering →
 * the outer face receives; leaving → it emits), and lands where the cable
 * crossed.
 */
export function splitEdgeAtFrameWalls(
  scene: HostScene,
  edgeId: string,
  crossings: readonly WallCrossing[],
  options: SplitAtFrameWallsOptions = {},
): SplitAtWallsResult<HostNodeData, NonNullable<HostScene["edges"][number]["data"]>> {
  const edge = scene.edges.find((candidate) => candidate.id === edgeId);
  if (!edge) return { scene, ports: [] };
  const typeOf = frameTypeOf(scene);
  const sourceType = edge.sourceHandle ? typeOf({ nodeId: edge.source, portId: edge.sourceHandle })?.[0] : undefined;
  const targetType = edge.targetHandle ? typeOf({ nodeId: edge.target, portId: edge.targetHandle })?.[0] : undefined;
  const type = sourceType ?? targetType;
  return splitEdgeAtWalls(scene, edgeId, crossings, {
    mintPortId: (crossing, index) => options.mintPortId?.(crossing, index, edgeId) ?? `${crossing.containerId}:${edgeId}:${index}`,
    addPort: (current, port) =>
      addWallPort(current, {
        containerId: port.containerId,
        side: port.crossing.side,
        portId: port.portId,
        t: port.crossing.t,
        label: options.label ?? "port",
        ...(type === undefined ? {} : { type }),
        faces: port.crossing.direction === "enter" ? wallFacesFor("sink") : wallFacesFor("source"),
        track: options.trackOf?.(port.containerId, port.crossing.side),
      }),
  });
}

/** `unsplitWallPort` with this host's `removePort`. */
export function unsplitFrameWallPort(scene: HostScene, ref: { nodeId: string; portId: string }): HostScene {
  return unsplitWallPort(scene, { containerId: ref.nodeId, portId: ref.portId }, { removePort: (current, port) => removeWallPort(current, { nodeId: port.containerId, portId: port.portId }) });
}

/** `deleteWithLinks` with this host's port ops — the one delete a frame
 *  story wires the Delete key to. */
export function deleteFrameObjects(scene: HostScene, refs: Iterable<ObjectRef>): DeleteWithLinksResult<HostNodeData, NonNullable<HostScene["edges"][number]["data"]>> {
  return deleteWithLinks(scene, refs, {
    deletePort: (current, nodeId, portId) => removeWallPort(current, { nodeId, portId }),
    portExists: wallPortExists,
  });
}
