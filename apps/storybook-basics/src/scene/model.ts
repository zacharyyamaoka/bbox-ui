// src/scene/model.ts — the scene's own vocabulary, in one file.
//
// WHY this file exists (Zach, 2026-09-21): `scene/` IS the domain model, and
// until now it had no place that said so — 170 exported types spread across
// 33 files, with the record itself declared in `scene.ts` beside the pure
// functions over it, and the port vocabulary declared in `lint.ts` as though
// "which way does a port face" were a linting concern rather than a fact
// about what a scene IS. A reader asking "what is a scene here?" had no file
// to open.
//
// WHAT BELONGS HERE, stated so the next addition is not a judgement call:
// a type that DESCRIBES WHAT A SCENE IS, is imported by five or more files,
// and is not the options-or-result type of one function. That third clause
// is what keeps this from becoming a types dump — `SceneOrder` and
// `DanglingEdgeEnd` are what `topologicalOrder` and `findDanglingEdges`
// RETURN, `LintScene` is a structural slice named for its one consumer, and
// `ConnectionMessage`/`ConnectionVerdict` are one judge's verdict
// vocabulary. All of those read correctly where they are and stay there.
//
// WHAT THIS FILE MAY IMPORT: nothing. Not React, not a canvas engine, not
// `components/`. `scene/` already imports `components/` type-only in 13
// files and that stays legal — but the file everything else imports is not
// where that edge belongs, which is why `WireStyleData` (built from
// `components/trace.layout`'s `TraceVariant`/`TraceRouting`/
// `TraceMarkerEnd`) stayed in `sceneWires.ts`: it describes how a wire is
// PAINTED, not what a scene is.
//
// Every declaration below was MOVED here, not copied — `scene.ts`,
// `lint.ts` and `linking.ts` now re-export from this file, so each type
// still has exactly one declaration site and every existing import keeps
// working. `PortsOf` was additionally declared a second time, identically,
// in `batchWire.ts`; that copy is gone and it imports this one.

/* ------------------------------------------------------------------ */
/* The record                                                          */
/* ------------------------------------------------------------------ */

/** Node/edge `data` payloads. A `type` alias (never an `interface`) is what
 *  hosts should extend with — TS gives object-literal type aliases the
 *  implicit index signature that `Record<string, unknown>` compatibility
 *  (and React Flow's own generics) require; interfaces don't get one. */
export type SceneData = Record<string, unknown>;

export interface ScenePosition {
  x: number;
  y: number;
}

/**
 * One block in the scene. `parentId` IS the nesting — membership is a
 * scene fact, not a layout mode (`blockMembers.tsx` renders it; it does
 * not own it).
 *
 * WHY `position` lives here and `BlockScene` has NO separate `placements`
 * table — argued both ways, decided (docs/SCENE-KIT.md §placement):
 *   FOR a separate table: the repo line "interaction geometry is
 *   host-owned". But that line names hit-testing, snapping, drag and
 *   z-order — the TRANSIENT geometry of a gesture. The same line's first
 *   half says layout geometry is portable and travels; an authored
 *   at-rest position is layout, exactly like `BlockMember.x/y` already is.
 *   AGAINST a separate table: two structures owning one fact is precisely
 *   the split-model disease this kit exists to cure (nesting/placement
 *   were fused in one place and absent everywhere else), and React Flow
 *   makes `position` REQUIRED on the node — a placements side-table would
 *   force every adapter to run a join before the types line up, and the
 *   assignability proof would need a cast, which is the criterion failing.
 * So: `position` is the node's authored at-rest placement, in the parent's
 * coordinate space when `parentId` is set (React Flow's sub-flow rule,
 * kept). A host mid-drag owns the moving copy and writes back here at
 * rest.
 *
 * Identity: `id` is the identity — opaque, unique per scene, never derived
 * from what the node is called. A display name is data (`data.name` by
 * convention), free to collide and free to change without any edge
 * noticing. This is the rule `portLane.ts` had to reconstruct with an LCS
 * diff because port lines carried no id; scene nodes never have that
 * problem because the id travels with the record. `definitionId` marks
 * membership in a definition GROUP — see `linkedCopy` below and
 * `src/scene/linking.ts` for the rules that maintain it.
 */
export interface SceneNode<Data extends SceneData = SceneData> {
  id: string;
  /** Host-interpreted kind (React Flow's `nodeTypes` key). Optional. */
  type?: string;
  /** Authored at-rest placement. See the WHY above. */
  position: ScenePosition;
  /** Required (matching React Flow) so the record travels whole — `{}` is
   *  the honest empty, `undefined` is a hole every adapter must patch. */
  data: Data;
  /** The nesting. Absent = top-level. */
  parentId?: string;
  /** The definition GROUP this node is an occurrence of: an opaque id
   *  shared by every occurrence, minted by the host like a node id and
   *  never equal to one — there is no privileged "definition node", the
   *  definition IS the shared data (the function-definition model:
   *  `src/scene/linking.ts` owns the rules). Absent = a group of one.
   *  Extra field over React Flow's `Node` — structurally invisible to
   *  it, deliberately. */
  definitionId?: string;
}

/**
 * One connection. `source`/`target` are node ids; `sourceHandle`/
 * `targetHandle` are port ids on those nodes — a port is identified by
 * (node id, port id), never globally. Stricter than React Flow in one
 * spot, on purpose: handles are `string | undefined`, not
 * `string | null | undefined` — two spellings of "no handle" is one too
 * many, and `undefined` assigns into React Flow's wider type for free.
 */
export interface SceneEdge<Data extends SceneData = SceneData> {
  id: string;
  /** Host-interpreted kind (React Flow's `edgeTypes` key). Optional. */
  type?: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  data?: Data;
}

/**
 * A ref to one scene object, for `SceneLink.members`: `node:<id>`,
 * `edge:<id>` or `port:<nodeId>/<portId>` (the port form is `portKey`'s
 * own spelling after the prefix). Built and parsed by `./links.ts`.
 */
export type ObjectRef = string;

/**
 * LINKED OBJECTS (Zach, 2026-09-22): a set of scene objects that are
 * individually selectable, are NOT a group (no box, no position, no
 * containment), and are deleted together — delete any one member and every
 * other member goes too. The first use is a cable split at a frame wall:
 * [outer half-cable, wall port, inner half-cable] is one cable drawn in
 * three pieces. General on purpose ("there are other scenarios when this
 * linked object idea could be used, so make it general"). The rules live in
 * `./links.ts`.
 */
export interface SceneLink {
  id: string;
  members: ObjectRef[];
}

/** The scene: nodes + edges (+ optional link sets). Plain mutable arrays so
 *  a host can hand them straight to its engine (React Flow's
 *  `useNodesState` wants `Node[]`, not `readonly Node[]`); the pure
 *  functions below take `readonly` views and never mutate. */
export interface BlockScene<NodeData extends SceneData = SceneData, EdgeData extends SceneData = SceneData> {
  nodes: SceneNode<NodeData>[];
  edges: SceneEdge<EdgeData>[];
  /**
   * ADDITIVE, OPTIONAL (2026-09-22): the link sets — see `SceneLink`.
   * Absent means none, so every scene literal written before this field
   * existed keeps its exact meaning, and every pure function that spreads
   * `...scene` carries the sets through untouched. React Flow's `Node`/
   * `Edge` types never see it (`scene.reactflow.test.ts`'s assignability
   * is per node/edge, not per scene).
   */
  links?: SceneLink[];
}


/* ------------------------------------------------------------------ */
/* Structural slices — what a pure function actually reads. Typed      */
/* minimally so the SAME function runs on a BlockScene, on a React Flow */
/* store's nodes/edges, or on any host's records that speak the         */
/* vocabulary. Matching the graph data types IS the adapter.            */
/* ------------------------------------------------------------------ */

export interface SceneEdgeEnds {
  source: string;
  target: string;
  /** `null` admitted here (only here) so React Flow's own `Edge[]`, whose
   *  handles are `string | null | undefined`, feeds these functions
   *  unmodified. */
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface ScenePortRef {
  nodeId: string;
  portId: string;
}


/* ------------------------------------------------------------------ */
/* The port vocabulary — asked for as RESOLVERS, never as fields, so a */
/* structural slice stays satisfiable by a BlockScene, a React Flow    */
/* store or a hand-built fixture with no adapter. `undefined` means    */
/* "unknown, no judgement" everywhere it appears.                       */
/* ------------------------------------------------------------------ */

/** Per-node port vocabulary, total: same contract as `findDanglingEdges`'s
 *  own `portsOf` (scene.ts:412-416) — omitted, only node existence is
 *  checked; `undefined` for a node means "unknown vocabulary, no port
 *  judgement for it." Reused verbatim rather than re-declared so the two
 *  call sites can never drift. */
export type PortsOf = (nodeId: string) => readonly string[] | undefined;

/**
 * A port's declared type vocabulary, or `undefined` for "unconstrained" —
 * same convention as `PortsOf` above. Shape adopted from Blockly
 * `ConnectionChecker.doTypeChecks` (Apache-2.0, fetched
 * `core/connection_checker.ts:203-219`): an optional ARRAY of accepted
 * tags per side, not a single type string, so a port can legitimately
 * accept more than one shape (a union-typed input). See this file's own
 * header for why maxGraph's `Multiplicity` was rejected as the donor.
 */
export type PortTypeOf = (ref: ScenePortRef) => readonly string[] | undefined;

/**
 * Which way a port faces: does it EMIT a value or RECEIVE one?
 *
 * This kit had no such vocabulary at all before 2026-09-18. `ScenePortRef`
 * is `{nodeId, portId}`, `PortsOf` returns bare NAMES, and `SceneNode` has
 * no ports field — so nothing in `src/scene/` could tell an output from an
 * input, and `validateConnection` consequently judged output→output LEGAL
 * (measured on `ValidityPreview`'s own fixture: dragging `num1/out` painted
 * `num2/out` available). See `docs/peps/0002-the-judge-owns-edge-orientation.md`.
 *
 * Declared as a RESOLVER, not a field, for the same reason `PortTypeOf` is:
 * a `LintScene` is a structural slice that a `BlockScene`, a React Flow
 * store, or a hand-built fixture all satisfy with no adapter, and adding a
 * required field to it would break that. `undefined` means "unknown
 * direction, no judgement" — the identical convention `PortsOf` and
 * `PortTypeOf` already document, so a caller that supplies nothing gets
 * byte-identical findings to before this existed.
 *
 * Vocabulary is the donor's: SystemSketch `PortPolarity = 'source' | 'sink'`
 * (`src/blocks/connections/connectionModel.ts:88`, opened). The donor DERIVES
 * it — `portPolarity(port.side, face)`, a function of the port's lane and
 * which face of the block is showing (`connectionRules.ts:175,183`) — which
 * this kit cannot do: it has neither lanes nor faces in the scene model. So
 * the answer is asked for rather than computed.
 */
export type PortDirection = "source" | "sink";

/** A port's direction, or `undefined` for "unknown" — see `PortDirection`. */
export type PortDirectionOf = (ref: ScenePortRef) => PortDirection | undefined;

/** Compatible iff... whatever this returns says so. Default is
 *  `typesIntersect` below; a caller may substitute equality, a hierarchy
 *  check, or anything else — this file mints no opinion beyond the list
 *  shape. */
export type TypeCompatible = (from: readonly string[], to: readonly string[]) => boolean;


/* ------------------------------------------------------------------ */
/* Linked-copy identity                                                 */
/* ------------------------------------------------------------------ */

/**
 * The data convention this module operates on. The split is the point
 * (Zach: "it's basically the data that is linked; appearance you have
 * much more flexibility"):
 *
 *   LINKED — shared by every occurrence of one definition:
 *     `name`          the definition's display name, and the linkage
 *                     trigger. NOT blind-copied by `setDefinitionData`;
 *                     it moves only through `commitDefinitionName`, the
 *                     one gesture whose job is to re-derive linkage.
 *                     (Donor parity: `sharedDefinitionProps` excludes
 *                     `title` too, donor 84-95 — raw spellings may
 *                     differ in whitespace, normalized names agree.)
 *     `linked`        the definition's content: port vocabulary, params,
 *                     docs — what the block IS.
 *     `expanded`      the EXPANDED view's appearance. Linked on purpose:
 *                     the expanded view is the function BODY, a function
 *                     gets one definition and all the call sites point
 *                     at that same definition. (Donor: `expandedSize` +
 *                     `expandedWeights` sit inside the shared props,
 *                     donor 91-92, while compact styling stays local.)
 *     `draftOrdinal`  present on a Draft definition; group-wide.
 *
 *   FREE — occurrence-local, never synced:
 *     `appearance`    the designated slot for per-occurrence styling
 *                     (compact view, size, accent, icon). The module
 *                     never reads it — it is named here so the split is
 *                     visible in the type, not just in a comment.
 *     …everything else a host keeps in `data`, plus `position`,
 *     `parentId`, and the node's edges. (Donor: "placement, outer
 *     wiring, current view and compact-view styling" stay local, donor
 *     674-676.)
 */
export type OccurrenceData = SceneData & {
  name?: string;
  draftOrdinal?: number;
  linked?: SceneData;
  expanded?: SceneData;
  appearance?: SceneData;
};
