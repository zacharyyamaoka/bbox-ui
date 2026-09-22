// src/chrome/problems.ts — the Problems panel's model: DERIVED, never stored.
//
// WHY derived (plan §5, L4's row: "Problems panel derives from `lintScene`
// over the projection — a control-flow region can never appear as a dangling
// edge"): the archive's `diagnostics/diagnosticsModel.ts` walked a live
// tldraw `Editor` end to end and kept its own model in step with the
// document; every drift bug it ever had came from that second copy. Here the
// chain is one direction only — store → `useDocumentScene` (L3's projection)
// → `lintScene` (the trunk's pure rule engine) → rows. Nothing is written,
// nothing is cached across edits, and a finding cannot outlive the fact that
// produced it.
//
// NEVER MIX DATA AND CONTROL LINES lands here as a free property rather than
// a rule this file enforces: the projection emits an edge ONLY for an
// `ss-wire` with both bindings (`sceneFromStore.ts`), and containment is
// `parentId`. So a region holding members, an expanded Block holding its
// contents, and a branch's arms are structurally invisible to every graph
// rule below — they can never be reported as a dangling edge, a cycle or a
// fan-in.
import { useCallback, useMemo } from "react";
import type { Editor, TLShapeId } from "tldraw";

import type { Diagnostic, DiagnosticGroup, Severity } from "@trunk/editor/problemsPanel";
import { type LintFinding, type PortsOf } from "@trunk/scene/lint";
import { lintSceneAtLevel, type ValidationLevel } from "@trunk/scene/validationLevel";
import { findCycles, type SceneEdgeEnds } from "@trunk/scene/scene";

import { useDocumentScene, type DocNodeData, type DocumentScene } from "../document/sceneFromStore";
import { portTypesOfScene } from "../document/sceneVocabulary";
import { useValidationLevel } from "./ShareMenu/validationLevelHost";
import { FLOATING_PORT_ID, PORT_SIDES } from "../shapes/types";

/**
 * The two severities this app shows as filter chips, in the donor's own
 * spelling (`×` for error, `!` for warning — BoardDiagnosticsPanel.tsx).
 * `info` is deliberately absent: `problemsPanel.tsx`'s own header records
 * why ("a note is not a mark, and painting every informational finding is how
 * a board loses the ability to look calm") — an `info` finding still counts
 * in the All total, it just gets no chip of its own.
 */
export const PROBLEM_SEVERITIES: readonly Severity[] = [
  { id: "error", label: "Errors", glyph: "×", tone: "error" },
  { id: "warning", label: "Warnings", glyph: "!", tone: "warning" },
];

/** One group, because this board IS the one scope there is. The kit renders
 *  `group.label` rather than a hardcoded "Board" (its design decision #6), so
 *  the literal lives here, where the scope is actually decided. */
const BOARD_GROUP_ID = "board";

/**
 * Per-node port vocabulary for the lint engine.
 *
 * `undefined` means "unknown vocabulary, no port judgement for this node" —
 * the kit-wide convention (`lint.ts`'s `PortsOf`). Code cells and regions
 * return exactly that, and truthfully: neither speaks ports, and neither can
 * be a wire target at all (`documentModel.test.ts`: `canBind` is false for
 * both), so a wire naming one is already caught as a MISSING NODE-shaped
 * error by nothing at all — it cannot exist.
 *
 * A floating `ss-port` is a one-port node whose single port is always
 * `FLOATING_PORT_ID` (types.ts), so its vocabulary is that one string.
 */
export function portsOfScene(scene: DocumentScene): PortsOf {
  const byId = new Map<string, DocNodeData>();
  for (const node of scene.nodes) byId.set(node.id, node.data);
  return (nodeId) => {
    const data = byId.get(nodeId);
    if (!data) return undefined;
    if (data.kind === "port") return [FLOATING_PORT_ID];
    if (data.kind !== "block") return undefined;
    return PORT_SIDES.flatMap((side) => data.ports?.[side] ?? []);
  };
}

/** `${nodeId}/${portId}` — `@trunk/scene/scene`'s `portKey`, read backwards.
 *
 *  WHY the LAST slash and not the first: this app's own shape ids carry no
 *  slash, but `src/backend/OpenPython.tsx` keeps a pyblocks block's semantic
 *  id verbatim behind the `shape:` prefix, so a real id on a Python board is
 *  `shape:function:run@9:0/transform:call@11:13-11:30`. Splitting at the
 *  FIRST slash answered `shape:function:run@9:0` — a shape that does not
 *  exist — and every Problems row about such a board silently revealed
 *  nothing (`reveal` bails on an unknown id). A port id carries no slash, so
 *  the last one is always the separator. */
function nodeIdOfPortSubject(subjectId: string): string {
  const slash = subjectId.lastIndexOf("/");
  return slash === -1 ? subjectId : subjectId.slice(0, slash);
}

/** The shape a finding is about. Only a PORT subject carries a port suffix
 *  to strip — a node subject IS a shape id (and may contain slashes of its
 *  own), an edge subject is the `ss-wire`'s id. */
export function shapeIdOfSubject(subject: LintFinding["subject"]): string {
  return subject.kind === "port" ? nodeIdOfPortSubject(subject.id) : subject.id;
}

/** A human name for a node, for the row's second line. */
function nameOf(scene: DocumentScene, nodeId: string): string {
  const node = scene.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return nodeId;
  const { kind, name } = node.data;
  if (kind === "code") return "a code cell";
  return name ? `"${name}"` : `an unnamed ${kind}`;
}

/**
 * The row's `detail` — WHERE on the board this is, in the board's own words.
 *
 * The kit's `Diagnostic` wants message AND detail; `LintFinding` carries only
 * a message (plus the subject it is about). Rather than repeat the message,
 * this resolves the subject into something a person can go look for.
 */
function detailOf(scene: DocumentScene, finding: LintFinding): string {
  const { kind, id } = finding.subject;
  if (kind === "node") return `On ${nameOf(scene, id)}.`;
  if (kind === "port") {
    const nodeId = nodeIdOfPortSubject(id);
    return `On port "${id.slice(nodeId.length + 1)}" of ${nameOf(scene, nodeId)}.`;
  }
  const edge = scene.edges.find((candidate) => candidate.id === id);
  if (!edge) return "On a wire.";
  return `On the wire from ${nameOf(scene, edge.source)} to ${nameOf(scene, edge.target)}.`;
}

/* ------------------------------------------------------------------ */
/* A region's interface block has TWO faces                            */
/* ------------------------------------------------------------------ */

/**
 * The two faces of a region's interface block, while the cycle rule is
 * looking. `\u0000` cannot occur in a tldraw shape id, so neither half can
 * ever collide with a real node.
 */
const REGION_FACE_IN = "\u0000in";
const REGION_FACE_OUT = "\u0000out";

/**
 * Which rail a port sits on.
 *
 * left/top = the block's inputs, right/bottom = its outputs — the convention
 * `sceneFromStore.ts`'s `blockData` projects and `Block` draws. `undefined`
 * is the kit-wide "unknown vocabulary, no judgement" (see `portsOfScene`);
 * an endpoint whose rail cannot be read is left on the whole block, which is
 * the conservative answer — it can only keep a finding, never invent one.
 */
function railOf(data: DocNodeData | undefined, portId: string | null | undefined): "in" | "out" | undefined {
  if (!data || data.kind !== "block" || portId == null) return undefined;
  if ((data.ports?.left ?? []).includes(portId) || (data.ports?.top ?? []).includes(portId)) return "in";
  if ((data.ports?.right ?? []).includes(portId) || (data.ports?.bottom ?? []).includes(portId)) return "out";
  return undefined;
}

/**
 * Every node that sits on a REAL dependency loop — a region's own boundary
 * excluded.
 *
 * WHY this exists, and why it is a correction rather than a suppression:
 * "a region's interface IS a real block", so `src/backend/OpenPython.tsx`
 * mints one corner block per region and re-points BOTH of the boundary's
 * wires at it — the parameter leaving the interface into the body, and the
 * return coming back. `@trunk/scene/lint.ts`'s `cycleRule` wraps
 * `findCycles` (Tarjan SCC) over a graph of NODES, and one node cannot have
 * two faces, so `run#corner → decode() → scale() → run#corner` read as a
 * dependency loop: `linear_chain.py`, a straight line with no cycle
 * anywhere, opened with three ERROR rows saying its own functions fed
 * themselves (measured 2026-09-19, and the fixture reproduces it in
 * `src/backend/backend.test.ts`).
 *
 * The fix is the standard hierarchical-dataflow one — split the boundary
 * node into its two faces before running the SCC — and the split is by RAIL,
 * not by direction. A region's left rail is one endpoint of the whole
 * program's flow (the outside writes it, the inside reads it) and its right
 * rail is the other. So:
 *
 *     outside ─▶ run#in ─▶ decode ─▶ scale ─▶ run#out ─▶ outside
 *
 * is a chain, exactly as the source is. Splitting by DIRECTION instead —
 * "everything leaving the corner is one half" — was tried first and does not
 * work: both boundary wires face the inside, so they land on the same half
 * and the loop survives.
 *
 * A REAL loop still reports. Wire the region's output back into its own
 * input and the graph reads `run#out → … → run#in → decode → scale →
 * run#out`, which is an SCC and is caught; so is any loop that never touches
 * a region at all.
 *
 * Owed upstream: the trunk's `cycleRule` states in its own provenance that
 * this scene kit "has no region/branch/arm concept", which is why the split
 * lives here, in the app that does have one, rather than in a shared rule
 * that would have to invent the vocabulary first.
 */
function nodesOnRealCycles(scene: DocumentScene): Set<string> {
  const dataById = new Map<string, DocNodeData>();
  for (const node of scene.nodes) dataById.set(node.id, node.data);

  const corners = new Set<string>();
  for (const node of scene.nodes) {
    if (node.data.kind === "region" && node.data.cornerBlockId) corners.add(node.data.cornerBlockId);
  }

  const faceOf = (corner: string, portId: string | null | undefined): string => {
    const rail = railOf(dataById.get(corner), portId);
    if (rail === undefined) return corner;
    return `${corner}${rail === "in" ? REGION_FACE_IN : REGION_FACE_OUT}`;
  };

  const nodes: { id: string }[] = scene.nodes.map((node) => ({ id: node.id }));
  for (const corner of corners) {
    nodes.push({ id: `${corner}${REGION_FACE_IN}` }, { id: `${corner}${REGION_FACE_OUT}` });
  }

  const edges: SceneEdgeEnds[] = scene.edges.map((edge) => ({
    source: corners.has(edge.source) ? faceOf(edge.source, edge.sourceHandle) : edge.source,
    target: corners.has(edge.target) ? faceOf(edge.target, edge.targetHandle) : edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
  }));

  const members = new Set<string>();
  for (const component of findCycles({ nodes, edges })) {
    for (const id of component) {
      const face = id.endsWith(REGION_FACE_IN) ? REGION_FACE_IN : id.endsWith(REGION_FACE_OUT) ? REGION_FACE_OUT : "";
      members.add(face ? id.slice(0, -face.length) : id);
    }
  }
  return members;
}

/**
 * The rules THIS LEVEL runs, over this board — the pure half of `useProblems`,
 * exported so a projection can be graded against the linter with no React tree
 * at all (`src/backend/backend.test.ts` runs it over the committed pyblocks
 * fixtures).
 *
 * `level` is REQUIRED, deliberately. It was added by ruling 3, and a default
 * would have let a caller keep the old "every rule at every level" behaviour
 * without ever saying so — which is exactly the state this lane found the
 * feature in: a level chosen in Settings that no surface read.
 */
export function boardLintFindings(scene: DocumentScene, level: ValidationLevel): LintFinding[] {
  const findings = lintSceneAtLevel(scene, level, { portsOf: portsOfScene(scene), typeOf: portTypesOfScene(scene) });
  if (!findings.some((finding) => finding.ruleId === "cycle")) return findings;
  const real = nodesOnRealCycles(scene);
  return findings.filter((finding) => finding.ruleId !== "cycle" || real.has(finding.subject.id));
}

export interface BoardProblems {
  groups: readonly DiagnosticGroup[];
  counts: Readonly<Record<string, number>>;
  total: number;
  /** Select the subject and fit the camera to it. The kit's own row title
   *  promises exactly this ("Select and fit the affected board objects"). */
  reveal(diagnostic: Diagnostic): void;
}

/**
 * The rules the CHOSEN LEVEL runs, and only those.
 *
 * Ruling 3 changed this paragraph. It used to read "every rule runs" — every
 * rule, at every level, including "Whiteboard — anything goes" — because
 * nothing here had ever read the setting. Now the level decides, and the two
 * rules that used to be inert have separate fates:
 *
 *   - `type-mismatch` NOW CONTRIBUTES, at `typed` and `strict` only. Its
 *     resolver is `document/sceneVocabulary.ts`'s `portTypesOfScene`, and the
 *     objection that used to keep it out — that wiring it would silently mint
 *     the type ontology from a menu lane, when `lint.ts`'s own header calls
 *     that a product decision with no data support — is answered by the level
 *     itself: the user is the one choosing, and the two loose rungs withhold
 *     the resolver outright (`validationLevel.ts`'s `vocabularyForLevel`,
 *     `types: "off"`). The shipped default is `guided`, so a board that has
 *     never opened Settings sees no change from this.
 *   - `polarity` STILL contributes nothing, and still on purpose: it needs a
 *     `directionOf`, and this document model only states a direction for a
 *     FLOATING `ss-port` — a Block's ports have no direction field at all
 *     (`PortSpecV` is `{id, declaration}`). A resolver that judged some edges
 *     and abstained on others would make the rule's verdict depend on which
 *     end you drew first. It becomes a one-line addition the day the schema
 *     has the vocabulary.
 */
export function useProblems(editor: Editor): BoardProblems {
  const scene = useDocumentScene(editor);
  // Ruling 3, the read side. `useValidationLevel` is a live module store, not
  // this component's state: the Settings dialog that WRITES the level unmounts,
  // and this panel never does, so a hook local to either would leave the board
  // marked up at whatever level it was mounted with until reload.
  const level = useValidationLevel();

  const { groups, counts, total, shapeIdByRow } = useMemo(() => {
    const findings = boardLintFindings(scene, level);
    const diagnostics: Diagnostic[] = [];
    // WHY a side table keyed by row id, rather than re-parsing the id string
    // in `reveal`: `LintFinding.id` is
    // `lint:<rule>:<kind>:<subject>[:<detail>]` and BOTH a tldraw shape id
    // (`shape:xxx`) and the optional `detail` segment carry colons of their
    // own, so the string is not losslessly splittable. The subject is known
    // right here, where the finding is — carrying it forward costs one Map
    // and cannot be ambiguous.
    const rows = new Map<string, TLShapeId>();
    for (const finding of findings) {
      diagnostics.push({
        id: finding.id,
        code: finding.code ?? finding.ruleId,
        severity: finding.severity,
        message: finding.message ?? finding.ruleId,
        detail: detailOf(scene, finding),
      });
      rows.set(finding.id, shapeIdOfSubject(finding.subject) as TLShapeId);
    }
    const tally: Record<string, number> = { all: diagnostics.length };
    for (const diagnostic of diagnostics) {
      tally[diagnostic.severity] = (tally[diagnostic.severity] ?? 0) + 1;
    }
    return {
      groups: diagnostics.length === 0 ? [] : [{ id: BOARD_GROUP_ID, label: "Board", diagnostics }],
      counts: tally,
      total: diagnostics.length,
      shapeIdByRow: rows,
    };
  }, [scene, level]);

  const reveal = useCallback(
    (diagnostic: Diagnostic) => {
      const shapeId = shapeIdByRow.get(diagnostic.id);
      if (!shapeId || !editor.getShape(shapeId)) return;
      editor.select(shapeId);
      const bounds = editor.getShapePageBounds(shapeId);
      if (bounds) editor.zoomToBounds(bounds, { inset: 96, animation: { duration: 0 } });
    },
    [editor, shapeIdByRow],
  );

  return { groups, counts, total, reveal };
}
