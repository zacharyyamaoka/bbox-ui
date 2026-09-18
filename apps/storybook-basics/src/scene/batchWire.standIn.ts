// src/scene/batchWire.standIn.ts — a STAND-IN availability predicate, so
// the batch-wiring story can be truthful before the real one exists.
//
// ── READ THIS BEFORE USING IT ─────────────────────────────────────────
// This is NOT the connection-rule engine. A sibling lane owns that:
// `validateConnection(scene, candidate) → Verdict` in
// `src/scene/edgeValidation.ts`, with a three-valued refusal and a
// toggleable lint-rule registry. `batchWire.ts` therefore takes its
// judge as an INJECTED `WireJudge` and this file is one implementation
// of that seam — deliberately the smallest one that makes the demo
// honest rather than a second engine racing the first.
//
// When `edgeValidation.ts` lands, the fix is one line at each call site:
//     const judge: WireJudge = (c) => validateConnection(scene, c);
// and this file is DELETED. Nothing in `batchWire.ts` changes — that is
// the whole point of the seam. Do not grow this file toward generality;
// every rule added here is a rule that will have to be deleted twice.
//
// Provenance: class (c), ours, ad hoc. The rule NAMES are the donor's
// (`ConnectionRefusal`, SystemSketch
// `src/blocks/connections/connectionRules.ts:37-45`, opened) so the two
// taxonomies agree; the implementations are not ported — the donor's
// judge reasons over tldraw shape faces, port polarity derived from a
// face, and per-regime cycle policy, none of which exists here.
import type { BlockSide } from "../components/port.layout";
import type { HostNodeData, HostScene } from "../hosts/hostScene";
import type { PortRef, WireJudge, WireVerdict } from "./batchWire";
import { producersOf, type SceneEdgeEnds } from "./scene";

/**
 * Which wall means which direction. Host-side view geometry decides
 * polarity here because the SCENE does not carry it — `HostNodeData.ports`
 * is `Partial<Record<BlockSide, string[]>>` and nothing in it says "in" or
 * "out" (`hostScene.ts`'s own note: "The scene only ever names ports; it
 * never places them").
 *
 * WHY this is a stand-in and not a finding: in the donor, polarity is
 * `portPolarity(port.side, face)` — a function of the port's lane AND
 * which face of the block it is showing, so the same port is a source from
 * outside and a sink from inside. That second argument has no equivalent
 * here yet, so this reads walls only.
 */
const SINK_SIDES: readonly BlockSide[] = ["left", "top"];

export type PortPolarity = "source" | "sink";

/** Every port a host node speaks, in render order. `[]` = speaks none. */
export function hostPortsOf(scene: HostScene): (nodeId: string) => readonly string[] | undefined {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  return (nodeId) => {
    const node = byId.get(nodeId);
    if (!node) return undefined;
    return portIdsOf(node.type, node.data);
  };
}

function portIdsOf(type: string | undefined, data: HostNodeData): string[] {
  if (type === "value") return [...(data.writers ?? []), ...(data.readers ?? [])];
  // glyph and code speak no ports at all — an honest empty, not "unknown".
  if (type === "glyph" || type === "code") return [];
  return (Object.keys(data.ports ?? {}) as BlockSide[]).flatMap((side) => data.ports?.[side] ?? []);
}

/** A port's direction, or `undefined` when the node does not speak it. */
export function hostPolarityOf(scene: HostScene): (ref: PortRef) => PortPolarity | undefined {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  return ({ nodeId, portId }) => {
    const node = byId.get(nodeId);
    if (!node) return undefined;
    if (node.type === "value") {
      if ((node.data.writers ?? []).includes(portId)) return "sink";
      if ((node.data.readers ?? []).includes(portId)) return "source";
      return undefined;
    }
    for (const side of Object.keys(node.data.ports ?? {}) as BlockSide[]) {
      if ((node.data.ports?.[side] ?? []).includes(portId)) {
        return SINK_SIDES.includes(side) ? "sink" : "source";
      }
    }
    return undefined;
  };
}

/** Would `from → to` close a loop? Forward reachability over node ids. */
function reaches(edges: readonly SceneEdgeEnds[], from: string, to: string): boolean {
  const out = new Map<string, string[]>();
  for (const edge of edges) {
    const list = out.get(edge.source);
    if (list) list.push(edge.target);
    else out.set(edge.source, [edge.target]);
  }
  const seen = new Set<string>([from]);
  const stack = [from];
  while (stack.length > 0) {
    const at = stack.pop() as string;
    if (at === to && at !== from) return true;
    for (const next of out.get(at) ?? []) {
      if (next === to) return true;
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return false;
}

export interface StandInRules {
  /** One producer per sink port. Donor calls this `input-occupied`. */
  singleFeed?: boolean;
  /** Refuse a cable that would close a loop. */
  acyclic?: boolean;
  /** Both ends must sit in the same parent scope. */
  sameScope?: boolean;
}

const ALL_RULES: Required<StandInRules> = { singleFeed: true, acyclic: true, sameScope: true };

/**
 * The stand-in judge. Six of the donor's eight refusal reasons, in the
 * donor's own vocabulary:
 *
 *   missing-port     the node does not speak that port
 *   same-polarity    two sources, or two sinks
 *   no-shared-scope  different parents (`sameScope`)
 *   duplicate        this exact pair of ports is already wired
 *   input-occupied   the sink already has a producer (`singleFeed`)
 *   cycle            the cable would close a loop (`acyclic`)
 *
 * `type-mismatch` and `hidden-port` are absent because this host carries
 * neither a port type nor a hidden flag — stating that plainly beats
 * inventing both to look complete.
 */
export function standInJudge(scene: HostScene, rules: StandInRules = ALL_RULES): WireJudge {
  const portsOf = hostPortsOf(scene);
  const polarityOf = hostPolarityOf(scene);
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const { singleFeed = true, acyclic = true, sameScope = true } = rules;

  return ({ source, target }): WireVerdict => {
    if (source.nodeId === target.nodeId) return { ok: false, reason: "same-polarity" };
    for (const ref of [source, target]) {
      if (!(portsOf(ref.nodeId) ?? []).includes(ref.portId)) return { ok: false, reason: "missing-port" };
    }
    const from = polarityOf(source);
    const to = polarityOf(target);
    if (from === undefined || to === undefined) return { ok: false, reason: "missing-port" };
    if (from === to) return { ok: false, reason: "same-polarity" };
    if (sameScope && byId.get(source.nodeId)?.parentId !== byId.get(target.nodeId)?.parentId) {
      return { ok: false, reason: "no-shared-scope" };
    }
    // Direction is fixed by polarity, never by which end was clicked: the
    // cable always runs source-port → sink-port, so `duplicate`,
    // `input-occupied` and `cycle` all ask about that oriented pair.
    const [tail, head] = from === "source" ? [source, target] : [target, source];
    const already = scene.edges.some(
      (edge) =>
        edge.source === tail.nodeId &&
        edge.sourceHandle === tail.portId &&
        edge.target === head.nodeId &&
        edge.targetHandle === head.portId,
    );
    if (already) return { ok: false, reason: "duplicate" };
    if (singleFeed && producersOf(scene, { nodeId: head.nodeId, portId: head.portId }).length > 0) {
      return { ok: false, reason: "input-occupied" };
    }
    if (acyclic && reaches(scene.edges, head.nodeId, tail.nodeId)) return { ok: false, reason: "cycle" };
    // Report the orientation, not just the permission — the gesture's order
    // is not the dataflow direction. See `WireVerdict.oriented`.
    return { ok: true, oriented: { source: tail, target: head } };
  };
}
