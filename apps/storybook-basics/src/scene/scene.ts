// src/scene/scene.ts — the scene kit: ONE record for "how the components
// relate and talk to each other", and pure functions over it. The view kit
// (src/components/) stays props-in DOM-out and knows nothing about this
// file; a host reads a scene and passes props, a pure function reads a
// scene and returns data (docs/SCENE-KIT.md).
//
// The vocabulary is borrowed from React Flow DELIBERATELY and closely —
// node/edge, source/target, sourceHandle/targetHandle, position, data,
// parentId — because the names carry the domain (Zach, 2026-09-17: "we are
// borrowing the domain vocabulary which carries a lot in it"). Borrowed is
// falsifiable, not a vibe: `scene.reactflow.test.ts` proves a
// `SceneNode`/`SceneEdge` assigns to `@xyflow/react`'s published
// `Node`/`Edge` types with no cast. This file still imports NOTHING — no
// React, no tldraw, no `@xyflow/react`, not even their types. Matching the
// shape without taking the dependency is the whole point: adapting into
// React Flow is then a type-level identity, and adapting into tldraw is a
// field map, with every pure function below working unchanged on either.
//
// Before this file there were three partial scene models that did not know
// about each other: `wiring.ts`'s `Wire` (edges), `blockMembers.tsx`'s
// `BlockMember` (nesting AND placement fused), and `portLane.ts`'s LCS
// reconcile (port identity across an edit — a diff algorithm standing in
// for the owner identity never had). This record is the owner. `wiring.ts`
// is absorbed (its model half deleted, its paint half kept —
// see `sceneWires.ts`); the other two are documented tenants for later.

// The scene's own vocabulary now has one declaration site, `./model` — see
// that file's header for the rule about what belongs there. Re-exported from
// here so every existing `from "./scene"` import keeps resolving, and so a
// reader who opens this file still meets the record before the functions
// over it.
import type {
  BlockScene,
  SceneData,
  SceneEdge,
  SceneEdgeEnds,
  SceneNode,
  ScenePortRef,
  ScenePosition,
} from "./model";
export type {
  BlockScene,
  SceneData,
  SceneEdge,
  SceneEdgeEnds,
  SceneNode,
  ScenePortRef,
  ScenePosition,
};

/* ------------------------------------------------------------------ */
/* The record                                                          */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Structural slices — what each pure function actually reads.         */
/* Typed minimally so the SAME functions run on a BlockScene, on a     */
/* React Flow store's nodes/edges, or on any host's records that speak */
/* the vocabulary. Matching the graph data types IS the adapter.       */
/* ------------------------------------------------------------------ */

/** `${nodeId}/${portId}` — the one shared spelling of "which port",
 *  everywhere: `wiredPorts`' set members, `sceneWires`' adapter output,
 *  and the view kit's own DOM resolution (`data-block-id` +
 *  `data-port-id`) all agree on it. */
export function portKey(nodeId: string, portId: string): string {
  return `${nodeId}/${portId}`;
}

/* ------------------------------------------------------------------ */
/* Wired state — the derivation wiring.ts used to own                  */
/* ------------------------------------------------------------------ */

/**
 * Every port named by at least one edge end, as `portKey`s. An edge end
 * with no handle wires the NODE, not any port, so it contributes nothing
 * here. Duplicate edges add nothing new — idempotence, not a bug.
 */
export function wiredPorts(scene: { edges: readonly SceneEdgeEnds[] }): Set<string> {
  const keys = new Set<string>();
  for (const edge of scene.edges) {
    if (edge.sourceHandle != null) keys.add(portKey(edge.source, edge.sourceHandle));
    if (edge.targetHandle != null) keys.add(portKey(edge.target, edge.targetHandle));
  }
  return keys;
}

/**
 * The edges that write INTO this port — its producers, in dataflow terms.
 * Total: an unknown port simply has none.
 */
export function producersOf<E extends SceneEdgeEnds>(scene: { edges: readonly E[] }, ref: ScenePortRef): E[] {
  return scene.edges.filter((edge) => edge.target === ref.nodeId && edge.targetHandle === ref.portId);
}

/** The edges that read FROM this port — its consumers. */
export function consumersOf<E extends SceneEdgeEnds>(scene: { edges: readonly E[] }, ref: ScenePortRef): E[] {
  return scene.edges.filter((edge) => edge.source === ref.nodeId && edge.sourceHandle === ref.portId);
}

/* ------------------------------------------------------------------ */
/* Order — the SPICE observation: a netlist has a evaluation order      */
/* ------------------------------------------------------------------ */

export interface SceneOrder {
  /** Node ids in dependency order: every edge's source before its target.
   *  Stable — scene order, refined only where an edge forces otherwise. */
  order: string[];
  /** Node ids that cannot be ordered: they sit ON a cycle or strictly
   *  BEHIND one (an acyclic node fed by a cycle is blocked too — its
   *  producers never settle). In scene order. */
  blocked: string[];
}

/** Adjacency + indegree over KNOWN nodes only — an edge naming a node id
 *  that isn't in the scene is ignored, not thrown on (total by policy:
 *  malformed input yields the honest smaller answer). `parentId` is
 *  deliberately NOT an edge: nesting is not dataflow. */
function dependencyGraph(scene: { nodes: readonly { id: string }[]; edges: readonly SceneEdgeEnds[] }): {
  ids: string[];
  successors: Map<string, string[]>;
  indegree: Map<string, number>;
} {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const node of scene.nodes) {
    // Duplicate ids: first occurrence wins, the rest are ignored — the
    // total-function answer to input the record's own contract forbids.
    if (!seen.has(node.id)) {
      seen.add(node.id);
      ids.push(node.id);
    }
  }
  const successors = new Map<string, string[]>(ids.map((id) => [id, []]));
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const edge of scene.edges) {
    if (!seen.has(edge.source) || !seen.has(edge.target)) continue;
    successors.get(edge.source)!.push(edge.target);
    indegree.set(edge.target, indegree.get(edge.target)! + 1);
  }
  return { ids, successors, indegree };
}

/**
 * Kahn's algorithm, stable: among the ready nodes, always the earliest in
 * scene order — so an already-ordered scene comes back in its own order,
 * and reordering the input never reorders independent nodes surprisingly.
 * O(n² + e) by linear rescan; a scene is tens of blocks, not a genome
 * (the same size argument `portLane.ts` makes for its quadratic LCS).
 */
export function topologicalOrder(scene: { nodes: readonly { id: string }[]; edges: readonly SceneEdgeEnds[] }): SceneOrder {
  const { ids, successors, indegree } = dependencyGraph(scene);
  const placed = new Set<string>();
  const order: string[] = [];
  for (;;) {
    const ready = ids.find((id) => !placed.has(id) && indegree.get(id) === 0);
    if (ready === undefined) break;
    placed.add(ready);
    order.push(ready);
    for (const next of successors.get(ready)!) {
      indegree.set(next, indegree.get(next)! - 1);
    }
  }
  const blocked = ids.filter((id) => !placed.has(id));
  return { order, blocked };
}

/**
 * Longest-path depth from the sources: a node with no producers ranks 0,
 * every other node ranks one past its deepest producer. The number a
 * left-to-right auto-layout would use as its column. Blocked nodes (see
 * `topologicalOrder`) are absent from the map — no honest rank exists for
 * them.
 */
export function rank(scene: { nodes: readonly { id: string }[]; edges: readonly SceneEdgeEnds[] }): Map<string, number> {
  const { successors } = dependencyGraph(scene);
  const { order } = topologicalOrder(scene);
  const ranks = new Map<string, number>();
  for (const id of order) ranks.set(id, 0);
  for (const id of order) {
    const from = ranks.get(id)!;
    for (const next of successors.get(id)!) {
      // A successor that is blocked never entered `ranks`; leave it out
      // rather than inventing a depth for it.
      if (ranks.has(next)) ranks.set(next, Math.max(ranks.get(next)!, from + 1));
    }
  }
  return ranks;
}

/* ------------------------------------------------------------------ */
/* Cycles — the linter's real input                                    */
/* ------------------------------------------------------------------ */

/**
 * Every knot of mutual reachability: strongly connected components with
 * two or more nodes, plus self-loops, members in scene order. An SCC
 * rather than an enumerated loop path ON PURPOSE — one component can
 * contain many interleaved loops and "the" cycle path is not unique, so a
 * linter pointing at the whole knot tells the truth; a linter pointing at
 * one arbitrary path through it does not. Tarjan's algorithm, iterative
 * (an explicit stack, not recursion) so a pathological chain cannot blow
 * the call stack.
 */
export function findCycles(scene: { nodes: readonly { id: string }[]; edges: readonly SceneEdgeEnds[] }): string[][] {
  const { ids, successors } = dependencyGraph(scene);
  const indexOf = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  const selfLoop = new Set<string>();
  for (const id of ids) {
    if (successors.get(id)!.includes(id)) selfLoop.add(id);
  }

  for (const root of ids) {
    if (indexOf.has(root)) continue;
    // Each frame: [node, index of the next successor to visit].
    const frames: [string, number][] = [[root, 0]];
    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      const [node, nextChild] = frame;
      if (nextChild === 0) {
        indexOf.set(node, counter);
        lowlink.set(node, counter);
        counter++;
        stack.push(node);
        onStack.add(node);
      }
      const children = successors.get(node)!;
      if (nextChild < children.length) {
        frame[1]++;
        const child = children[nextChild];
        if (!indexOf.has(child)) {
          frames.push([child, 0]);
        } else if (onStack.has(child)) {
          lowlink.set(node, Math.min(lowlink.get(node)!, indexOf.get(child)!));
        }
      } else {
        // Node finished: close its component if it is a root, then fold
        // its lowlink into its parent's.
        if (lowlink.get(node) === indexOf.get(node)) {
          const members: string[] = [];
          for (;;) {
            const popped = stack.pop()!;
            onStack.delete(popped);
            members.push(popped);
            if (popped === node) break;
          }
          if (members.length > 1 || selfLoop.has(node)) components.push(members);
        }
        frames.pop();
        if (frames.length > 0) {
          const parent = frames[frames.length - 1][0];
          lowlink.set(parent, Math.min(lowlink.get(parent)!, lowlink.get(node)!));
        }
      }
    }
  }

  // Scene order, inside each knot and between knots — deterministic for a
  // linter's report regardless of traversal accidents.
  const position = new Map(ids.map((id, i) => [id, i]));
  for (const members of components) members.sort((a, b) => position.get(a)! - position.get(b)!);
  components.sort((a, b) => position.get(a[0])! - position.get(b[0])!);
  return components;
}

/* ------------------------------------------------------------------ */
/* Duplicate edges — "multiple edges ending at the same port" lint      */
/* ------------------------------------------------------------------ */

/** Unordered, both handles included: `a/x → b/y` and `b/y → a/x` are the
 *  same pair — the visible fact is "N edges between these two ports", not
 *  which end either edge calls `source`. The SAME rule the view kit's
 *  duplicate fan uses (`wiring.ts`'s `fanWires`), so the lint and the
 *  drawing can never disagree about what counts as a duplicate. */
function unorderedPairKey(edge: SceneEdgeEnds): string {
  const a = portKey(edge.source, edge.sourceHandle ?? "");
  const b = portKey(edge.target, edge.targetHandle ?? "");
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

/** Groups of 2+ edges sharing one unordered endpoint pair, groups in
 *  first-seen order, edges in scene order. Empty when every pair is
 *  unique — the honest nothing, not an error. */
export function duplicateEdges<E extends SceneEdgeEnds>(scene: { edges: readonly E[] }): E[][] {
  const groups = new Map<string, E[]>();
  for (const edge of scene.edges) {
    const key = unorderedPairKey(edge);
    const group = groups.get(key);
    if (group) group.push(edge);
    else groups.set(key, [edge]);
  }
  return [...groups.values()].filter((group) => group.length >= 2);
}

/* ------------------------------------------------------------------ */
/* Dangling edges — "an edge end that points at nothing" lint           */
/* ------------------------------------------------------------------ */

/** One unresolvable edge end. `reason` separates the two failures a
 *  linter reports differently: the whole node is gone, or the node is
 *  alive but no longer speaks that port. */
export interface DanglingEdgeEnd {
  edgeId: string;
  end: "source" | "target";
  /** The node id this end names — dead or alive. */
  nodeId: string;
  /** The handle this end names, when it names one. */
  portId?: string;
  reason: "missing-node" | "missing-port";
}

/**
 * Every edge end that does not resolve to a live node — and, when the
 * caller can state a node's port vocabulary, to a live PORT on it. One
 * function serves both of Zach's cases (2026-09-17): during interaction
 * a host may permit dangling deliberately (`deleteNode`'s `"dangle"` /
 * `"park"` policies in linking.ts) and this is what keeps that safe
 * rather than silently corrupting; at load time nobody chose anything,
 * so a dangling un-parked end means the document is wrong. Same
 * question either way — only the response differs, and the response is
 * the host's.
 *
 * `portsOf` is optional and per-node total: omitted, only node
 * existence is checked; returning `undefined` for a node means "this
 * node's vocabulary is unknown", so no port judgement is made for it.
 * The port check exists because port identity is namespaced to the node
 * (`portKey`): a node can survive while one of its ports dies, and a
 * node-only check never sees that. An end with no handle wires the
 * NODE, so it can only dangle by `missing-node`.
 *
 * Total: a healthy scene yields `[]`, malformed input yields the honest
 * report, never a throw. Scene order, source end before target —
 * deterministic for a linter.
 */
export function findDanglingEdges<E extends SceneEdgeEnds & { id: string }>(
  scene: { nodes: readonly { id: string }[]; edges: readonly E[] },
  portsOf?: (nodeId: string) => readonly string[] | undefined,
): DanglingEdgeEnd[] {
  const known = new Set(scene.nodes.map((node) => node.id));
  const report: DanglingEdgeEnd[] = [];
  for (const edge of scene.edges) {
    for (const end of ["source", "target"] as const) {
      const nodeId = edge[end];
      const handle = end === "source" ? edge.sourceHandle : edge.targetHandle;
      if (!known.has(nodeId)) {
        report.push({ edgeId: edge.id, end, nodeId, ...(handle != null ? { portId: handle } : {}), reason: "missing-node" });
        continue;
      }
      if (handle == null || !portsOf) continue;
      const vocabulary = portsOf(nodeId);
      if (vocabulary !== undefined && !vocabulary.includes(handle)) {
        report.push({ edgeId: edge.id, end, nodeId, portId: handle, reason: "missing-port" });
      }
    }
  }
  return report;
}

/* ------------------------------------------------------------------ */
/* Identity under duplication                                          */
/* ------------------------------------------------------------------ */

/**
 * An independent copy of one node. The id is minted by the CALLER —
 * host-owned id minting, the same D9 rule `portLane.ts`'s `mintItem`
 * already established: this module never invents an id. Everything else
 * copies verbatim: `data` (so the copy keeps its `name` — two nodes may
 * share a name; they may never share an id), `position` (the caller
 * offsets it if it wants a visible ghost), `parentId` (the copy lives
 * where the original lives), and `definitionId` (a copy of a linked copy
 * is another linked copy of the SAME definition — copying never launders
 * the link away, and never adds one).
 *
 * Edges are NOT copied: an edge names two specific ports on two specific
 * nodes, and the copy's ports have no wires yet — duplicating a node must
 * not silently multiply connections (React Flow's own copy behaviour).
 * Children are not copied either — this is one node, not a subtree.
 *
 * Total + referentially honest: an unknown `nodeId` returns the SAME
 * scene object (not a structurally-equal copy), the no-op contract
 * `reconcilePortLane` set for this codebase.
 */
export function duplicateNode<NodeData extends SceneData, EdgeData extends SceneData>(
  scene: BlockScene<NodeData, EdgeData>,
  nodeId: string,
  mintId: () => string,
): BlockScene<NodeData, EdgeData> {
  const source = scene.nodes.find((node) => node.id === nodeId);
  if (!source) return scene;
  return { ...scene, nodes: [...scene.nodes, { ...source, id: mintId() }] };
}

/**
 * A LINKED copy: same as `duplicateNode`, except the copy is another
 * OCCURRENCE of the source's definition. If the source already belongs
 * to a group, the copy shares its `definitionId`; if not, a group id is
 * minted (the second `mintId` call) and stamped on BOTH — the source
 * becomes the group's first occurrence, not its root: a definition has
 * no root node, only members, so deleting any one occurrence (the
 * original included) never orphans the rest. "Every occurrence of this
 * definition" stays one equality test (`linkedCopies`), never a walk.
 */
export function linkedCopy<NodeData extends SceneData, EdgeData extends SceneData>(
  scene: BlockScene<NodeData, EdgeData>,
  nodeId: string,
  mintId: () => string,
): BlockScene<NodeData, EdgeData> {
  const source = scene.nodes.find((node) => node.id === nodeId);
  if (!source) return scene;
  const copyId = mintId();
  const definitionId = source.definitionId ?? mintId();
  const copy = { ...source, id: copyId, definitionId };
  const nodes = source.definitionId
    ? [...scene.nodes, copy]
    : [...scene.nodes.map((node) => (node === source ? { ...node, definitionId } : node)), copy];
  return { ...scene, nodes };
}

/** Every occurrence of one definition group, in scene order — the
 *  original among them: occurrences are peers, none is privileged. */
export function linkedCopies<NodeData extends SceneData>(
  scene: { nodes: readonly SceneNode<NodeData>[] },
  definitionId: string,
): SceneNode<NodeData>[] {
  return scene.nodes.filter((node) => node.definitionId === definitionId);
}

/* ------------------------------------------------------------------ */
/* Nesting queries                                                     */
/* ------------------------------------------------------------------ */

/** The members of one node, in scene order — the read side of
 *  `parentId`. */
export function childrenOf<NodeData extends SceneData>(
  scene: { nodes: readonly SceneNode<NodeData>[] },
  nodeId: string,
): SceneNode<NodeData>[] {
  return scene.nodes.filter((node) => node.parentId === nodeId);
}
