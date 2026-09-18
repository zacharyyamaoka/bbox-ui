// src/scene/region.ts — Region as a NODE KIND, plus the three nesting
// queries the grouping algebra needs and `scene.ts` does not yet have.
//
// ── ZACH'S RULING, IMPLEMENTED LITERALLY ────────────────────────────────
//
// 2026-09-18, on whether a region is a Block preset or its own thing:
// "100% its a node. its just a unique type of node that is different from
// block." His diagram put `Block` and `Region` both under one `Node<T>` —
// "one class, ports either way" — and noted React Flow says the same
// (everything is a node or an edge).
//
// So a Region needs NO change to `SceneNode`. `type?: string` is already
// "host-interpreted kind (React Flow's `nodeTypes` key)" and already
// exactly the field React Flow keys `nodeTypes` off. A region is a
// `SceneNode` whose `type` is `REGION_NODE_TYPE`, carrying ports like any
// other node. That is the whole of it — `REGION_NODE_TYPE` below is a
// constant so the string is spelled once, not a new concept.
//
// AND REGIONS ARE ISOLATED. Zach: "100% region is isolated. Regions in code
// are not linked, so our regions shouldn't be either! If you want it to be
// linked then put the region inside a function and then link that
// function." A region node therefore never carries a `definitionId`, and
// `collapse.ts` never mints one. `linking.ts` is the machinery for linked
// occurrences; a region simply does not participate in it. `regionOf`
// below is the only "which region owns this" lookup, and it walks
// `parentId` — containment — never a definition group.
//
// ── WHY THESE THREE QUERIES LIVE HERE AND NOT IN scene.ts ───────────────
//
// `scene.ts` is frozen for this lane (write set: "do not edit scene.ts —
// extend from a new file"). Each of the three is a strict extension, and
// each has an in-repo predecessor that is PRIVATE to its own module — the
// duplication is pre-existing, and this file is where it stops growing:
//
//   `descendantsOf`    — `linking.ts`'s `deleteNode` grows the identical
//                        doomed-set fixpoint inline (its `for (;;)` loop),
//                        because "containment is ownership". Same walk,
//                        made public, made cycle-safe.
//   `absolutePosition` — nobody has needed it yet, because nothing before
//                        this lane RE-PARENTED a node. `SceneNode.position`
//                        is documented as living "in the parent's
//                        coordinate space when `parentId` is set (React
//                        Flow's sub-flow rule, kept)", so the moment
//                        `parentId` changes, `position` must be rebased or
//                        the node teleports. This is the function that
//                        makes collapse/dissolve position-exact.
//   `selectionRoots`   — the set a re-parent may touch. Re-parenting a node
//                        that is already inside another selected node would
//                        flatten authored nesting; only the roots move.
//
// Pure: no React, no DOM, no canvas engine.

import type { BlockScene, SceneData, SceneNode, ScenePosition } from "./scene";

/* ------------------------------------------------------------------ */
/* The kind                                                            */
/* ------------------------------------------------------------------ */

/** `SceneNode.type` for a region. One spelling, in one place. */
export const REGION_NODE_TYPE = "region";

/** Is this node a region? A total predicate — `type` is optional, and an
 *  absent `type` is a block-ish node, not an error. */
export function isRegion(node: { type?: string }): boolean {
  return node.type === REGION_NODE_TYPE;
}

/**
 * A box in the scene's own coordinate space. Supplied by a RESOLVER, never
 * read off the record: `SceneNode` carries `position` and deliberately no
 * size (a size is measured by whoever paints, and the scene kit does not
 * paint). Same shape as the elbow router's `ElbowRect` so a box travels
 * into `portEdgeCrossing.ts` with no conversion.
 *
 * Injected the way `findDanglingEdges` takes `portsOf` (scene.ts) and for
 * the same stated reason: per-node total, and `undefined` means "unknown",
 * never "empty".
 */
export type BoxOf = (nodeId: string) => { x: number; y: number; w: number; h: number } | undefined;

/* ------------------------------------------------------------------ */
/* Nesting                                                             */
/* ------------------------------------------------------------------ */

/**
 * Every node transitively inside `seeds`, the seeds included, in scene
 * order. The fixpoint `linking.ts`'s `deleteNode` runs inline, made public
 * and made total: a `parentId` cycle (which the record's contract forbids
 * but a malformed document can still contain) terminates instead of
 * spinning, because a node already in the set is never re-added.
 *
 * Seeds naming nodes that do not exist are simply absent from the result —
 * the honest smaller answer, `dependencyGraph`'s own policy in scene.ts.
 */
export function descendantsOf<N extends SceneData>(
  scene: { nodes: readonly SceneNode<N>[] },
  seeds: Iterable<string>,
): Set<string> {
  const known = new Set(scene.nodes.map((node) => node.id));
  const inside = new Set<string>();
  for (const id of seeds) if (known.has(id)) inside.add(id);
  for (;;) {
    const grown = scene.nodes.filter(
      (node) => !inside.has(node.id) && node.parentId !== undefined && inside.has(node.parentId),
    );
    if (grown.length === 0) break;
    for (const node of grown) inside.add(node.id);
  }
  return inside;
}

/**
 * The members of `inside` whose own parent is NOT in `inside` — the only
 * nodes a re-parent may touch.
 *
 * WHY it matters: selecting a block AND its child and collapsing both must
 * not make the child a sibling of its own parent. Authored nesting is a
 * fact the selection did not ask to change; only the outermost members move
 * into the new container, and everything under them comes along by
 * containment. Scene order.
 */
export function selectionRoots<N extends SceneData>(
  scene: { nodes: readonly SceneNode<N>[] },
  inside: ReadonlySet<string>,
): SceneNode<N>[] {
  return scene.nodes.filter(
    (node) => inside.has(node.id) && (node.parentId === undefined || !inside.has(node.parentId)),
  );
}

/**
 * A node's position in the SCENE's space, with every ancestor's offset
 * folded in. `undefined` for an unknown node.
 *
 * Total against a malformed `parentId` cycle: the walk stops the first time
 * it revisits a node, returning what it summed so far rather than looping.
 * A `parentId` naming a node that does not exist ends the walk too — the
 * same "unknown means stop, not throw" policy as everywhere else here.
 */
export function absolutePosition<N extends SceneData>(
  scene: { nodes: readonly SceneNode<N>[] },
  nodeId: string,
): ScenePosition | undefined {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const start = byId.get(nodeId);
  if (!start) return undefined;
  let x = 0;
  let y = 0;
  const seen = new Set<string>();
  let node: SceneNode<N> | undefined = start;
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    x += node.position.x;
    y += node.position.y;
    node = node.parentId === undefined ? undefined : byId.get(node.parentId);
  }
  return { x, y };
}

/**
 * The nearest ancestor of `nodeId` that is a region, or `undefined`. Walks
 * `parentId` — CONTAINMENT, never a definition group (see this file's
 * header on isolation). Cycle-safe by the same visited set.
 */
export function regionOf<N extends SceneData>(
  scene: { nodes: readonly SceneNode<N>[] },
  nodeId: string,
): SceneNode<N> | undefined {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const seen = new Set<string>([nodeId]);
  let parentId = byId.get(nodeId)?.parentId;
  while (parentId !== undefined && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) return undefined;
    if (isRegion(parent)) return parent;
    parentId = parent.parentId;
  }
  return undefined;
}

/**
 * The `parentId` chain from `nodeId` outward, nearest first, NOT including
 * `nodeId` itself. The path `boundaryWiring.ts` walks to find which
 * containers a cable would have to punch through. Cycle-safe.
 */
export function ancestorsOf<N extends SceneData>(
  scene: { nodes: readonly SceneNode<N>[] },
  nodeId: string,
): string[] {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const chain: string[] = [];
  const seen = new Set<string>([nodeId]);
  let parentId = byId.get(nodeId)?.parentId;
  while (parentId !== undefined && !seen.has(parentId) && byId.has(parentId)) {
    seen.add(parentId);
    chain.push(parentId);
    parentId = byId.get(parentId)!.parentId;
  }
  return chain;
}

/**
 * The bounding box of a set of nodes in SCENE space, from an injected
 * `boxOf`. `undefined` when no member resolves — a caller then has no
 * geometry and must say so rather than invent a zero box.
 *
 * Members whose box is unknown still contribute their `absolutePosition` as
 * a zero-size point, so a partially-measured scene still yields a box that
 * contains everything it knows about. That is a deliberate widening: a
 * region drawn slightly too large is a cosmetic problem, one drawn too
 * small clips a member.
 */
export function boundsOfNodes<N extends SceneData>(
  scene: { nodes: readonly SceneNode<N>[] },
  nodeIds: Iterable<string>,
  boxOf?: BoxOf,
): { x: number; y: number; w: number; h: number } | undefined {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const id of nodeIds) {
    const at = absolutePosition(scene, id);
    if (!at) continue;
    const box = boxOf?.(id);
    const w = box?.w ?? 0;
    const h = box?.h ?? 0;
    any = true;
    minX = Math.min(minX, at.x);
    minY = Math.min(minY, at.y);
    maxX = Math.max(maxX, at.x + w);
    maxY = Math.max(maxY, at.y + h);
  }
  if (!any) return undefined;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Narrowing helper: every region in the scene, in scene order. */
export function regionsOf<N extends SceneData, E extends SceneData>(scene: BlockScene<N, E>): SceneNode<N>[] {
  return scene.nodes.filter(isRegion);
}
