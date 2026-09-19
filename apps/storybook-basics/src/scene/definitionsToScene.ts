// src/scene/definitionsToScene.ts — the thin adapter from pyblocks'
// DEFINITIONS VIEW (the grain-1 partition, docs/SOURCE-CODE-VIEW-RETARGET-
// PLAN.md §5, produced by `python3 -m pyblocks analyze --view-kind
// definitions <file>`) to a `BlockScene` of grain-1 code cells. This is
// research decision D2's default made concrete: a ~150-line BlockView→
// BlockScene adapter, NOT a merge of the two waists. Types FROZEN by the plan
// commit — the JSON shape below is the cross-repo contract lane
// `scv-definitions-partition` (pyblocks) emits and this file consumes; the
// fixture both sides assert against is
// docs/acceptance/pyblocks/stereo_definitions.expected.json. Body filled by
// lane `scv-rung-a-scene`. Tests: ./definitionsToScene.test.ts (off-limits).
//
// EVERYTHING IS A BLOCK: one node per definition (class / def / nested def,
// recursively), each a region wearing a code face (`codeCell.ts`) whose
// `source` is the definition's exact span bytes and whose `origin` names the
// file + anchor + hash — a grain-1 cell. A function's parameters and PB1
// named outputs travel as `definition.parameters/outputs` so a host can draw
// them as the block's in/out ports (the "port view" in Zach's sketches).
//
// NEVER MIX DATA AND CONTROL: a reference between definitions ("run calls
// estimate_pair") is neither a data cable nor a control line — it is a
// DEPENDENCY. It is emitted as a node-level edge with `type:
// REFERENCE_EDGE_TYPE` and no handles, so a host paints it as its own third
// lane (dashed) and can never confuse it with a port cable or a region arm.
// Whether references should instead become port-level data cables is a
// question for Zach (plan §9); this adapter does not decide it.
//
// Pure: no React, no DOM, no canvas engine, no file IO.

import type { CodeCellData } from "./codeCell";
import type { ConnectionMessage } from "./edgeValidation";
import { REGION_NODE_TYPE } from "./region";
import type { BlockScene, SceneEdge, SceneNode, ScenePosition } from "./scene";

/* ------------------------------------------------------------------ */
/* The definitions view — FROZEN cross-repo JSON contract               */
/* ------------------------------------------------------------------ */

/** 1-based lines, 0-based UTF-8 BYTE columns, end exclusive — pyblocks'
 *  own `SourceSpan` (`blockview.py:37-45`), unchanged. */
export interface DefinitionSpan {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  columnEncoding: "utf8-bytes";
}

export type DefinitionKind = "module" | "class" | "function" | "async-function";

export interface DefinitionParameter {
  /** `left`, `*args`, `**kwargs` — the same spelling pyblocks'
   *  `_visit_function` signature uses (`analyzer.py:358-364`). */
  name: string;
  annotation: string | null;
}

/** A PB1 named output (`dialect.output_ports_by_qualname`, `dialect.py:191`). */
export interface DefinitionOutput {
  name: string;
  dataType: string | null;
}

export interface SourceDefinition {
  /** `<module>`, or the dotted qualname with `#<ordinal>` only for a
   *  duplicate (see `codeOrigin.ts`'s `CodeOrigin.anchor`). Unique per view. */
  anchor: string;
  /** The bare name (`run`); `<module>` for the module. */
  name: string;
  kind: DefinitionKind;
  /** Parent's `anchor`; `null` only for the module. Methods' parent is their
   *  class; nested defs' parent is the enclosing def. */
  parent: string | null;
  /** 0 normally; n for the n-th duplicate of one qualname (file order). */
  ordinal: number;
  /** Start = the decorated line at column 0 (pyblocks' own policy,
   *  `analyzer.py:350-355`); end = the AST end. Module = whole file. */
  span: DefinitionSpan;
  /** `module`, `class Pipeline`, `def Pipeline.run(self, left, right)`,
   *  `async def …` — the function form is pyblocks' own string. */
  signature: string;
  parameters: DefinitionParameter[];
  outputs: DefinitionOutput[];
  /** `sha256:<hex64>` of `text`. For the module this equals the whole
   *  file's sha256 (`source.sha256` below, without the prefix). */
  contentHash: string;
  /** The exact span bytes, decoded as UTF-8. */
  text: string;
}

export type ReferenceKind = "call" | "name" | "attribute";

/** One definition mentions another. `call`: the name is the callee of a
 *  Call; `name`: any other load (an annotation, a base class, a value);
 *  `attribute`: `self.x`/`cls.x` inside a method resolved to a sibling
 *  definition `Class.x`. Header parts (decorators, bases, annotations,
 *  defaults) are attributed to the definition they decorate, deliberately
 *  not to the enclosing scope that evaluates them. */
export interface SourceReference {
  from: string;
  to: string;
  kind: ReferenceKind;
  /** Ascending, unique. */
  lines: number[];
}

export interface DefinitionsDiagnostic {
  severity: "info" | "warning" | "error";
  /** `duplicate-definition`, `syntax-error`, … */
  code: string;
  message: string;
  anchor: string | null;
}

export interface DefinitionsView {
  schemaVersion: 1;
  kind: "definitions";
  source: { name: string; lineCount: number; sha256: string };
  /** Source order, parent before children, module first. */
  definitions: SourceDefinition[];
  /** Sorted by (from's index, to's index, kind: call < name < attribute). */
  references: SourceReference[];
  diagnostics: DefinitionsDiagnostic[];
}

/* ------------------------------------------------------------------ */
/* The scene this produces                                              */
/* ------------------------------------------------------------------ */

export const REFERENCE_EDGE_TYPE = "reference";

export interface ReferenceEdgeData extends Record<string, unknown> {
  kind: ReferenceKind;
  lines: number[];
}

export type DefinitionNodeData = CodeCellData & {
  name: string;
  definition: {
    kind: DefinitionKind;
    signature: string;
    parameters: DefinitionParameter[];
    outputs: DefinitionOutput[];
  };
};

export interface DefinitionsToSceneOptions {
  /** Which definition is being EXPANDED — its strict descendants become the
   *  nodes. `<module>` expands the whole file. */
  rootAnchor: string;
  /** Mints every node and edge id — the D9 rule (`scene.ts`'s
   *  `duplicateNode`): this module never invents an id. */
  mintId: () => string;
  /** Goes into every node's `codeCell.origin.uri` (plan Q2: POSIX path
   *  relative to the board's directory). */
  uri: string;
  /** The scene node the direct children hang under (the expanded cell's
   *  own id, typically). Absent → top level. */
  parentId?: string;
  /** Authored at-rest placement, PARENT-RELATIVE (scene.ts's sub-flow
   *  rule). `index` = position among siblings, `depth` = nesting under the
   *  root (direct children are 0). Default: `{ x: 24, y: 24 + index * 160 }`
   *  — an honest placeholder; layout is host-owned. */
  place?: (definition: SourceDefinition, index: number, depth: number) => ScenePosition;
}

export interface DefinitionsToSceneSuccess {
  ok: true;
  scene: BlockScene<DefinitionNodeData, ReferenceEdgeData>;
  /** anchor → minted node id, for every produced node. */
  nodeIdByAnchor: Record<string, string>;
  /** References with EXACTLY ONE produced endpoint (the other is the root
   *  itself or outside it) — reported, not drawn. References with no
   *  produced endpoint are dropped silently. */
  external: SourceReference[];
}

export type DefinitionsToSceneResult = DefinitionsToSceneSuccess | { ok: false; refusal: ConnectionMessage };

/** `rootAnchor` names no definition in the view. */
export const UNKNOWN_ROOT_ANCHOR = "unknown-root-anchor";

/**
 * Produce: one node per strict descendant of `rootAnchor`, in view order —
 * `type: REGION_NODE_TYPE`, `parentId` = the parent definition's node id
 * (or `options.parentId` for the root's direct children), `data` =
 * `{ name, codeCell: { language: "python", source: text, origin: { uri,
 * anchor, contentHash } }, definition: { kind, signature, parameters,
 * outputs } }`, NO `definitionId` (a region is isolated — region.ts). Then
 * one edge per reference whose BOTH endpoints were produced: `{ id, type:
 * REFERENCE_EDGE_TYPE, source: fromId, target: toId, data: { kind, lines } }`,
 * in view order, no handles. Ids are minted nodes first (view order), then
 * edges (view order).
 */
export function definitionsToScene(view: DefinitionsView, options: DefinitionsToSceneOptions): DefinitionsToSceneResult {
  const byAnchor = new Map(view.definitions.map((definition) => [definition.anchor, definition]));
  if (!byAnchor.has(options.rootAnchor)) {
    return {
      ok: false,
      refusal: {
        severity: "error",
        code: UNKNOWN_ROOT_ANCHOR,
        message: `Nothing to expand: \`${options.rootAnchor}\` names no definition in the definitions view of ${view.source.name}`,
      },
    };
  }

  /**
   * How far under `rootAnchor` this definition sits — 0 for a direct child
   * — or `undefined` when the `parent` chain never reaches the root (the
   * root itself, an ancestor of it, or a sibling branch). Walking the chain
   * rather than trusting `parent` to be one hop is what makes "strict
   * descendant" mean the same thing at every nesting level; the visited set
   * makes a malformed cyclic chain terminate, matching `region.ts`'s own
   * "unknown means stop, not throw" policy.
   */
  const depthUnderRoot = (definition: SourceDefinition): number | undefined => {
    const seen = new Set<string>([definition.anchor]);
    let current = definition.parent;
    let depth = 0;
    while (current !== null && !seen.has(current)) {
      if (current === options.rootAnchor) return depth;
      seen.add(current);
      depth += 1;
      current = byAnchor.get(current)?.parent ?? null;
    }
    return undefined;
  };

  const place = options.place ?? ((_definition, index) => ({ x: 24, y: 24 + index * 160 }));
  const nodeIdByAnchor: Record<string, string> = {};
  const nodes: SceneNode<DefinitionNodeData>[] = [];
  /** How many kept siblings each parent anchor has already placed. */
  const placedUnder = new Map<string, number>();

  for (const definition of view.definitions) {
    const depth = depthUnderRoot(definition);
    if (depth === undefined) continue;
    // Non-null by construction: a strict descendant reached the root through
    // its own `parent`, so it has one.
    const parentAnchor = definition.parent as string;
    const index = placedUnder.get(parentAnchor) ?? 0;
    placedUnder.set(parentAnchor, index + 1);

    const id = options.mintId();
    nodeIdByAnchor[definition.anchor] = id;
    // The parent's node when the parent was kept too; otherwise the cell
    // being expanded, if the caller named one; otherwise top level — and
    // then the key is OMITTED, never written as `undefined`, because a
    // present-but-undefined key is a different record to `toEqual` and to
    // anything that spreads this node.
    const parentId = nodeIdByAnchor[parentAnchor] ?? options.parentId;

    nodes.push({
      id,
      type: REGION_NODE_TYPE,
      position: place(definition, index, depth),
      data: {
        name: definition.name,
        codeCell: {
          language: "python",
          source: definition.text,
          origin: { uri: options.uri, anchor: definition.anchor, contentHash: definition.contentHash },
        },
        definition: {
          kind: definition.kind,
          signature: definition.signature,
          parameters: definition.parameters,
          outputs: definition.outputs,
        },
      },
      ...(parentId !== undefined ? { parentId } : {}),
    });
  }

  // WHY a reference becomes a node-level edge of its OWN type and never a
  // port cable (plan §6, the second load-bearing idea): "run calls
  // estimate_pair" is a DEPENDENCY, not data flowing through a port and not
  // containment. Giving it `REFERENCE_EDGE_TYPE` and no handles is what lets
  // a host paint it as a third lane it can style, hide or ignore wholesale,
  // and makes it structurally impossible to mistake for the data cables
  // `collapse.ts` promotes or for a region arm. Whether references should
  // ALSO become port-level cables is Zach's question (plan §9), and the
  // shape chosen here is the one that leaves it open.
  const edges: SceneEdge<ReferenceEdgeData>[] = [];
  const external: SourceReference[] = [];
  for (const reference of view.references) {
    const source = nodeIdByAnchor[reference.from];
    const target = nodeIdByAnchor[reference.to];
    if (source !== undefined && target !== undefined) {
      edges.push({
        id: options.mintId(),
        type: REFERENCE_EDGE_TYPE,
        source,
        target,
        data: { kind: reference.kind, lines: [...reference.lines] },
      });
      continue;
    }
    // Exactly one end produced: reported so a host can say "this cell also
    // talks to something outside what you expanded" rather than drawing a
    // wire into nothing. Neither end produced is not news — it is a fact
    // about a part of the file nobody asked about — so it is dropped.
    if (source !== undefined || target !== undefined) external.push({ ...reference });
  }

  return { ok: true, scene: { nodes, edges }, nodeIdByAnchor, external };
}
