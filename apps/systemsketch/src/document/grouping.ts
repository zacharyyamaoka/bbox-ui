// src/document/grouping.ts — group / ungroup, as the app can actually hold
// them: `@trunk/scene/collapse`'s algebra with its promoted ports moved onto a
// CORNER BLOCK, because `ss-region` refuses every cable.
//
// ── THE CONTRADICTION THIS FILE EXISTS TO BRIDGE ───────────────────────
//
// `collapseToRegion` mints a container that CARRIES PORTS and re-points every
// crossing cable at `region/<port>` (`@trunk/scene/collapse.ts:236-253`). The
// app's region cannot be that container:
//
//   • `RegionShapeUtil.canBind()` returns `false` UNCONDITIONALLY
//     (`shapes/region/RegionShapeUtil.tsx:170-172`) — "never mix data and
//     control lines". `createWire` asks the engine and answers `null` when an
//     end refuses (`shapes/wire/createWire.ts`), so a promoted cable handed to
//     `applyScene` would simply not be created. Collapsing would have DELETED
//     every cable crossing the selection, silently.
//   • `ss-region` has no port schema at all (`RegionShapeUtil.tsx:92-103`), and
//     `Pasted image 20260918150916.png` marks ports-on-the-region OLD: BAD.
//     A region's interface is a child `ss-block` named by `cornerBlockId`
//     (`shapes/region/index.ts`: "EVERYTHING IS A BLOCK").
//
// So the port vocabulary the algebra needs and the port vocabulary the
// document allows live one level apart. This file is that one level: collapse
// with the trunk's algebra, then RELOCATE the container's ports onto a minted
// corner block and re-point the same edges at it; ungroup puts them back and
// hands the scene to `dissolveRegion`. Both directions are pure scene
// functions, which is what lets `grouping.test.ts` assert the round trip as
// scene EQUALITY rather than as a picture.
//
// WHY relocate rather than teach the region to bind: that would overturn a
// settled ruling ("never mix data and control lines") and make a loop's
// `Iterable` reachable two ways — its typed port and its box — which is
// exactly what the corner block exists to prevent.
//
// ── WHAT IS NOT CHANGED, AND MUST NOT BE ───────────────────────────────
//
// `docs/peps/0003-collapse-mutates-the-document.md` is accepted: a collapse
// MUTATES the document (split edges, minted node) and only the classification
// query projects. Nothing here resolves anything at render time, nothing here
// remembers what a port stood for, and `ungroupScene` still DERIVES the inner
// endpoint from the interior stub. The corner block is a second hop on the
// same split edge, not a side table.
import { createShapeId, type Editor, type TLShapeId } from "tldraw";

import { collapseToRegion, dissolveRegion, type CollapseResult } from "@trunk/scene/collapse";
import type { ConnectionMessage } from "@trunk/scene/edgeValidation";
import { REGION_NODE_TYPE } from "@trunk/scene/region";
import type { SceneEdge, SceneNode, ScenePortRef } from "@trunk/scene/scene";
import type { WireStyleData } from "@trunk/scene/sceneWires";

import { BLOCK_SHAPE_TYPE, CODE_SHAPE_TYPE, PORT_SHAPE_TYPE, REGION_SHAPE_TYPE } from "../shapes/types";
import { applyScene } from "./applySceneDiff";
import { sceneFromRecords, type DocNodeData, type DocumentScene } from "./sceneFromStore";

type DocNode = SceneNode<DocNodeData>;
type DocEdge = SceneEdge<WireStyleData>;

/**
 * The band reserved above the members for the corner block, in region-local
 * px.
 *
 * WHY A CONSTANT AND NOT A MEASUREMENT: it has to be subtracted again by
 * `ungroupScene` to land the members back where they started, and a measured
 * card height changes the moment someone renames a port — so the inverse would
 * stop being exact for reasons nothing on screen explains. A constant is
 * exactly invertible in integers, which is what `grouping.test.ts` asserts.
 *
 * WHY THE REGION MOVES UP RATHER THAN THE MEMBERS MOVING DOWN: the region's
 * own origin is pulled back by this much and every member's local `y` is
 * pushed forward by the same number, so a member's PAGE position is unchanged
 * by the collapse. Nothing the person arranged moves when they group it; the
 * frame grows upward to make room for the card that carries the new ports.
 */
export const REGION_CORNER_BAND_PX = 96;

/** Slack left around the members inside the frame, px. */
const REGION_PADDING_PX = 40;

/** The name a collapse gives the container when the caller states none. */
export const DEFAULT_GROUP_NAME = "Group";

/** The shape types that are NODES in the projection — everything
 *  `sceneFromStore.ts`'s `KIND_OF` maps. A wire in the selection is not a
 *  member of anything; it comes along because both its ends did. */
const NODE_SHAPE_TYPES: readonly string[] = [BLOCK_SHAPE_TYPE, CODE_SHAPE_TYPE, PORT_SHAPE_TYPE, REGION_SHAPE_TYPE];

export interface GroupSuccess {
  ok: true;
  scene: DocumentScene;
  regionId: string;
  /** `null` when the selection crossed no cable: a container with no
   *  interface gets no card, the same rule `cornerBlockPropsFor("plain")`
   *  already states ("an empty card would claim there is a contract"). */
  cornerBlockId: string | null;
  /** Promoted port ids, in promotion order — the corner block's new rails. */
  portIds: string[];
  /** Interior edges the collapse hid. */
  hidden: number;
}

export type GroupResult = GroupSuccess | { ok: false; refusal: ConnectionMessage };

/**
 * A readable port id for a promoted endpoint, derived from the inner port's
 * own id and de-duplicated in promotion order.
 *
 * WHY NOT `collapse.ts`'s default (`portKey(nodeId, portId)`): that is
 * `shape:Ab3…/out`, and `applySceneDiff.ts`'s `blockPorts` writes a port's id
 * as its DECLARATION when the document has no authored line for it — so every
 * rail on the new card would read `shape:Ab3…/out`. The id still has to be
 * unique (a wire binding names it), hence the counter rather than the bare
 * name.
 */
function readablePortIds(): (inner: ScenePortRef) => string {
  const taken = new Set<string>();
  return (inner) => {
    const base = inner.portId !== "" ? inner.portId : "port";
    let candidate = base;
    let n = 2;
    while (taken.has(candidate)) candidate = `${base}_${n++}`;
    taken.add(candidate);
    return candidate;
  };
}

/** Every port's declared type, read off the projection's own `portTypes`. */
function portTypesOf(scene: DocumentScene): (ref: ScenePortRef) => readonly string[] | undefined {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  return (ref) => {
    const stated = byId.get(ref.nodeId)?.data.portTypes?.[ref.portId];
    return stated === undefined ? undefined : [stated];
  };
}

/** Re-point every edge end naming `from` at `to`, handles untouched. */
function repointEdges(edges: readonly DocEdge[], from: string, to: string): DocEdge[] {
  return edges.map((edge) => {
    if (edge.source !== from && edge.target !== from) return edge;
    return {
      ...edge,
      ...(edge.source === from ? { source: to } : {}),
      ...(edge.target === from ? { target: to } : {}),
    };
  });
}

/**
 * Collapse `nodeIds` into a region whose promoted ports sit on a corner block.
 *
 * Pure: a new scene out, the input untouched. `mintId` is caller-owned (the
 * kit's D9 rule) and must mint ids the host accepts as shape ids.
 */
export function groupScene(
  scene: DocumentScene,
  nodeIds: readonly string[],
  mintId: () => string,
  name: string = DEFAULT_GROUP_NAME,
): GroupResult {
  const collapsed: CollapseResult<DocNodeData, WireStyleData> = collapseToRegion<DocNodeData, WireStyleData>(scene, nodeIds, {
    mintId,
    mintPortId: readablePortIds(),
    typeOf: portTypesOf(scene),
    // `regionKind: "plain"` and not a loop or a branch: a person drew a box
    // around some blocks, which is a bare scope. A `for` header would mint an
    // `Iterable` rail nothing asked for.
    regionData: { kind: "region", name, regionKind: "plain", cornerBlockId: "" },
  });
  if (!collapsed.ok) return collapsed;

  const { regionId, ports } = collapsed;
  if (ports.length === 0) {
    return { ok: true, scene: collapsed.scene, regionId, cornerBlockId: null, portIds: [], hidden: collapsed.hidden };
  }

  const cornerBlockId = mintId();
  const rails: NonNullable<DocNodeData["ports"]> = {};
  const portTypes: Record<string, string> = {};
  for (const port of ports) {
    (rails[port.side] ??= []).push(port.id);
    if (port.portType !== undefined) portTypes[port.id] = port.portType;
  }

  const nodes: DocNode[] = collapsed.scene.nodes.map((node) => {
    if (node.id === regionId) {
      return {
        ...node,
        position: { x: node.position.x, y: node.position.y - REGION_CORNER_BAND_PX },
        data: { ...node.data, cornerBlockId },
      };
    }
    if (node.parentId !== regionId) return node;
    return { ...node, position: { x: node.position.x, y: node.position.y + REGION_CORNER_BAND_PX } };
  });
  nodes.push({
    id: cornerBlockId,
    type: "block",
    parentId: regionId,
    // The app's own corner slot, flush with both walls
    // (`shapes/region/cornerBlock.ts`'s `CORNER_INSET_X_PX` / `_Y_PX`, both 0).
    position: { x: 0, y: 0 },
    data: { kind: "block", name, view: "port", ports: rails, portTypes },
  });

  return {
    ok: true,
    scene: { nodes, edges: repointEdges(collapsed.scene.edges, regionId, cornerBlockId) },
    regionId,
    cornerBlockId,
    portIds: ports.map((port) => port.id),
    hidden: collapsed.hidden,
  };
}

export interface UngroupSuccess {
  scene: DocumentScene;
  /** Outer edges spliced back onto their original inner endpoint. */
  rewired: string[];
  /** Node ids released out of the container. */
  released: string[];
}

/**
 * `groupScene`'s inverse, and total on a region this file did not build: a
 * hand-drawn scope with no corner block dissolves the same way, and one whose
 * card was deleted falls back to reading the region itself.
 *
 * `null` when `regionId` is not a region in this scene — the caller has
 * nothing to undo, and answering with a fabricated scene would be worse.
 */
export function ungroupScene(scene: DocumentScene, regionId: string): UngroupSuccess | null {
  const region = scene.nodes.find((node) => node.id === regionId);
  if (!region || region.type !== REGION_NODE_TYPE) return null;

  const cornerBlockId = region.data.cornerBlockId ?? "";
  const hasCorner = cornerBlockId !== "" && scene.nodes.some((node) => node.id === cornerBlockId);

  const edges = hasCorner ? repointEdges(scene.edges, cornerBlockId, regionId) : [...scene.edges];
  const nodes: DocNode[] = [];
  for (const node of scene.nodes) {
    if (hasCorner && node.id === cornerBlockId) continue;
    if (node.id === regionId) {
      nodes.push({
        ...node,
        position: hasCorner ? { x: node.position.x, y: node.position.y + REGION_CORNER_BAND_PX } : node.position,
        data: { ...node.data, cornerBlockId: "" },
      });
      continue;
    }
    if (hasCorner && node.parentId === regionId) {
      nodes.push({ ...node, position: { x: node.position.x, y: node.position.y - REGION_CORNER_BAND_PX } });
      continue;
    }
    nodes.push(node);
  }

  const dissolved = dissolveRegion<DocNodeData, WireStyleData>({ nodes, edges }, regionId);
  return { scene: dissolved.scene, rewired: dissolved.rewired, released: dissolved.released };
}

/* ------------------------------------------------------------------ */
/* The editor-facing half                                              */
/* ------------------------------------------------------------------ */

/** The selected shapes that are NODES — what a group would actually take in.
 *  A selected cable is dropped: it is not a member, and a collapse decides
 *  what happens to it from the boundary it crosses. */
export function groupableSelection(editor: Editor): TLShapeId[] {
  return editor.getSelectedShapes().filter((shape) => NODE_SHAPE_TYPES.includes(shape.type)).map((shape) => shape.id);
}

/** The one selected region, or `null`. Ungroup is a single-subject action:
 *  over a mixed bag there is no honest answer to "which box am I opening". */
export function selectedRegionId(editor: Editor): TLShapeId | null {
  const shapes = editor.getSelectedShapes();
  return shapes.length === 1 && shapes[0].type === REGION_SHAPE_TYPE ? shapes[0].id : null;
}

/**
 * The frame's box: wide and tall enough to hold the band, the members and a
 * margin.
 *
 * The sizes come from the EDITOR, never from the scene — "the scene may
 * CONTAIN measurements, it just never TAKES them" (ARCHITECTURE.md). They are
 * read BEFORE the apply, while the members are still where they are.
 */
function frameBoxFor(editor: Editor, memberIds: readonly TLShapeId[]): { w: number; h: number } {
  let width = 0;
  let height = 0;
  const origin = { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY };
  const far = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY };
  for (const id of memberIds) {
    const bounds = editor.getShapePageBounds(id);
    if (!bounds) continue;
    origin.x = Math.min(origin.x, bounds.x);
    origin.y = Math.min(origin.y, bounds.y);
    far.x = Math.max(far.x, bounds.x + bounds.w);
    far.y = Math.max(far.y, bounds.y + bounds.h);
  }
  if (Number.isFinite(origin.x)) {
    width = far.x - origin.x;
    height = far.y - origin.y;
  }
  return { w: width + REGION_PADDING_PX * 2, h: height + REGION_CORNER_BAND_PX + REGION_PADDING_PX };
}

/**
 * Group the selection on the real board, in ONE undo step, and select the
 * frame that comes out.
 *
 * Returns the region's id, or the refusal `collapseToRegion` gave — which is
 * `Diagnostic`-shaped, so a caller may render it as one.
 */
export function groupSelection(editor: Editor): { ok: true; regionId: TLShapeId } | { ok: false; refusal: ConnectionMessage } {
  const memberIds = groupableSelection(editor);
  if (memberIds.length === 0) {
    return { ok: false, refusal: { severity: "error", code: "empty-selection", message: "Select something to group first" } };
  }
  const scene = sceneFromRecords(editor.store.allRecords());
  const result = groupScene(scene, memberIds, () => createShapeId());
  if (!result.ok) return result;

  // Measured before the apply, while the members still stand where the person
  // left them: `applyScene` is about to reparent them into a frame that does
  // not exist yet.
  const box = frameBoxFor(editor, memberIds);
  editor.markHistoryStoppingPoint("group");
  editor.run(() => {
    applyScene(editor, result.scene, { kind: "document" });
    // `propsFromData` deliberately never names `w`/`h` — the scene carries no
    // sizes — so the frame arrives at `getDefaultProps`' 480x320 and would clip
    // anything wider. This is the host measuring and writing the result back,
    // which is the one direction ARCHITECTURE.md allows.
    editor.updateShape({ id: result.regionId as TLShapeId, type: REGION_SHAPE_TYPE, props: box } as never);
  });
  editor.setSelectedShapes([result.regionId as TLShapeId]);
  return { ok: true, regionId: result.regionId as TLShapeId };
}

/**
 * Ungroup the selected region, in ONE undo step, and select what came out —
 * so the gesture is visibly the inverse of the one above.
 */
export function ungroupSelection(editor: Editor): boolean {
  const regionId = selectedRegionId(editor);
  if (!regionId) return false;
  const scene = sceneFromRecords(editor.store.allRecords());
  const result = ungroupScene(scene, regionId);
  if (!result) return false;
  editor.markHistoryStoppingPoint("ungroup");
  editor.run(() => {
    applyScene(editor, result.scene, { kind: "document" });
  });
  editor.setSelectedShapes(result.released.filter((id) => !!editor.getShape(id as TLShapeId)) as TLShapeId[]);
  return true;
}
