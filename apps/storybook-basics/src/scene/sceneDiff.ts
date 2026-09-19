// src/scene/sceneDiff.ts — the three-state scene comparison: f(before, after)
// → SceneDiff. Pure, no React, no DOM, no canvas engine — same rule as
// scene.ts itself (CLAUDE.md: "the core imports no canvas engine").
//
// RE-EXPRESSED, not ported, from SystemSketch's
// `/home/bam/systemsketch/src/compare/compareModel.ts` (511 lines, read
// 2026-09-17 at revision `10748b8ccdb374e71714f3d351abc43947ecfb0e`). Per
// `docs/COMPARISON-VIEW-PLAN.md` §2's own table: "the three-state model and
// every WHY port; the tldraw record-walk does not." Concretely: this file
// takes the donor's three-state MODEL (`compareModel.ts:1-40`'s header, and
// the `push`/tally shape at `:264-420`) and its stated reasons, and drops
// `RecordMap`/`RecordLike`/`recordsOfSnapshot` — the tldraw-store reading
// half — because `diffScene` below takes a `BlockScene` directly, which is
// this app's own document type, not a serialization the donor had to unpack.
//
// ---------------------------------------------------------------------
// WHY three states, in the donor's own words (compareModel.ts:1-30), carried
// forward because the reasoning is the donor's contribution, not the code:
//
//   the id is on both sides, a field differs  → MODIFIED
//   the id is only on the after side          → ADDED
//   the id is only on the before side         → REMOVED
//
// And the consequence this module exists to enforce: a port that appeared is
// an insertion of the port, not a modification of the Block that gained it.
// A node that persists gets a `modified` row ONLY when one of ITS OWN fields
// differs (`diffNodeFields` below) — a port added or removed under it is a
// separate entry in `SceneDiff.ports`, never folded into the node's own
// `fields`. Collapsing the two would report one fact ("node changed") where
// there are two ("node persisted", "port inserted").
//
// ---------------------------------------------------------------------
// Matching is the identity ladder's FIRST RUNG ONLY — `id` — exactly the
// donor's own stated scope for revision comparison (compareModel.ts:37-42:
// "Matching here is the identity ladder's first rung only — stableId... The
// name / graph / source rungs... are deliberately not implemented here").
// Two saved states of the same scene keep their node/edge ids, so an id
// match is exact rather than heuristic; nothing here guesses.
//
// ---------------------------------------------------------------------
// §1's caveat evaporates here rather than porting: the donor reads a cable's
// endpoints out of BINDING RECORDS because a cable's own `start`/`end` props
// are handle coordinates that drift on every drag (`compareModel.ts:184`,
// "so a coordinate diff would call every dragged board a rewiring"). Our
// `SceneEdge` already carries `source`/`target`/`sourceHandle`/`targetHandle`
// as ids, not coordinates — the endpoint fact is first-class, so an edge's
// rewiring shows up as an ordinary FIELD change (`EDGE_IDENTITY_FIELDS`
// below) and no coordinate-vs-identity distinction has to be reconstructed.
//
// ---------------------------------------------------------------------
// §3's "THE GAP": the scene owns no port RECORDS — a port id exists only as
// a handle string on an edge, so a port that was never wired is invisible to
// a structural walk of `{nodes, edges}` alone. `findDanglingEdges` already
// solved exactly this by taking the node's port vocabulary as an OPTIONAL
// per-node callback (`scene.ts:424`) rather than assuming the scene carries
// it. `diffScene` takes the same shape, once per side: `findDanglingEdges`
// lints a SINGLE scene, so it needs one resolver; a diff compares TWO scenes,
// so it needs one resolver per side — same function type
// (`(nodeId: string) => readonly string[] | undefined`), called twice. A
// host with no port vocabulary at all passes neither and gets node/edge
// diffs only, same as `findDanglingEdges` with no `portsOf` returns
// node-only dangles.
//
// ---------------------------------------------------------------------
// WHY this file imports NOTHING diagnostic-shaped: the board diff contract's
// seventh rule is that a diff mark and a lint mark are the same visual
// object with different producers (`/home/bam/pyblocks/docs/
// block-diff-contract.md`, §"The rules that make the seam hold", rule 7),
// and the donor's own `diagnosticsModel.ts:51-61` states the consequence as
// a WHY comment: "the diff lane must not depend on the lint lane." This
// module is the diff lane's producer. It depends only on `./scene` (the
// scene kit's own structural types) and `./fieldDiff` (this app's ported
// `FieldDiff` shape) — never on any `src/diagnostics/`-shaped module, which
// does not exist in this app yet and must not become this file's business
// when it does.
//
// ---------------------------------------------------------------------
// `withoutDiffState` — ported AS A RULE, not as code, from
// `/home/bam/systemsketch/src/diff/clearDiffStates.ts` (99 lines in the
// donor, because tldraw stores a diff mark ON the shape's own props, so
// clearing it means visiting every shape, deleting ghost shapes and
// rewriting a state enum). Here a diff mark is a convention key,
// `DIFF_STATE_DATA_KEY`, that a paint layer may write into a node/edge's
// OWN `data` so a component that only ever reads `data` (never `SceneDiff`
// itself) can render a mark — S3's future work, not this file's. Clearing it
// is therefore deleting one key from every node's and edge's `data`, and the
// donor's WHY for doing that WHOLE-DOCUMENT, never as a selection, is quoted
// verbatim because it is the donor's insight, not this file's:
// "a half-cleared diff is worse than an uncleared one, because the marks
// that survive look like the current truth" (`clearDiffStates.ts:11`).

import type { BlockScene, SceneData, SceneEdge, SceneNode } from "./scene";
import type { FieldDiff } from "./fieldDiff";

/* ------------------------------------------------------------------ */
/* The three states                                                    */
/* ------------------------------------------------------------------ */

/** Anything else is a presentation concern, not a state (compareModel.ts's
 *  own `CHANGE_KINDS`, carried forward unchanged — it is vocabulary, not
 *  code). */
export const DIFF_OPERATIONS = ["added", "removed", "modified"] as const;
export type DiffOperation = (typeof DIFF_OPERATIONS)[number];

/** One node's comparison. `fields` is empty on `added`/`removed` BY
 *  CONSTRUCTION — a whole-object insertion or deletion has nothing on the
 *  other side to align against, the object-level counterpart of
 *  `compareModel.ts`'s `canWordDiff` rule. */
export interface SceneNodeDiff<Data extends SceneData = SceneData> {
  readonly id: string;
  readonly operation: DiffOperation;
  readonly before?: SceneNode<Data>;
  readonly after?: SceneNode<Data>;
  readonly fields: readonly FieldDiff[];
}

/** One edge's comparison. Same shape as a node's — an edge is matched by
 *  its own `id`, and a rewiring (`source`/`target`/`sourceHandle`/
 *  `targetHandle` change) is an ordinary field, never a coordinate. */
export interface SceneEdgeDiff<Data extends SceneData = SceneData> {
  readonly id: string;
  readonly operation: DiffOperation;
  readonly before?: SceneEdge<Data>;
  readonly after?: SceneEdge<Data>;
  readonly fields: readonly FieldDiff[];
}

/**
 * One port's appearance or disappearance under a node that persists on both
 * sides. Added/removed only — never `modified` — because the `portsOf`
 * callback's contract (matching `findDanglingEdges`) is a vocabulary of
 * PORT IDS, not port records, so there is no port-level field to compare.
 * A node that is itself `added` or `removed` reports no port rows: its own
 * row already says "this whole thing, and everything under it, is new/gone"
 * — nesting a port row under it would repeat that fact, not add one.
 */
export interface ScenePortDiff {
  readonly nodeId: string;
  readonly portId: string;
  readonly operation: "added" | "removed";
}

export interface SceneDiff<NodeData extends SceneData = SceneData, EdgeData extends SceneData = SceneData> {
  readonly nodes: readonly SceneNodeDiff<NodeData>[];
  readonly edges: readonly SceneEdgeDiff<EdgeData>[];
  readonly ports: readonly ScenePortDiff[];
}

/* ------------------------------------------------------------------ */
/* Reading a value as text — compareModel.ts's `asText`, re-expressed   */
/* ------------------------------------------------------------------ */

/** A record's props are already text-or-primitive in the donor's tldraw
 *  store; a scene's `data` bag is `Record<string, unknown>`, so this is a
 *  little wider than `compareModel.ts:161-166`'s original but the same
 *  idea: strings pass through, primitives stringify, anything else falls
 *  back to JSON so two objects compare by VALUE rather than by reference. */
function asText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/* ------------------------------------------------------------------ */
/* Field comparison                                                     */
/* ------------------------------------------------------------------ */

/**
 * Node identity fields worth a row of their own, alongside whatever the
 * host put in `data`. `position` is deliberately EXCLUDED — the same rule
 * `fieldDiff.ts`'s own header states for `x`/`y`/`w`/`h`: geometry's mark is
 * an outline, not a word-diff, and stringifying it into the text channel
 * only to parse it back out would be a lie about what kind of thing it is.
 * A host that carries node size can build a `PriorPose` and call
 * `classifyPoseChange` itself; this module does not have the `w`/`h` to do
 * it (`SceneNode.position` is `{x,y}` only — see `fieldDiff.ts`'s header).
 */
const NODE_IDENTITY_FIELDS = ["type", "parentId", "definitionId"] as const;

/** Edge identity fields. `source`/`target`/`sourceHandle`/`targetHandle`
 *  are exactly the ids `§1`'s caveat says make a coordinate-based cable
 *  diff unnecessary here — a rewiring is just one more field that changed. */
const EDGE_IDENTITY_FIELDS = ["type", "source", "target", "sourceHandle", "targetHandle"] as const;

/** Every key present in either bag, sorted — deterministic regardless of
 *  which side happened to write a key first (the same concern
 *  `lineDiff.ts`'s `stableJson` states for object serialization). */
function diffDataFields(before: SceneData | undefined, after: SceneData | undefined): FieldDiff[] {
  const beforeData = before ?? {};
  const afterData = after ?? {};
  const keys = new Set<string>([...Object.keys(beforeData), ...Object.keys(afterData)]);
  const fields: FieldDiff[] = [];
  for (const key of [...keys].sort()) {
    const previous = asText(beforeData[key]);
    const current = asText(afterData[key]);
    if (previous === current) continue;
    fields.push({ path: key, before: previous, after: current });
  }
  return fields;
}

function diffIdentityFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
  paths: readonly string[],
): FieldDiff[] {
  const fields: FieldDiff[] = [];
  for (const path of paths) {
    const previous = asText(before[path]);
    const current = asText(after[path]);
    if (previous === current) continue;
    fields.push({ path, before: previous, after: current });
  }
  return fields;
}

function diffNodeFields<Data extends SceneData>(before: SceneNode<Data>, after: SceneNode<Data>): FieldDiff[] {
  return [
    // Cast follows the donor's own pattern for reading a typed record by a
    // dynamic path (`compareModel.ts`'s port loop: `(portBefore as unknown
    // as Record<string, unknown>)[path]`) — `SceneNode` has no index
    // signature (explicit fields only), so a generic-by-path reader needs
    // the same cast the donor already needed for its own typed `BlockPort`.
    ...diffIdentityFields(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      NODE_IDENTITY_FIELDS,
    ),
    ...diffDataFields(before.data, after.data),
  ];
}

function diffEdgeFields<Data extends SceneData>(before: SceneEdge<Data>, after: SceneEdge<Data>): FieldDiff[] {
  return [
    ...diffIdentityFields(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      EDGE_IDENTITY_FIELDS,
    ),
    ...diffDataFields(before.data, after.data),
  ];
}

/* ------------------------------------------------------------------ */
/* Matching — id is the whole ladder rung used here                    */
/* ------------------------------------------------------------------ */

/** Every id from `before`, in its own order, then any id ONLY `after`
 *  introduces, in after's order. Deterministic without a sort — the same
 *  "scene order" idiom `findCycles`/`findDanglingEdges` already use, so an
 *  unrelated pair of scenes still produces a stable, reviewable order. */
function unionIdsInOrder(before: readonly { id: string }[], after: readonly { id: string }[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of before) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      ids.push(item.id);
    }
  }
  for (const item of after) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      ids.push(item.id);
    }
  }
  return ids;
}

/** Same idea, over plain port-id strings rather than `{id}` records —
 *  `portsOf` returns `readonly string[]`, not objects. */
function unionInOrder(before: readonly string[], after: readonly string[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of before) {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  for (const id of after) {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/* ------------------------------------------------------------------ */
/* The differ                                                          */
/* ------------------------------------------------------------------ */

/**
 * `portsOf`, one resolver per side. `findDanglingEdges` (`scene.ts:424`)
 * takes ONE such callback because it lints a single scene; a diff compares
 * two, so the caller supplies one resolver per side — same function shape,
 * called once per side, never both at once. Omit the whole option and only
 * node/edge diffs are produced, same as `findDanglingEdges` with no
 * `portsOf` still checks node existence.
 */
export interface ScenePortsOf {
  before: (nodeId: string) => readonly string[] | undefined;
  after: (nodeId: string) => readonly string[] | undefined;
}

/**
 * Compare two scenes and return every change, id-matched, three states.
 *
 * Total: two identical scenes yield `{nodes: [], edges: [], ports: []}`,
 * not a throw and not a row per unchanged element — a node or edge that
 * persists with no field difference and no port difference earns NO row at
 * all, the same as `compareModel.ts`'s block loop only pushing a `modified`
 * row when `ownFields.length > 0`.
 */
export function diffScene<NodeData extends SceneData = SceneData, EdgeData extends SceneData = SceneData>(
  before: BlockScene<NodeData, EdgeData>,
  after: BlockScene<NodeData, EdgeData>,
  portsOf?: ScenePortsOf,
): SceneDiff<NodeData, EdgeData> {
  const beforeNodes = new Map(before.nodes.map((node) => [node.id, node]));
  const afterNodes = new Map(after.nodes.map((node) => [node.id, node]));

  const nodes: SceneNodeDiff<NodeData>[] = [];
  for (const id of unionIdsInOrder(before.nodes, after.nodes)) {
    const beforeNode = beforeNodes.get(id);
    const afterNode = afterNodes.get(id);
    if (beforeNode && !afterNode) {
      nodes.push({ id, operation: "removed", before: beforeNode, fields: [] });
      continue;
    }
    if (!beforeNode && afterNode) {
      nodes.push({ id, operation: "added", after: afterNode, fields: [] });
      continue;
    }
    if (!beforeNode || !afterNode) continue;
    const fields = diffNodeFields(beforeNode, afterNode);
    if (fields.length === 0) continue;
    nodes.push({ id, operation: "modified", before: beforeNode, after: afterNode, fields });
  }

  const beforeEdges = new Map(before.edges.map((edge) => [edge.id, edge]));
  const afterEdges = new Map(after.edges.map((edge) => [edge.id, edge]));

  const edges: SceneEdgeDiff<EdgeData>[] = [];
  for (const id of unionIdsInOrder(before.edges, after.edges)) {
    const beforeEdge = beforeEdges.get(id);
    const afterEdge = afterEdges.get(id);
    if (beforeEdge && !afterEdge) {
      edges.push({ id, operation: "removed", before: beforeEdge, fields: [] });
      continue;
    }
    if (!beforeEdge && afterEdge) {
      edges.push({ id, operation: "added", after: afterEdge, fields: [] });
      continue;
    }
    if (!beforeEdge || !afterEdge) continue;
    const fields = diffEdgeFields(beforeEdge, afterEdge);
    if (fields.length === 0) continue;
    edges.push({ id, operation: "modified", before: beforeEdge, after: afterEdge, fields });
  }

  const ports: ScenePortDiff[] = [];
  if (portsOf) {
    for (const id of unionIdsInOrder(before.nodes, after.nodes)) {
      // A node that does not persist on both sides reports no port rows —
      // its own added/removed row already covers everything under it.
      if (!beforeNodes.has(id) || !afterNodes.has(id)) continue;
      const beforePorts = portsOf.before(id) ?? [];
      const afterPorts = portsOf.after(id) ?? [];
      for (const portId of unionInOrder(beforePorts, afterPorts)) {
        const inBefore = beforePorts.includes(portId);
        const inAfter = afterPorts.includes(portId);
        if (inBefore && !inAfter) ports.push({ nodeId: id, portId, operation: "removed" });
        else if (!inBefore && inAfter) ports.push({ nodeId: id, portId, operation: "added" });
      }
    }
  }

  return { nodes, edges, ports };
}

/* ------------------------------------------------------------------ */
/* Taking the lens off                                                  */
/* ------------------------------------------------------------------ */

/** The convention key a paint layer (S3, not this file) may write a diff
 *  mark under, in a node's or edge's own `data` — so a component that only
 *  ever reads `data` can render a mark without importing `SceneDiff` at
 *  all. Not read or written anywhere else in this module. */
export const DIFF_STATE_DATA_KEY = "diffState" as const;

function withoutKey<D extends SceneData | undefined>(data: D, key: string): D {
  if (!data || !(key in data)) return data;
  const rest: SceneData = { ...data };
  delete rest[key];
  return rest as D;
}

/**
 * Take the diff lens off a scene, whole-document, never a selection.
 *
 * See this file's own header for the donor citation and the WHY quoted from
 * `clearDiffStates.ts`. The donor needed 99 lines because tldraw stores the
 * mark ON the shape's own props, alongside ghost shapes that must be
 * DELETED rather than merely reset. Here a diff mark lives under one
 * convention key in ordinary `data`, so clearing it is deleting that key
 * from every node's and every edge's `data` — nothing to delete, because
 * this kit never invents a ghost node for a removed one; `before`/`after`
 * on `SceneNodeDiff` already carries that without mutating the scene.
 */
export function withoutDiffState<NodeData extends SceneData, EdgeData extends SceneData>(
  scene: BlockScene<NodeData, EdgeData>,
): BlockScene<NodeData, EdgeData> {
  return {
    nodes: scene.nodes.map((node) => ({ ...node, data: withoutKey(node.data, DIFF_STATE_DATA_KEY) })),
    edges: scene.edges.map((edge) => ({ ...edge, data: withoutKey(edge.data, DIFF_STATE_DATA_KEY) })),
  };
}
