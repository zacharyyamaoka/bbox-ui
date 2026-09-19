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

import type { Diagnostic, DiagnosticGroup, Severity } from "@trunk/components/problemsPanel";
import { lintScene, type LintFinding, type PortsOf } from "@trunk/scene/lint";

import { useDocumentScene, type DocNodeData, type DocumentScene } from "../document/sceneFromStore";
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
 *  A shape id is `shape:<id>` and carries no slash, so the FIRST slash is
 *  always the separator. */
function nodeIdOfSubject(subjectId: string): string {
  const slash = subjectId.indexOf("/");
  return slash === -1 ? subjectId : subjectId.slice(0, slash);
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
    const nodeId = nodeIdOfSubject(id);
    return `On port "${id.slice(nodeId.length + 1)}" of ${nameOf(scene, nodeId)}.`;
  }
  const edge = scene.edges.find((candidate) => candidate.id === id);
  if (!edge) return "On a wire.";
  return `On the wire from ${nameOf(scene, edge.source)} to ${nameOf(scene, edge.target)}.`;
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
 * Every rule runs. Two of them (`type-mismatch`, `polarity`) contribute
 * nothing, and that is on purpose rather than an oversight:
 *
 *   - `type-mismatch` needs a `typeOf` resolver, and `lint.ts`'s own header
 *     says the ontology is deliberately unminted ("what a type IS — equality?
 *     hierarchy? union? — is a product decision with zero data support in
 *     this repo"). The projection does carry `portTypes`, so wiring it would
 *     compile; it would also silently mint that decision from a menu lane.
 *   - `polarity` needs a `directionOf`, and this document model only states a
 *     direction for a FLOATING `ss-port` — a Block's ports have no direction
 *     field at all (plan §3's `PortSpecV` is `{id, name, type}`). A resolver
 *     that judged some edges and abstained on others would make the rule's
 *     verdict depend on which end you drew first.
 *
 * Both become one-line additions the day the schema has the vocabulary.
 */
export function useProblems(editor: Editor): BoardProblems {
  const scene = useDocumentScene(editor);

  const { groups, counts, total, shapeIdByRow } = useMemo(() => {
    const findings = lintScene(scene, { portsOf: portsOfScene(scene) });
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
      rows.set(finding.id, nodeIdOfSubject(finding.subject.id) as TLShapeId);
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
  }, [scene]);

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
