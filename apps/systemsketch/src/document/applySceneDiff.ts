// src/document/applySceneDiff.ts — the MUTATION seam: a whole
// `DocumentScene` in, the store brought to it in one undo step.
//
// `sceneFromStore.ts` is the read side of the same seam; this is the write
// side, and the pair is what plan §4's stock-part table names as
// "`diffScene` → `editor.run(() => createShapes/updateShapes/deleteShapes)`,
// one undo step per mutation".
//
// WHY a DIFF rather than "clear the page and rebuild it from the scene":
// rebuilding mints new shape ids, and a shape id is what a wire binding, an
// undo entry, a selection and a consumer's own bookkeeping all name. Replace
// the records and every one of those is silently pointing at something that
// no longer exists — the board would look identical and every reference into
// it would be dead. `diffScene` matches by id (`sceneDiff.ts`: "the identity
// ladder's FIRST RUNG ONLY — `id`"), so a node that persists is UPDATED in
// place and keeps everything that names it.
//
// Nothing calls this yet, and that is deliberate rather than an oversight: it
// is the seam L4's menus and L5's region tools mutate through, and stream 3's
// `to_systemsketch()` writes through. Built now, small, with the one rule
// that is expensive to rediscover already in it — one transaction — so the
// first caller inherits a correct undo story instead of inventing one.
import type { Editor, TLShape, TLShapeId } from "tldraw";

import { diffScene } from "@trunk/scene/sceneDiff";

import type { BlockShape, BlockShapeProps } from "../shapes/block";
import { createWire } from "../shapes/wire/createWire";
import { BLOCK_SHAPE_TYPE, CODE_SHAPE_TYPE, PORT_SHAPE_TYPE, PORT_SIDES, REGION_SHAPE_TYPE } from "../shapes/types";
import { sceneFromRecords, type DocNodeData, type DocumentScene } from "./sceneFromStore";

/** The scene's `kind` → the shape type that carries it. The inverse of
 *  `sceneFromStore.ts`'s `KIND_OF`, and the only place the two directions
 *  meet. */
const SHAPE_TYPE_OF: Record<DocNodeData["kind"], string> = {
  block: BLOCK_SHAPE_TYPE,
  code: CODE_SHAPE_TYPE,
  port: PORT_SHAPE_TYPE,
  region: REGION_SHAPE_TYPE,
};

type BlockPorts = BlockShapeProps["ports"];
type BlockPort = BlockPorts["left"][number];

/**
 * A block's four port rails, rebuilt from the scene's ids MERGED OVER the
 * ports the document already holds.
 *
 * WHY a merge rather than `{ id, name: id, type }`: the projection is lossy by
 * design. `sceneFromStore.ts`'s `blockData` sends port IDS and nothing else,
 * because "the scene only ever names ports; it never places them" — so a
 * port's authored NAME ("Pose") has no field in the scene at all, only its id
 * ("pose"). Rebuilding a rail from ids alone therefore renames every port on
 * the board to its own id the first time ANY field of that block changes, and
 * `diffScene` marks a node `modified` for any of them — a rename, a view
 * change, a new port (`sceneDiff.ts`'s `NODE_IDENTITY_FIELDS` +
 * `diffDataFields`). That is exactly the "reset to a projection's idea of it"
 * the rule above forbids, and it is silent: the board still draws, with every
 * label quietly lowercased to a slug.
 *
 * The scene DOES own which ports exist, on which side, in what order — so a
 * port it no longer names is dropped, and an id it newly names is created with
 * its id as its first name (the only string available). Only the fields the
 * scene cannot speak are inherited, and they are inherited BY ID across sides,
 * so a port moved from `left` to `right` keeps its name too.
 *
 * `type` is inherited the same way, for a sharper reason: `blockData` writes
 * `portTypes` only for a NON-EMPTY type ("a declared-but-empty type is the
 * honest 'no type stated'"), so a missing entry means "no opinion", never
 * "clear it". Clearing a port's type is a document edit that cannot be
 * expressed through this seam; treating absence as a clear would erase every
 * type on the board on the next unrelated edit.
 */
function blockPorts(data: DocNodeData, existing: TLShape | undefined): BlockPorts {
  const authored = new Map<string, BlockPort>();
  if (existing?.type === BLOCK_SHAPE_TYPE) {
    const prior = (existing as BlockShape).props.ports;
    for (const side of PORT_SIDES) for (const port of prior[side]) authored.set(port.id, port);
  }
  const rail = (ids: readonly string[] | undefined): BlockPort[] =>
    (ids ?? []).map((id) => {
      const before = authored.get(id);
      return { id, name: before?.name ?? id, type: data.portTypes?.[id] ?? before?.type ?? "" };
    });
  return {
    left: rail(data.ports?.left),
    right: rail(data.ports?.right),
    top: rail(data.ports?.top),
    bottom: rail(data.ports?.bottom),
  };
}

/**
 * The persisted props a node's `data` implies. Deliberately PARTIAL: every
 * shape util fills the rest from `getDefaultProps`, and a field the scene has
 * no opinion about (a measured `anchors`, a `w` nobody authored) must keep
 * whatever the document already has rather than being reset to a projection's
 * idea of it.
 *
 * `existing` is the record already under this id, and it is passed for exactly
 * one reason — `blockPorts` above. It is `undefined` on an `added` row, where
 * there is nothing to preserve.
 *
 * WHY the partial cannot lean on tldraw's own merge to protect a nested field:
 * `updateShape` merges props exactly ONE level deep — `next.props =
 * { ...prev.props }` followed by a flat per-key assign
 * (`@tldraw/editor@5.3.2` `Editor.mjs:8745-8751`,
 * `applyPartialToRecordWithProps`). So naming `ports` at all replaces the
 * whole bag, and everything inside it that the projection cannot state has to
 * be re-stated here or it is gone. `anchors` and `w`/`h` are safe only because
 * this function never names them.
 */
function propsFromData(data: DocNodeData, existing?: TLShape): Record<string, unknown> {
  if (data.kind === "block") {
    return {
      name: data.name,
      ...(data.view ? { view: data.view } : {}),
      ports: blockPorts(data, existing),
    };
  }
  if (data.kind === "code") {
    return { code: data.code ?? "", ...(data.language ? { language: data.language } : {}) };
  }
  if (data.kind === "port") {
    return { name: data.name, type: data.type ?? "", direction: data.direction ?? "out" };
  }
  return { name: data.name, ...(data.regionKind ? { kind: data.regionKind } : {}), cornerBlockId: data.cornerBlockId ?? "" };
}

/**
 * Bring the document to `next`, in ONE transaction.
 *
 * Order is load-bearing and is the order below: delete, then create nodes,
 * then update nodes, then wire. A cable can only be created once both of its
 * ends exist (`createWire` asks each end's own `canBind` and answers `null`
 * if it cannot find one), and a node can only be deleted before the edges
 * naming it are re-derived.
 *
 * Edges are rebuilt rather than rebound: an edge whose ENDS changed is
 * dropped and re-created. That is a real deviation from "update in place",
 * and it is the honest one — `SceneEdge` identity is the edge id, but a
 * wire's ends live in its BINDINGS, so "update" would mean re-pointing two
 * binding records and there is no scene-level vocabulary for half of that.
 * The cost is that a rewired cable gets a new shape id; the gain is that this
 * function cannot leave a wire bound to one end of its old route and one end
 * of its new one.
 */
export function applyScene(editor: Editor, next: DocumentScene): void {
  const current = sceneFromRecords(editor.store.allRecords());
  const diff = diffScene(current, next);
  if (diff.nodes.length === 0 && diff.edges.length === 0) return;

  editor.run(() => {
    const removedNodes = diff.nodes.filter((row) => row.operation === "removed").map((row) => row.id as TLShapeId);
    const removedEdges = diff.edges.filter((row) => row.operation !== "added").map((row) => row.id as TLShapeId);
    // Wires first: deleting a NODE already cascades to its cables
    // (`WireBindingUtil.onBeforeDeleteToShape`), and asking for a shape that
    // the cascade already removed is a no-op, not an error.
    if (removedEdges.length > 0) editor.deleteShapes(removedEdges);
    if (removedNodes.length > 0) editor.deleteShapes(removedNodes);

    for (const row of diff.nodes) {
      if (row.operation === "removed" || !row.after) continue;
      const node = row.after;
      const type = SHAPE_TYPE_OF[node.data.kind];
      const id = node.id as TLShapeId;
      // The record this row is about to overwrite, read BEFORE the update so
      // `propsFromData` can carry forward the fields the scene cannot speak.
      // Only meaningful for a `modified` row; an `added` one has nothing under
      // its id yet, and `getShape` on a type that does not match is handed
      // through as `undefined` rather than mined for ports that are not there
      // (a node cannot change kind through this seam anyway — tldraw's partial
      // merge skips `type` outright, `Editor.mjs:8742`).
      const before = row.operation === "modified" ? editor.getShape(id) : undefined;
      const shape = {
        id,
        type,
        x: node.position.x,
        y: node.position.y,
        ...(node.parentId ? { parentId: node.parentId as TLShapeId } : {}),
        props: propsFromData(node.data, before),
      };
      if (row.operation === "added") editor.createShape(shape as never);
      else editor.updateShape(shape as never);
    }

    for (const row of diff.edges) {
      if (row.operation === "removed" || !row.after) continue;
      const edge = row.after;
      createWire(editor, {
        from: { nodeId: edge.source, portId: edge.sourceHandle ?? "" },
        to: { nodeId: edge.target, portId: edge.targetHandle ?? "" },
        ...(edge.data?.variant ? { variant: edge.data.variant } : {}),
      });
    }
  });
}
