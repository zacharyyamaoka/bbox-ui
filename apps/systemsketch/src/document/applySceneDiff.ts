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
// WHY this file does more than hand `diffScene`'s rows to the editor, which
// is what it did until four probes were run against a real editor
// (2026-09-19): `diffScene` is a REVIEW differ, not a patch format. Its
// `NODE_IDENTITY_FIELDS` deliberately omit `position` ("geometry's mark is an
// outline, not a word-diff"), so a node that only MOVED earns no row at all —
// and a seam whose whole job is "bring the document to `next`" cannot treat
// the commonest edit there is, a re-layout, as nothing. Three more gaps came
// out of the same hour and are answered at their seams below: reparenting to
// the page (`parentOf`), an edge restyled without being rewired
// (`classifyEdges`), and a child created before its parent exists
// (`inCreationOrder`). Each one was silent — the board simply kept the old
// value — which is the failure mode this file has to be proof against,
// because its callers hand it a whole scene and get no error back.
//
// WHY EVERY CALL STATES A SCOPE, which is the fifth gap and the only one that
// LOST WORK (found 2026-09-21): this function diffed `next` against
// `sceneFromRecords(editor.store.allRecords())` — THE WHOLE STORE — and
// deleted every node the diff called `removed`. That is right for a caller
// whose scene IS the whole board (`source/sourceContextMenu.tsx`: convert a
// selection to a code cell, and the blocks it folded in really must go). It
// is catastrophic for a caller whose scene describes only PART of the board:
// `backend/OpenPython.tsx` hands over one Python file's projection, so
// re-opening that file deleted every cable the person had drawn on top of it,
// and opening a SECOND file wiped the first one. Both silent, both measured
// in `src/openPythonScope.smoke.test.tsx`.
//
// The fix is not a narrower diff — it is the missing question. `ApplyScope`
// makes every caller say WHOSE SHAPES THIS APPLY MAY DELETE, and it is a
// required argument precisely so the next caller cannot inherit the
// board-wide default by saying nothing. Matching and UPDATING still span the
// whole store (a scene that names an existing id must still update it in
// place, which is what keeps a re-open a diff); only DELETION is scoped.
import type { Editor, TLParentId, TLShape, TLShapeId } from "tldraw";

import { withPortDeclarationType } from "@trunk/scene/portDeclaration";
import type { SceneEdge, SceneNode } from "@trunk/scene/scene";
import { diffScene, type SceneEdgeDiff, type SceneNodeDiff } from "@trunk/scene/sceneDiff";
import type { WireStyleData } from "@trunk/scene/sceneWires";

import type { BlockShape, BlockShapeProps } from "../shapes/block";
import { createWire } from "../shapes/wire/createWire";
import { BLOCK_SHAPE_TYPE, CODE_SHAPE_TYPE, PORT_SHAPE_TYPE, PORT_SIDES, REGION_SHAPE_TYPE, WIRE_SHAPE_TYPE } from "../shapes/types";
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

/* ------------------------------------------------------------------ */
/* Scope — whose shapes an apply may delete                            */
/* ------------------------------------------------------------------ */

/**
 * The `shape.meta` key carrying WHICH SOURCE minted a shape.
 *
 * WHY `meta` and not the shape id's spelling: `OpenPython.tsx` mints semantic
 * ids (`shape:function:run@3:0/…`), which does distinguish "a pyblocks node"
 * from "a shape a person drew" — but not one FILE from another, and not at
 * all for cables, because `createWire` mints its own `createShapeId()` and the
 * scene's edge id never reaches the record. A tag answers both, and `meta` is
 * stock: it survives save/load/copy/paste, tldraw ignores it, and a `.bbox`
 * written here opens anywhere.
 */
export const SCENE_SOURCE_META_KEY = "bboxSceneSource";

/**
 * What the scene handed to `applyScene` is a picture OF, and therefore what
 * this apply is allowed to take off the board.
 *
 * - `document` — the scene IS the whole board, projected and edited. Anything
 *   it stops naming is gone on purpose. `source/sourceContextMenu.tsx`.
 * - `source` — the scene is ONE producer's view of part of the board. This
 *   apply owns only the shapes it created under that same `source` name;
 *   everything else on the board is somebody else's and is left alone.
 *   `backend/OpenPython.tsx`.
 */
export type ApplyScope = { kind: "document" } | { kind: "source"; source: string };

/** The `meta` a created shape carries, so a later apply can recognise it.
 *  Empty under `document`, where ownership is not a question. */
function stampOf(scope: ApplyScope): { meta?: Record<string, string> } {
  return scope.kind === "source" ? { meta: { [SCENE_SOURCE_META_KEY]: scope.source } } : {};
}

/**
 * Whether this apply may DELETE the shape under `id`.
 *
 * Deliberately asks the RECORD, not the incoming scene: ownership is a fact
 * about what is on the board, written when the shape was created, and a
 * producer that has forgotten a node must not be able to claim one it never
 * made. A shape that is not there answers `true` — deleting nothing is not a
 * loss, and `deleteShapes` on a missing id is already a no-op.
 */
function mayDeleteIn(editor: Editor, scope: ApplyScope): (id: string) => boolean {
  if (scope.kind === "document") return () => true;
  return (id) => {
    const shape = editor.getShape(id as TLShapeId);
    if (!shape) return true;
    return (shape.meta as Record<string, unknown> | undefined)?.[SCENE_SOURCE_META_KEY] === scope.source;
  };
}

type BlockPorts = BlockShapeProps["ports"];
type BlockPort = BlockPorts["left"][number];
type DocNode = SceneNode<DocNodeData>;
type DocEdge = SceneEdge<WireStyleData>;

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
 * its id as its first declaration (the only string available). The authored
 * declaration is inherited BY ID across sides, so a port moved from `left` to
 * `right` keeps the line someone typed on it.
 *
 * `portTypes` RE-ANNOTATES rather than replaces, for a reason ruling 8 made
 * sharper: a type is not a field of its own any more, it is a slice of the
 * declaration, so honouring a producer's type has to splice that slice and
 * leave the authored name alone (`withPortDeclarationType`). Absence still
 * means "no opinion", never "clear it" — `blockData` omits a port that states
 * no type ("undefined = unknown, no judgement"), so treating a missing entry
 * as a clear would strip every annotation on the board on the next unrelated
 * edit.
 */
function blockPorts(data: DocNodeData, existing: TLShape | undefined): BlockPorts {
  const authored = new Map<string, BlockPort>();
  if (existing?.type === BLOCK_SHAPE_TYPE) {
    const prior = (existing as BlockShape).props.ports;
    for (const side of PORT_SIDES) for (const port of prior[side]) authored.set(port.id, port);
  }
  const rail = (ids: readonly string[] | undefined): BlockPort[] =>
    (ids ?? []).map((id) => {
      const declaration = authored.get(id)?.declaration ?? id;
      const stated = data.portTypes?.[id];
      return { id, declaration: stated === undefined ? declaration : withPortDeclarationType(declaration, stated) };
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
    // The whole line, verbatim when the projection carried one. A producer
    // that only knows a name still lands a valid declaration — a bare name IS
    // one (`@trunk/scene/portDeclaration`).
    return { declaration: data.declaration ?? data.name, direction: data.direction ?? "out" };
  }
  return { name: data.name, ...(data.regionKind ? { kind: data.regionKind } : {}), cornerBlockId: data.cornerBlockId ?? "" };
}

/**
 * The parent a scene node NAMES, as a tldraw parent id.
 *
 * WHY absence has to resolve to a page rather than be left out of the partial:
 * `SceneNode.parentId` absent means TOP LEVEL ("`parentId` absent = top level;
 * the page is not a node", `sceneFromStore.ts`), and tldraw spells top level
 * as the page's own id. Spreading the key only when `next` names one therefore
 * made this seam ASYMMETRIC — page→shape landed, shape→page silently did not,
 * and the node kept its old shape parent while its `x`/`y` were re-read in
 * that parent's coordinate space, so it also silently teleported. Measured
 * 2026-09-19 against a real editor: expected `undefined`, received
 * `shape:3bLXeW…`.
 *
 * The shape's OWN page, not the current one: `sceneFromRecords` reads
 * `store.allRecords()`, which spans every page, so "top level" means the top
 * of the page this shape already lives on. `getCurrentPageId` is the fallback
 * for a node that has no record yet (an `added` row).
 */
function parentOf(editor: Editor, node: DocNode): TLParentId {
  if (node.parentId) return node.parentId as TLShapeId;
  return editor.getAncestorPageId(node.id as TLShapeId) ?? editor.getCurrentPageId();
}

/**
 * The `added` rows, PARENTS FIRST.
 *
 * WHY order matters at all: `editor.createShape` resolves an unknown
 * `parentId` by silently falling back to the current page — no throw, no
 * warning. `diffScene` emits rows in scene order (`unionIdsInOrder`), and a
 * scene is an array, so a caller that lists a child before its brand-new
 * parent got a child on the page instead of inside the parent. Measured
 * 2026-09-19: expected `shape:nwbFtz…`, received `page:page`.
 *
 * Only rows in THIS batch are reordered — a parent that already exists in the
 * store needs no ordering, and one that exists in neither is a caller error
 * this function cannot repair. A parent cycle degrades to source order rather
 * than recursing forever; tldraw refuses the cycle itself.
 */
function inCreationOrder(rows: readonly SceneNodeDiff<DocNodeData>[]): SceneNodeDiff<DocNodeData>[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered: SceneNodeDiff<DocNodeData>[] = [];
  const emitted = new Set<string>();
  const visiting = new Set<string>();
  const emit = (row: SceneNodeDiff<DocNodeData>) => {
    if (emitted.has(row.id) || visiting.has(row.id)) return;
    visiting.add(row.id);
    const parentId = row.after?.parentId;
    const parentRow = parentId ? byId.get(parentId) : undefined;
    if (parentRow) emit(parentRow);
    visiting.delete(row.id);
    emitted.add(row.id);
    ordered.push(row);
  };
  for (const row of rows) emit(row);
  return ordered;
}

/**
 * A wire's props, as the edge's `data` states them.
 *
 * WHY `color` is unconditional while `variant`/`routing` are not:
 * `sceneFromStore.ts` writes `variant` and `routing` on EVERY edge but writes
 * `color` only when it is non-empty ("`""` is the schema's unset colour"). So
 * an absent colour is the projection's own spelling of `""` — and making it
 * unconditional here is the only way a caller can ever CLEAR a colour through
 * this seam. An absent `variant` or `routing`, by contrast, can only come from
 * a hand-built scene that says nothing about style, and "says nothing" must
 * not reset a board to the defaults.
 */
function wirePropsFromData(data: WireStyleData | undefined): Record<string, unknown> {
  return {
    ...(data?.variant ? { variant: data.variant } : {}),
    ...(data?.routing ? { routing: data.routing } : {}),
    color: data?.color ?? "",
  };
}

/** Whether a `modified` edge row changed WHICH PORTS it joins, as opposed to
 *  only how it is painted. `sceneFromStore.ts` normalises both handles to a
 *  string, so a plain `!==` per field is the whole comparison. */
function isRewired(row: SceneEdgeDiff<WireStyleData>): boolean {
  const before = row.before;
  const after = row.after;
  if (!before || !after) return true;
  return (
    before.source !== after.source ||
    before.target !== after.target ||
    (before.sourceHandle ?? "") !== (after.sourceHandle ?? "") ||
    (before.targetHandle ?? "") !== (after.targetHandle ?? "")
  );
}

interface EdgePlan {
  removed: TLShapeId[];
  created: DocEdge[];
  restyled: DocEdge[];
}

/**
 * Split the edge rows into "delete it", "build it" and "just repaint it".
 *
 * Edges are REBUILT rather than rebound when their ENDS changed: an edge whose
 * source, target or either handle moved is dropped and re-created. That is a
 * real deviation from "update in place", and it is the honest one —
 * `SceneEdge` identity is the edge id, but a wire's ends live in its BINDINGS,
 * so "update" would mean re-pointing two binding records and there is no
 * scene-level vocabulary for half of that. The cost is that a rewired cable
 * gets a new shape id; the gain is that this function cannot leave a wire
 * bound to one end of its old route and one end of its new one.
 *
 * WHY a restyle is NOT in that bargain, which is what this function was
 * written to fix: the code above treated every `modified` row as
 * remove-then-add, so an edge whose only change was `data.routing` or
 * `data.color` was deleted and rebuilt — with a NEW shape id, and by
 * `createWire`, which took only `variant`, so the very field the caller asked
 * for came back at its DEFAULT. Measured 2026-09-19: asked for
 * `routing: "straight"`, received `"elbow"`; asked for `color: "#ff0000"`,
 * received `""`; and the id churned, taking the undo entry, the
 * `wire.rebound`-vs-`wire.removed`+`wire.added` event shape and every
 * consumer's reference to that cable with it. The id-churn bargain buys
 * correctness for a rewiring; it buys nothing at all for a repaint.
 *
 * `mayDelete` is the scope gate, and it is asked in TWO places for one
 * reason: a rewiring is a delete AND a create, so a cable this apply does not
 * own has to be left alone WHOLE. Dropping only its delete would leave the
 * board with the person's cable plus a second copy of it on the new route —
 * a duplicate is not a safer failure than a deletion, it is a stranger one.
 * A restyle is not a delete and is not gated: it writes only the fields the
 * scene states, and nothing is lost if a producer repaints a line it named.
 */
function classifyEdges(rows: readonly SceneEdgeDiff<WireStyleData>[], mayDelete: (id: string) => boolean): EdgePlan {
  const plan: EdgePlan = { removed: [], created: [], restyled: [] };
  for (const row of rows) {
    if (row.operation === "removed") {
      if (mayDelete(row.id)) plan.removed.push(row.id as TLShapeId);
      continue;
    }
    if (!row.after) continue;
    if (row.operation === "added") {
      plan.created.push(row.after);
      continue;
    }
    if (isRewired(row)) {
      if (!mayDelete(row.id)) continue;
      plan.removed.push(row.id as TLShapeId);
      plan.created.push(row.after);
    } else {
      plan.restyled.push(row.after);
    }
  }
  return plan;
}

/**
 * The nodes that MOVED and nothing else — `diffScene` reports no row for them.
 *
 * WHY this pass exists rather than a `position` entry in the trunk's
 * `NODE_IDENTITY_FIELDS`: that list is the REVIEW differ's, and its own header
 * states the reason position is absent — "geometry's mark is an outline, not a
 * word-diff", the same rule that keeps `x`/`y`/`w`/`h` out of `fieldDiff.ts`.
 * A comparison view is right to say a moved node is unchanged; a WRITE seam
 * whose contract is "bring the document to `next`" is not, and a re-layout
 * (stream 3's `to_systemsketch()`, L4's tidy) is the commonest thing anyone
 * will ask it to do. Measured 2026-09-19 before this pass existed: asked for
 * `x: 300`, the shape stayed at `60`, silently.
 *
 * Only rows `diffScene` did NOT report are considered — a node that already
 * has an `added` or `modified` row gets its position written by the main pass,
 * from the same `next` node.
 */
function movedNodes(current: DocumentScene, next: DocumentScene, reported: ReadonlySet<string>): DocNode[] {
  const before = new Map(current.nodes.map((node) => [node.id, node]));
  return next.nodes.filter((node) => {
    if (reported.has(node.id)) return false;
    const was = before.get(node.id);
    return !!was && (was.position.x !== node.position.x || was.position.y !== node.position.y);
  });
}

/**
 * The shapes a node delete would take as COLLATERAL, and where each one goes
 * instead — the descendants of the doomed set that this apply does not own.
 *
 * WHY it exists: `editor.deleteShapes` cascades to CHILDREN, so "only delete
 * what I made" is only true as far as the first container. Drop a note of
 * your own inside an expanded block, let the producer forget that block, and
 * the scope rule above would have promised your note was safe and then taken
 * it anyway — one level down, and just as silently as the bug this file was
 * fixed for. `source/sourceContextMenu.tsx` already named this hoist as owed
 * upstream ("`applySceneDiff.ts` could hoist survivors out of a removed
 * parent"); this is that, for the shapes ownership says are not ours.
 *
 * A survivor goes to the nearest ancestor OUTSIDE the doomed subtree, not
 * straight to the page: a note inside a surviving region should stay in it.
 * `reparentShapes` (used by the caller) preserves page position, so nothing
 * teleports. A survivor nested inside another survivor is left alone — it
 * rides along with the one above it, still in the place it was put.
 */
function hoistedSurvivors(
  editor: Editor,
  removed: readonly TLShapeId[],
  mayDelete: (id: string) => boolean,
): { id: TLShapeId; parentId: TLParentId }[] {
  if (removed.length === 0) return [];
  const doomed = editor.getShapeAndDescendantIds([...removed]);
  const survives = (id: TLShapeId) => doomed.has(id) && !mayDelete(String(id));
  const out: { id: TLShapeId; parentId: TLParentId }[] = [];
  for (const id of doomed) {
    if (!survives(id)) continue;
    let parent = editor.getShape(id)?.parentId;
    let sheltered = false;
    while (parent && doomed.has(parent as TLShapeId)) {
      if (survives(parent as TLShapeId)) {
        sheltered = true;
        break;
      }
      parent = editor.getShape(parent as TLShapeId)?.parentId;
    }
    if (sheltered) continue;
    out.push({ id, parentId: (parent ?? editor.getAncestorPageId(id) ?? editor.getCurrentPageId()) as TLParentId });
  }
  return out;
}

/**
 * Bring the document to `next`, in ONE transaction.
 *
 * `scope` says whose shapes this apply may DELETE — see `ApplyScope`. It is
 * required, and that is the point: the board-wide default it replaces is what
 * made `Open Python file…` delete the person's own cables.
 *
 * Order is load-bearing and is the order below: delete, then create nodes,
 * then update nodes, then move the rest, then wire. A cable can only be
 * created once both of its ends exist (`createWire` asks each end's own
 * `canBind` and answers `null` if it cannot find one), and a node can only be
 * deleted before the edges naming it are re-derived.
 */
export function applyScene(editor: Editor, next: DocumentScene, scope: ApplyScope): void {
  // The WHOLE store, still, and deliberately: matching is by id, so a scene
  // that names a shape already on the board must UPDATE it in place — that is
  // what makes re-opening a file a diff rather than a rebuild, and it is the
  // reason `OpenPython.tsx` carries pyblocks' semantic ids through verbatim.
  // Scope narrows what may be deleted, never what may be recognised.
  const current = sceneFromRecords(editor.store.allRecords());
  const diff = diffScene(current, next);
  const reported = new Set(diff.nodes.map((row) => row.id));
  const moved = movedNodes(current, next, reported);
  const mayDelete = mayDeleteIn(editor, scope);
  const edges = classifyEdges(diff.edges, mayDelete);
  if (diff.nodes.length === 0 && moved.length === 0 && diff.edges.length === 0) return;

  editor.run(() => {
    const removedNodes = diff.nodes
      .filter((row) => row.operation === "removed" && mayDelete(row.id))
      .map((row) => row.id as TLShapeId);
    const survivors = hoistedSurvivors(editor, removedNodes, mayDelete);
    // Wires first: deleting a NODE already cascades to its cables
    // (`WireBindingUtil.onBeforeDeleteToShape`), and asking for a shape that
    // the cascade already removed is a no-op, not an error.
    if (edges.removed.length > 0) editor.deleteShapes(edges.removed);
    for (const survivor of survivors) editor.reparentShapes([survivor.id], survivor.parentId);
    if (removedNodes.length > 0) editor.deleteShapes(removedNodes);

    const stamp = stampOf(scope);
    for (const row of inCreationOrder(diff.nodes.filter((r) => r.operation === "added"))) {
      const node = row.after;
      if (!node) continue;
      editor.createShape({
        id: node.id as TLShapeId,
        type: SHAPE_TYPE_OF[node.data.kind],
        parentId: parentOf(editor, node),
        x: node.position.x,
        y: node.position.y,
        props: propsFromData(node.data),
        // The provenance the NEXT apply reads. Written on create only: this
        // apply owns what it made, never what it merely recognised.
        ...stamp,
      } as never);
    }

    for (const row of diff.nodes) {
      if (row.operation !== "modified" || !row.after) continue;
      const node = row.after;
      const id = node.id as TLShapeId;
      // The record this row is about to overwrite, read BEFORE anything is
      // written so `propsFromData` can carry forward the fields the scene
      // cannot speak. `getShape` on a type that does not match is handed
      // through as `undefined` rather than mined for ports that are not there
      // (a node cannot change kind through this seam anyway — tldraw's partial
      // merge skips `type` outright, `Editor.mjs:8742`).
      const before = editor.getShape(id);
      if (!before) continue;
      const parentId = parentOf(editor, node);
      // WHY `reparentShapes` rather than naming `parentId` in the partial:
      // `updateShape` assigns base fields RAW (`applyPartialToRecordWithProps`
      // skips only `id`/`type`/`typeName`), so it would move the record without
      // giving it an index among its new siblings. `reparentShapes` is the
      // stock seam that mints one. It also rewrites `x`/`y` to preserve page
      // position — which the update below immediately overwrites with the
      // scene's own parent-relative numbers, and that is the intended order.
      if (String(before.parentId) !== String(parentId)) editor.reparentShapes([id], parentId);
      editor.updateShape({
        id,
        type: SHAPE_TYPE_OF[node.data.kind],
        x: node.position.x,
        y: node.position.y,
        props: propsFromData(node.data, before),
      } as never);
    }

    for (const node of moved) {
      editor.updateShape({
        id: node.id as TLShapeId,
        type: SHAPE_TYPE_OF[node.data.kind],
        x: node.position.x,
        y: node.position.y,
      } as never);
    }

    for (const edge of edges.restyled) {
      editor.updateShape({ id: edge.id as TLShapeId, type: WIRE_SHAPE_TYPE, props: wirePropsFromData(edge.data) } as never);
    }

    for (const edge of edges.created) {
      createWire(editor, {
        from: { nodeId: edge.source, portId: edge.sourceHandle ?? "" },
        to: { nodeId: edge.target, portId: edge.targetHandle ?? "" },
        ...(edge.data?.variant ? { variant: edge.data.variant } : {}),
        ...(edge.data?.routing ? { routing: edge.data.routing } : {}),
        ...(edge.data?.color ? { color: edge.data.color } : {}),
        // A cable is the one thing here whose id CANNOT carry provenance:
        // `createWire` mints its own `createShapeId()` and the scene's edge id
        // never reaches the record, so without this tag a re-open could not
        // tell its own line from the person's and would have to keep both
        // forever.
        ...stamp,
      });
    }
  });
}
