// src/scene/lint.ts — the lint engine: f(scene, enabled rules) → findings.
// Pure, no React, no DOM, no canvas engine — same rule the whole scene kit
// follows (CLAUDE.md: "the core imports no canvas engine"; scene.ts/
// sceneDiff.ts's own headers). Zach, 2026-09-17: "we can do a v1 of the
// linter engine and edge validation engine... should just be purely
// functional."
//
// This file is the ANNOTATION half named by docs/INVALID-STATES-PLAN.md's
// Appendix B ("annotation... reports on state that already exists and was
// not necessarily created by a gesture") — every rule here is a producer of
// `../components/highlighter.tsx`'s `Diagnostic` vocabulary, extended with
// the bookkeeping (`ruleId`, `subject`) a runner and a host need but a paint
// layer does not. `edgeValidation.ts` is this file's PREVENTION twin (the
// pre-commit question); it imports rules from here rather than
// re-implementing them — see its own header for why that is safe.
//
// WHY this file DOES import `../components/highlighter.tsx` (type-only),
// unlike `sceneDiff.ts`'s deliberate "imports NOTHING diagnostic-shaped":
// that rule exists to keep the DIFF lane decoupled from the LINT lane (two
// producers that must not serialize on each other, sceneDiff.ts:64-75). It
// says nothing about the lint lane's relationship to the diagnostics
// VOCABULARY it is one of the producers of — the opposite is true, this
// file's entire job is emitting that vocabulary. `sceneWires.ts` already
// sets the precedent of a scene/ file taking type-only imports from
// components/ (`PortEdgeItem`, `TraceMarkerEnd`, `TraceRouting`, `Wire`) —
// this follows the same pattern, and being type-only it erases at build
// time (no React, no "use client", no runtime coupling survives into the
// compiled output).
//
// Rule provenance (repo rule, `.claude/feedback.md`: "every file
// implementing real math cites where it came from"):
//   - dangling-edge, cycle, duplicate-edge: thin wrappers around
//     `findDanglingEdges`/`findCycles`/`duplicateEdges` (scene.ts:424,288,
//     373) — this file adds no graph algorithm of its own for these three,
//     only the Diagnostic-shaped message and id.
//   - many-to-one: PROJECT - pyblocks § many-to-one (vault note,
//     2026-09-02 AI answer, quoting Cytron's φ-function framing) — "two
//     producers into one port are legal only when some region makes them
//     exclusive... two producers outside every region are never exclusive."
//     This scene kit has no branch/region/arm concept implemented anywhere
//     (grepped: none exists), so the exclusivity carve-out never applies
//     here yet — every many-to-one this rule finds is unconditionally
//     illegal until a region model exists to make some of them legal.
//   - self-connection: ours, ad hoc. `findCycles` already detects a
//     self-loop structurally while building its SCCs (scene.ts:297-301,
//     `selfLoop`), but it reports the NODE id, never the edge id — useless
//     for "highlight the illegal WIRE" (Zach's own framing of the demo).
//     Reporting the edge directly needs no algorithm beyond `source ===
//     target`, so it is implemented directly rather than post-processing
//     `findCycles`' output.
//   - type-mismatch: NOT IMPLEMENTED. `SceneNode.data` is `SceneData =
//     Record<string, unknown>` (scene.ts:35) and nothing anywhere in
//     scene.ts, sceneWires.ts or linking.ts attaches a port type/schema —
//     grepped for `portType`/`dataType`/`valueType` across `src/scene/` and
//     `src/components/port*.tsx`, zero hits. There is no type vocabulary to
//     compare two ports against, so inventing one here would be exactly the
//     "fabricate a rule the data cannot support" the brief warned against.
//     Add this rule the day a port carries a declared type.

import type { Diagnostic, DiagnosticSeverity } from "../components/highlighter";
import { duplicateEdges, findCycles, findDanglingEdges, portKey, producersOf, type ScenePortRef, type SceneEdgeEnds } from "./scene";

/* ------------------------------------------------------------------ */
/* The vocabulary a rule reads and writes                              */
/* ------------------------------------------------------------------ */

/** The minimal scene shape every rule below needs — the same structural-
 *  slice discipline `scene.ts` itself uses (`SceneEdgeEnds`, `{id}`), so a
 *  `BlockScene`, a React Flow store's nodes/edges, or a hand-built fixture
 *  all satisfy it with no adapter. */
export interface LintScene {
  nodes: readonly { id: string }[];
  edges: readonly (SceneEdgeEnds & { id: string })[];
}

/** Per-node port vocabulary, total: same contract as `findDanglingEdges`'s
 *  own `portsOf` (scene.ts:412-416) — omitted, only node existence is
 *  checked; `undefined` for a node means "unknown vocabulary, no port
 *  judgement for it." Reused verbatim rather than re-declared so the two
 *  call sites can never drift. */
export type PortsOf = (nodeId: string) => readonly string[] | undefined;

/** What render carrier a finding attaches to — the address, not the paint.
 *  A component picks its own presentation per §5 of
 *  docs/INVALID-STATES-PLAN.md; this is only "which one." */
export type LintSubjectKind = "node" | "edge" | "port";

export interface LintSubject {
  kind: LintSubjectKind;
  /** nodeId | edgeId | `portKey(nodeId, portId)` — scene.ts's own key
   *  spellings, reused so a host never has to reparse this string to know
   *  which DOM element a finding is about. */
  id: string;
}

/**
 * One finding. Extends `Diagnostic` (`../components/highlighter.tsx`) rather
 * than merely resembling it, so a host that only wants the paint-facing
 * fields can hand a `LintFinding[]` straight to a `diagnostics` prop with
 * zero mapping — TypeScript's structural typing accepts it as-is because
 * every extra field (`ruleId`, `subject`) is additional, never a narrowing.
 *
 * `id` is `lint:<ruleId>:<subject.kind>:<subject.id>[:<detail>]` — always
 * derived from the rule plus what it is about, NEVER from array position or
 * a counter (the multi-producer risk the whole `diagnostics` axis exists to
 * prevent: maxGraph's `setCellWarning(cell, null)` deletes EVERY overlay on
 * a cell because it has no per-item identity — an id from position would
 * reintroduce exactly that fragility the moment two producers' lists are
 * merged or reordered). `detail` exists only for the rare case where one
 * rule legitimately reports more than one independent fact about the same
 * subject in a single pass (an edge dangling at BOTH ends) — it keeps the
 * id unique without inventing a finer subject kind that no component would
 * ever key off of.
 */
export interface LintFinding extends Diagnostic {
  ruleId: LintRuleId;
  subject: LintSubject;
}

/* ------------------------------------------------------------------ */
/* The registry — closed, documented, individually toggleable           */
/* ------------------------------------------------------------------ */

export type LintRuleId = "dangling-edge" | "cycle" | "duplicate-edge" | "many-to-one" | "self-connection";

/** Scene order — also the registry's own iteration/display order, so a
 *  rule-picker UI (the story's Storybook controls) lists them the same way
 *  every time. */
export const LINT_RULE_IDS: readonly LintRuleId[] = ["dangling-edge", "cycle", "duplicate-edge", "many-to-one", "self-connection"];

/** One raw hit, before the runner turns it into a full `LintFinding` — a
 *  rule states WHAT it found and ABOUT WHAT; the runner (`lintScene`) owns
 *  turning that into a stable id and a `Diagnostic`-shaped record, so every
 *  rule's id-construction is identical and cannot drift rule to rule. */
export interface LintRuleHit {
  subject: LintSubject;
  message: string;
  /** See `LintFinding.id`'s own doc. */
  detail?: string;
}

export interface LintRule {
  id: LintRuleId;
  /** Fixed per rule — every hit a rule reports shares one severity, so
   *  `LINT_RULES[id].severity` is answerable without running anything. */
  severity: DiagnosticSeverity;
  /** One line, human-readable — the rule-picker's own label. */
  title: string;
  /** Where the rule's math or its "outside prior art has no answer, this is
   *  ours" comes from — repo rule, `.claude/feedback.md`. */
  provenance: string;
  run(scene: LintScene, portsOf?: PortsOf): LintRuleHit[];
}

const danglingEdgeRule: LintRule = {
  id: "dangling-edge",
  severity: "error",
  title: "Dangling edge — an end names a node or port that isn't in the scene",
  provenance: "wraps findDanglingEdges (scene.ts:424)",
  run(scene, portsOf) {
    return findDanglingEdges(scene, portsOf).map((d) => ({
      subject: { kind: "edge", id: d.edgeId },
      detail: d.end,
      message:
        d.reason === "missing-node"
          ? `Edge "${d.edgeId}" — its ${d.end} names node "${d.nodeId}", which is not in the scene`
          : `Edge "${d.edgeId}" — its ${d.end} names port "${d.nodeId}/${d.portId}", which "${d.nodeId}" does not have`,
    }));
  },
};

const cycleRule: LintRule = {
  id: "cycle",
  severity: "error",
  title: "Cycle — a node sits on (or strictly behind) a dependency loop",
  provenance: "wraps findCycles (scene.ts:288, Tarjan SCC)",
  run(scene) {
    const hits: LintRuleHit[] = [];
    for (const members of findCycles(scene)) {
      const message =
        members.length === 1
          ? `Node "${members[0]}" feeds itself (self-loop)`
          : `Nodes form a cycle: ${members.join(" → ")} → ${members[0]}`;
      for (const nodeId of members) hits.push({ subject: { kind: "node", id: nodeId }, message });
    }
    return hits;
  },
};

const duplicateEdgeRule: LintRule = {
  id: "duplicate-edge",
  // WHY warning, not error: wiring.ts's own header states the app's
  // deliberate permission-free stance verbatim — "draw as many wires as you
  // want... even multiple wires between the same two ports... nothing here
  // validates" (wiring.ts:20-22). A duplicate is worth a linter's nudge; it
  // is not a violation of anything this app has actually forbidden.
  severity: "warning",
  title: "Duplicate edge — 2+ edges share one unordered port pair",
  provenance: "wraps duplicateEdges (scene.ts:373); severity per wiring.ts:20-22's stated permission-free stance",
  run(scene) {
    const hits: LintRuleHit[] = [];
    for (const group of duplicateEdges(scene)) {
      const message = `${group.length} edges connect the same two ports`;
      for (const edge of group) hits.push({ subject: { kind: "edge", id: edge.id }, message });
    }
    return hits;
  },
};

const manyToOneRule: LintRule = {
  id: "many-to-one",
  severity: "error",
  title: "Many-to-one — 2+ producers wired into one input port",
  provenance:
    'PROJECT - pyblocks § many-to-one (vault, AI answer 2026-09-02): "two producers into one port are legal only when some region makes them exclusive... two producers outside every region are never exclusive." This scene kit has no region/branch/arm concept (grepped: none exists in src/scene or src/components), so the exclusivity carve-out never applies yet — every hit here is unconditionally illegal until a region model exists. Message wording matches the precedent already in Diagnostics.stories.tsx\'s `WiredAndError` story ("Two producers wired into one port"), which marks the PORT, not an edge — this rule does the same. Counts DISTINCT SOURCES, not raw producer-edge count (see the `run` body\'s own WHY) — an exact re-wire from the same source is duplicate-edge\'s concern, not this rule\'s.',
  run(scene) {
    const seen = new Set<string>();
    const hits: LintRuleHit[] = [];
    for (const edge of scene.edges) {
      if (edge.targetHandle == null) continue;
      const ref: ScenePortRef = { nodeId: edge.target, portId: edge.targetHandle };
      const key = portKey(ref.nodeId, ref.portId);
      if (seen.has(key)) continue;
      seen.add(key);
      const producers = producersOf(scene, ref);
      // Distinct SOURCES, not raw edge count. Two edges from the exact same
      // source port carry the identical value — that is `duplicate-edge`'s
      // concern (a redundant wire, warning-severity and explicitly PERMITTED
      // by wiring.ts's own stance), not a contended one. Many-to-one is
      // about genuinely different values competing for one port with no
      // region to choose between them (the pyblocks φ framing this rule is
      // ported from) — an exact re-wire of the same source is not that.
      const distinctSources = new Set(producers.map((p) => portKey(p.source, p.sourceHandle ?? "")));
      if (distinctSources.size < 2) continue;
      hits.push({
        subject: { kind: "port", id: key },
        message: `Port "${key}" has ${distinctSources.size} producers wired in (no region makes them exclusive)`,
      });
    }
    return hits;
  },
};

const selfConnectionRule: LintRule = {
  id: "self-connection",
  severity: "error",
  title: "Self-connection — an edge's source and target are the same node",
  provenance:
    "ours, ad hoc. findCycles (scene.ts:297-301) already detects a self-loop structurally while building its SCCs, but reports the NODE id, never the edge id — this rule reports the WIRE directly (source === target) so the offending edge, not just the node, carries a mark.",
  run(scene) {
    return scene.edges
      .filter((edge) => edge.source === edge.target)
      .map((edge) => ({ subject: { kind: "edge", id: edge.id }, message: `Edge "${edge.id}" connects "${edge.source}" to itself` }));
  },
};

/** The closed registry — a documented value per id, never an open string
 *  soup. `Readonly` so a consumer cannot quietly monkey-patch a rule. */
export const LINT_RULES: Readonly<Record<LintRuleId, LintRule>> = {
  "dangling-edge": danglingEdgeRule,
  cycle: cycleRule,
  "duplicate-edge": duplicateEdgeRule,
  "many-to-one": manyToOneRule,
  "self-connection": selfConnectionRule,
};

/* ------------------------------------------------------------------ */
/* The runner                                                          */
/* ------------------------------------------------------------------ */

export interface LintOptions {
  /**
   * Which rules run this pass. Omitted = every rule in `LINT_RULE_IDS`.
   * This is the whole mechanism behind Zach's requirement — "if you only
   * have a subset of the rules on then only a subset of the traces are in
   * error state" — a rule that is not in this list contributes NOTHING,
   * not even a suppressed finding; there is no monolithic `lint(scene)`
   * that always runs everything and hides some of it after the fact.
   */
  rules?: readonly LintRuleId[];
  portsOf?: PortsOf;
}

/**
 * scene, enabled rules -> findings. Pure and total: an unknown rule id in
 * `options.rules` is skipped rather than thrown on (the same malformed-
 * input policy `dependencyGraph`/`findDanglingEdges` already use), and an
 * empty scene or an empty rule set both yield `[]`, the honest nothing.
 *
 * One finding per (rule, subject) is the norm; a rule may still emit more
 * than one hit for the SAME subject in a single pass when the underlying
 * facts are genuinely independent (an edge dangling at both ends) — the
 * `detail` on that hit is what keeps the resulting ids distinct rather than
 * colliding, per `LintFinding.id`'s own doc.
 */
export function lintScene(scene: LintScene, options: LintOptions = {}): LintFinding[] {
  const ruleIds = options.rules ?? LINT_RULE_IDS;
  const findings: LintFinding[] = [];
  for (const ruleId of ruleIds) {
    const rule = LINT_RULES[ruleId];
    if (!rule) continue;
    for (const hit of rule.run(scene, options.portsOf)) {
      const subjectKeyStr = `${hit.subject.kind}:${hit.subject.id}`;
      const id = hit.detail ? `lint:${rule.id}:${subjectKeyStr}:${hit.detail}` : `lint:${rule.id}:${subjectKeyStr}`;
      findings.push({ id, severity: rule.severity, message: hit.message, code: rule.id, ruleId: rule.id, subject: hit.subject });
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* Reading the result — grouped by render carrier                      */
/* ------------------------------------------------------------------ */

/** `${kind}:${id}` — the one shared spelling of "which carrier", mirroring
 *  `scene.ts`'s own `portKey`. */
export function subjectKey(subject: LintSubject): string {
  return `${subject.kind}:${subject.id}`;
}

/**
 * Every finding, grouped by the carrier it names — the shape a host reads
 * off to fill one component's `diagnostics` prop. Never pre-collapses: a
 * carrier with N findings keeps all N; `maxDiagnosticSeverity`
 * (diagnostic.tsx) is what the component itself reduces at paint time, per
 * this axis's own channel-discipline rule (docs/INVALID-STATES-PLAN.md §1:
 * "a producer that has already merged N findings to one has destroyed the
 * rest").
 */
export function findingsBySubject(findings: readonly LintFinding[]): Map<string, LintFinding[]> {
  const grouped = new Map<string, LintFinding[]>();
  for (const finding of findings) {
    const key = subjectKey(finding.subject);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(finding);
    else grouped.set(key, [finding]);
  }
  return grouped;
}

/** One carrier's findings, order-preserved — the single-lookup sibling of
 *  `findingsBySubject` for a host that only needs one node/edge/port at a
 *  time (e.g. a story rendering one `Trace` per scene edge). */
export function findingsFor(findings: readonly LintFinding[], subject: LintSubject): LintFinding[] {
  const key = subjectKey(subject);
  return findings.filter((finding) => subjectKey(finding.subject) === key);
}
