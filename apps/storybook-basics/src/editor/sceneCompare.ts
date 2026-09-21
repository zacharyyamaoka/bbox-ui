// src/editor/sceneCompare.ts — the bridge between the scene kit's diff
// ENGINE (`scene/sceneDiff.ts`'s `diffScene`) and the component kit's compare
// SURFACE (`components/compareDialog.tsx` → `compareReview.tsx` →
// `propertyTable.tsx`, all of which speak `compareModel.ts`'s `BoardCompare`).
//
// WHY it lives in `editor/` and could live nowhere else: it imports BOTH kits.
// `components/` may never import `scene/` (ARCHITECTURE.md's load-bearing DAG
// line), and `scene/` may never import a component, so the one directory in
// this repo allowed to know about both is this one — "editor imports both;
// nothing imports editor".
//
// WHY a bridge at all, when `components/compareModel.ts` already ships its own
// differ (`compareBoards`): they read different things and both are right.
// `compareBoards` walks a tldraw-shaped `RecordMap` — the donor's own input,
// kept so a host with a record store needs no projection. `diffScene` walks a
// `BlockScene`, which is what every host in this repo already derives
// (`hosts/hostScene.ts`, the app's `document/sceneFromStore.ts`). A host that
// has a scene should not have to fabricate a record map to be allowed to use
// the dialog, and a host that has records should not have to build a scene.
// One surface, two producers — which is exactly the shape `sceneDiff.ts`'s own
// header states for a diff mark and a lint mark ("the same visual object with
// different producers").
//
// WHY the port ROW convention here is `"<element>.<port>"` and not just the
// port id: `propertyRows.ts`'s `withinElement` slices a port change's `name`
// by `` `${change.element}.` `` to render the port's own name inside its
// element's group. Emitting a bare port id would make every port row read as
// a second element rather than as a property of the block that owns it — the
// exact collapse `sceneDiff.ts`'s header exists to prevent, arriving one layer
// later through a naming accident instead of through the model.

import {
  CHANGE_KINDS,
  SUBJECT_KINDS,
  type BoardCompare,
  type ChangeKind,
  type CompareChange,
  type FieldChange,
  type SubjectKind,
  type SubjectTally,
} from "../components/compareModel";
import type { FieldDiff } from "../scene/fieldDiff";
import { diffScene, type ScenePortsOf } from "../scene/sceneDiff";
import type { BlockScene, SceneData, SceneEdge, SceneNode } from "../scene/scene";

/* ------------------------------------------------------------------ */
/* Naming                                                              */
/* ------------------------------------------------------------------ */

/**
 * What a person calls a node.
 *
 * `data.name` is a CONVENTION, not part of `SceneNode` — both host families in
 * this repo carry it (`hosts/hostScene.ts`'s `HostNodeData.name`, the app's
 * `DocNodeData.name`) and the scene kit deliberately does not know it exists.
 * So it is read defensively and the id is the fallback: a scene that names
 * nothing still produces a readable diff instead of a blank column.
 */
export function sceneNodeName(node: SceneNode | undefined, id: string): string {
  const name = node?.data?.name;
  return typeof name === "string" && name.trim().length > 0 ? name : id;
}

/** An edge reads as its two ends, because that is what a person changed when
 *  they rewired it. `a → b`, never an opaque wire id. */
export function sceneEdgeName(edge: SceneEdge | undefined, id: string, nameOf: (nodeId: string) => string): string {
  if (!edge) return id;
  return `${nameOf(edge.source)} → ${nameOf(edge.target)}`;
}

/**
 * Which of `compareModel.ts`'s four subjects a node is.
 *
 * Only `block` maps to `"block"`. Everything else — a code cell, a region, a
 * standalone port shape, a host type this kit has never heard of — is
 * `"shape"`, the kit's own catch-all (`propertyTable.tsx`: "a `shape` subject
 * is this kit's catch-all for every other primitive"). WHY a non-block node is
 * NOT `"port"` even when its type is literally `port`: `"port"` in this
 * vocabulary means "a port OF something", and `propertyRows.ts` renders it as
 * a property inside its owner's group. A standalone port shape owns itself.
 */
export function subjectOfNode(node: SceneNode | undefined): SubjectKind {
  return node?.type === "block" ? "block" : "shape";
}

/* ------------------------------------------------------------------ */
/* The bridge                                                          */
/* ------------------------------------------------------------------ */

function fieldChanges(fields: readonly FieldDiff[]): FieldChange[] {
  // `FieldDiff` and `FieldChange` are the same three strings under two names,
  // one per kit. Copied rather than cast so neither kit's type has to widen to
  // admit the other's.
  return fields.map((field) => ({ path: field.path, before: field.before, after: field.after }));
}

function emptyTally(): Record<SubjectKind, SubjectTally> {
  const tally = {} as Record<SubjectKind, SubjectTally>;
  for (const subject of SUBJECT_KINDS) tally[subject] = { added: 0, removed: 0, modified: 0 };
  return tally;
}

export interface SceneCompareOptions<NodeData extends SceneData = SceneData> {
  /** One resolver per side, exactly as `diffScene` takes it. Omitted → node
   *  and edge rows only, and the ports section is empty rather than guessed. */
  readonly portsOf?: ScenePortsOf;
  /** Override the display name of a node. Omitted → `sceneNodeName`. */
  readonly nameOf?: (node: SceneNode<NodeData>, id: string) => string;
  /** Override the display name of a port, given its owner and its id.
   *  Omitted → the port id. The `"<element>."` prefix is added here, never by
   *  the caller — see this file's header. */
  readonly portNameOf?: (nodeId: string, portId: string) => string;
  /**
   * Node `data` keys that must NOT become their own field row.
   *
   * WHY this exists at all, and why it has no default: `sceneDiff.ts`'s header
   * promises that "a port added or removed under it is a separate entry in
   * `SceneDiff.ports`, never folded into the node's own `fields`" — and that
   * promise holds for `diffScene`, which cannot know where a host keeps its
   * port vocabulary. But BOTH host families in this repo keep it in `data`
   * (`HostNodeData.ports`, the app's `DocNodeData.ports`), so the very same
   * port insertion ALSO changes `data.ports`, and the surface would report one
   * fact twice: once as a readable `filter.cfg — added` port row, and once as
   * an unreadable `ports: {"left":["in"]} → {"left":["in","cfg"]}` field row.
   * A host that keeps ports in `data` names that key here; a host that does
   * not passes nothing and loses no rows. It is deliberately not defaulted to
   * `["ports"]`: a silent default would hide a real field change from a host
   * whose `ports` means something else entirely.
   *
   * A node whose ONLY differing fields are omitted earns no row at all — the
   * same rule `diffScene` applies to a node with no differing fields, which is
   * what keeps "this node changed" from being said with nothing to show.
   */
  readonly omitNodeFields?: readonly string[];
}

/**
 * Two scenes in, one `BoardCompare` out — the record `CompareDialog`,
 * `CompareReview`, `PropertyTable` and `CodeView` all already consume.
 *
 * `diffScene` does every piece of thinking here; this function decides only
 * how each of its rows is NAMED and WHICH of the four subjects it belongs to.
 * That split is deliberate: the engine is pure, tested and shared, so a
 * surface that disagreed with it would be a second definition of "what
 * changed" and free to drift. Two identical scenes give
 * `{changes: [], total: 0}` and a zeroed tally — never a row per unchanged
 * element, because `diffScene` emits none.
 */
export function compareScenes<NodeData extends SceneData = SceneData, EdgeData extends SceneData = SceneData>(
  before: BlockScene<NodeData, EdgeData>,
  after: BlockScene<NodeData, EdgeData>,
  options: SceneCompareOptions<NodeData> = {},
): BoardCompare {
  const diff = diffScene(before, after, options.portsOf);

  const nodeOf = new Map<string, SceneNode<NodeData>>();
  // `after` last, so a node that exists on both sides is named by what it is
  // called NOW. A rename shows its new name in the element column and its old
  // one in the Previous cell, which is where a rename belongs.
  for (const node of before.nodes) nodeOf.set(node.id, node);
  for (const node of after.nodes) nodeOf.set(node.id, node);

  const nameOf = (id: string): string => {
    const node = nodeOf.get(id);
    return options.nameOf && node ? options.nameOf(node, id) : sceneNodeName(node, id);
  };

  const omitted = new Set(options.omitNodeFields ?? []);
  const changes: CompareChange[] = [];

  for (const row of diff.nodes) {
    const node = row.after ?? row.before;
    const name = nameOf(row.id);
    const fields = fieldChanges(row.fields).filter((field) => !omitted.has(field.path));
    // See `omitNodeFields`: a modification with nothing left to show is not a
    // modification a person can act on, and the port row that caused it is
    // already in this list.
    if (row.operation === "modified" && fields.length === 0) continue;
    changes.push({
      id: `node:${row.id}`,
      subject: subjectOfNode(node),
      kind: row.operation,
      name,
      element: name,
      elementId: row.id,
      parentId: null,
      anchorBefore: row.before ? row.id : null,
      anchorAfter: row.after ? row.id : null,
      portId: null,
      fields,
      recordBefore: row.before ?? null,
      recordAfter: row.after ?? null,
    });
  }

  for (const row of diff.edges) {
    const edge = row.after ?? row.before;
    const name = sceneEdgeName(edge, row.id, nameOf);
    changes.push({
      id: `edge:${row.id}`,
      subject: "cable",
      kind: row.operation,
      name,
      element: name,
      elementId: row.id,
      parentId: null,
      anchorBefore: row.before ? row.id : null,
      anchorAfter: row.after ? row.id : null,
      portId: null,
      fields: fieldChanges(row.fields),
      recordBefore: row.before ?? null,
      recordAfter: row.after ?? null,
    });
  }

  for (const row of diff.ports) {
    const element = nameOf(row.nodeId);
    const portName = options.portNameOf?.(row.nodeId, row.portId) ?? row.portId;
    changes.push({
      id: `port:${row.nodeId}:${row.portId}`,
      subject: "port",
      kind: row.operation,
      // The `<element>.` prefix `propertyRows.ts` slices back off. See header.
      name: `${element}.${portName}`,
      element,
      elementId: row.nodeId,
      // A port hangs under its node's own row ONLY when that row exists — a
      // port added to an otherwise-unchanged block has no parent change to
      // point at, and inventing one would report a modification `diffScene`
      // deliberately did not make.
      parentId: changes.some((change) => change.id === `node:${row.nodeId}`) ? `node:${row.nodeId}` : null,
      anchorBefore: row.operation === "removed" ? row.nodeId : null,
      anchorAfter: row.operation === "added" ? row.nodeId : null,
      portId: row.portId,
      fields: [],
      recordBefore: null,
      recordAfter: null,
    });
  }

  const tally = emptyTally();
  for (const change of changes) tally[change.subject][change.kind] += 1;

  return { changes, tally, total: changes.length };
}

/** Every kind's count across every subject — the number the dialog's titlebar
 *  badges show, exposed so a host can label a menu row ("Compare 3 changes")
 *  without mounting the dialog to find out. */
export function compareTally(comparison: BoardCompare | null, kind: ChangeKind): number {
  if (!comparison) return 0;
  return SUBJECT_KINDS.reduce((total, subject) => total + (comparison.tally[subject]?.[kind] ?? 0), 0);
}

/** The three kinds, in the order the titlebar reads them. Re-exported so a
 *  host labelling a row does not have to import the component kit too. */
export const COMPARE_KINDS = CHANGE_KINDS;
