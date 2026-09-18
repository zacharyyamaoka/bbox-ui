// src/scene/availability.ts — drag-time validity preview (2026-09-18,
// "final spec" lane, ruling 5): f(scene, the port a drag started from) →
// every OTHER port's verdict, computed ONCE for the whole gesture. Pure,
// no React, no DOM, no canvas engine — the same rule the whole scene kit
// follows.
//
// Zach: "Show the legal move set during the gesture, not the error after
// it... Drag time validity preview! actually even langflow has this. yes
// 100% lets implement this feature. It can be something we toggle on and
// off, but should be on by default!" Prevention converts most would-be
// diagnostics into non-events — this is `edgeValidation.ts`'s
// `validateConnection` run against every candidate target BEFORE the
// gesture commits to one, rather than against the one candidate it ends
// on.
//
// [OBSERVATION WINS] ONCE PER GESTURE, BY CONTRACT — not recomputed as the
// pointer moves. JointJS's own lifecycle is exactly this shape:
// `_markAvailableMagnets` computes the marked set once at drag-START and
// `_unmarkAvailableMagnets` clears it once at drag-END (MPL-2.0, dist
// `joint.js:31927-31952`); running it live confirmed the marked set does
// NOT change while hovering an incompatible magnet mid-drag inside snap
// radius — behaviour-derived, no JointJS source copied. Two alternatives
// were recorded and deliberately NOT built here:
//   - maxGraph `ConnectionHandler`'s lazy, per-hover, SINGLE-target
//     validate (Apache-2.0, fetched `ConnectionHandler.ts:2037-2112`) —
//     the right shape for a scene too large to enumerate every port up
//     front; noted as the fallback pattern, not implemented.
//   - maxGraph `ConstraintHandler`'s reset → setFocus → redraw → destroy
//     lifecycle (Apache-2.0, fetched `ConstraintHandler.ts:46,83,386,451`,
//     precise line refs `:127/357/185/197`) — the Apache-clean painting-
//     lifecycle template beside the MPL-derived one above.
//
// [OBSERVATION WINS] THE SNAP FILTER, NOT A SEPARATE STATE. JointJS
// `snapLinks` passes its validator in as the candidate FILTER for the
// closest-magnet search itself — validates WHILE searching, so an invalid
// magnet is never a snap candidate in the first place (MPL-2.0, dist
// `joint.js:31740-31780`, run live). `ValidateConnection` below is written
// so the magnetic-wires lane can hand it (or this file's precomputed map)
// to its own search as that same filter — there is no separate "snap,
// then reject" state anywhere in this design.
//
// THE ONE INJECTED SEAM, THREE CONSUMERS (verified against this tree,
// 2026-09-18):
//   1. These stories — `connectionAvailability` → a `Port`'s own
//      `availability` prop (component-lane work, not this file).
//   2. Batch wiring — `batchWire.ts` already declares its own
//      `WireJudge = (candidate) => WireVerdict` closing over its scene
//      (`batchWire.ts:150-160`) and imports NOTHING from
//      `edgeValidation.ts` (grepped: comments only). `batchWire.standIn.ts`
//      names its own one-line replacement once this lane lands — that
//      swap belongs to the batch-wiring lane, not this one; this file
//      never touches `batchWire*`.
//   3. Magnetic wires — consumes `ValidateConnection` (or this file's
//      precomputed `Map`) as its own snap-search filter, per the
//      `snapLinks` note above. This file never touches `magnet*`.

import { validateConnection, type ConnectionVerdict } from "./edgeValidation";
import type { LintScene, PortsOf, PortTypeOf, TypeCompatible } from "./lint";
import { portKey, type ScenePortRef, type SceneEdgeEnds } from "./scene";

/**
 * Would committing a candidate edge between two ports be legal? THE
 * injected seam — deliberately `(scene, candidate) => verdict`, matching
 * `validateConnection`'s own signature exactly, so the default (below)
 * needs no adapter and a caller that already has its own judge (a host
 * with extra policy `edgeValidation.ts` cannot see) can substitute it
 * wholesale.
 */
export type ValidateConnection = (scene: LintScene, candidate: SceneEdgeEnds & { id: string }) => ConnectionVerdict;

/** A synthetic candidate never collides with a real edge id — nothing here
 *  is committed, matching `validateConnection`'s own "nothing here is
 *  persisted" contract. */
const CANDIDATE_EDGE_ID = "__candidate__";

export interface AvailabilityOptions {
  /** Required: targets cannot be enumerated at all without a port
   *  vocabulary — unlike `validateConnection`'s own `portsOf`, which is
   *  optional because a single named candidate does not need one. */
  portsOf: PortsOf;
  /** Override the judge entirely. Omitted, the default wraps
   *  `validateConnection` with this call's own `typeOf`/`compatible`. */
  validate?: ValidateConnection;
  /** Which end `from` plays in the synthesized candidate. Default
   *  `"source"` — `from` supplies the value, every enumerated port is a
   *  possible target. `"target"` builds the reversed candidate instead. */
  fromRole?: "source" | "target";
  typeOf?: PortTypeOf;
  compatible?: TypeCompatible;
}

export interface PortAvailability {
  ref: ScenePortRef;
  verdict: ConnectionVerdict;
}

/**
 * Every OTHER enumerable `(node, port)` in `scene`, judged against a
 * gesture starting at `from` — keyed by `portKey`, so the result drops
 * straight into a lookup a story does once per gesture-start. Pure and
 * total: a node whose `portsOf` resolves `undefined` contributes NOTHING
 * (the same "undefined = unknown, no judgement" convention `PortsOf`
 * itself documents in lint.ts), and `from`'s own port is skipped — a
 * gesture is never offered itself as a legal target.
 */
export function connectionAvailability(scene: LintScene, from: ScenePortRef, options: AvailabilityOptions): Map<string, PortAvailability> {
  const { portsOf, fromRole = "source", typeOf, compatible } = options;
  const validate: ValidateConnection = options.validate ?? ((s, candidate) => validateConnection(s, candidate, { portsOf, typeOf, compatible }));
  const fromKey = portKey(from.nodeId, from.portId);

  const result = new Map<string, PortAvailability>();
  for (const node of scene.nodes) {
    const ports = portsOf(node.id);
    if (!ports) continue;
    for (const portId of ports) {
      const ref: ScenePortRef = { nodeId: node.id, portId };
      const key = portKey(node.id, portId);
      if (key === fromKey) continue;

      const candidate: SceneEdgeEnds & { id: string } =
        fromRole === "source"
          ? { id: CANDIDATE_EDGE_ID, source: from.nodeId, sourceHandle: from.portId, target: node.id, targetHandle: portId }
          : { id: CANDIDATE_EDGE_ID, source: node.id, sourceHandle: portId, target: from.nodeId, targetHandle: from.portId };

      result.set(key, { ref, verdict: validate(scene, candidate) });
    }
  }
  return result;
}
