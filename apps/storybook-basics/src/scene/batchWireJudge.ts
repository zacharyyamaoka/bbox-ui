// src/scene/batchWireJudge.ts — the REAL seam batch-wiring's own comments
// promised: `batchWire.ts`'s `WireJudge` doc and `batchWire.standIn.ts`'s
// own header both wrote "when `edgeValidation.ts` lands, the fix is one
// line at each call site: `const judge: WireJudge = (c) =>
// validateConnection(scene, c);`" — and Zach's own ruling tied the two
// lanes together: "We for the batch wiring already need to get a visual
// language about valid/invalid connections, and we can reuse that here."
//
// It is not literally one line, because `WireVerdict` and `ConnectionVerdict`
// disagree on SHAPE (`{ok,reason}` over a `BatchWirePair` of `PortRef`s vs
// `{allowed,refusal}` over `SceneEdgeEnds` strings) — this file is exactly
// that translation, and adds no rule of its own: every gate a batch cable
// is judged against is `validateConnection`'s, not a second copy of it.
//
// `batchWire.standIn.ts` is DELETED now that this exists (its own header
// named this file's arrival as the trigger). `hostPortsOf`/`hostPolarityOf`
// — host-geometry READERS, not rule engine — moved to `../hosts/hostScene`
// rather than being deleted with it; they still supply this adapter's
// `portsOf`/`directionOf` for the host family that has no other port
// vocabulary.
import { validateConnection, type ConnectionPolicy } from "./edgeValidation";
import type { LintScene, PortDirectionOf, PortTypeOf, TypeCompatible } from "./lint";
import type { BatchWirePair, PortsOf, WireJudge, WireRefusal, WireVerdict } from "./batchWire";

/**
 * `edgeValidation.ts`'s rule-id vocabulary, translated into batch-wiring's
 * own donor words (`ConnectionRefusal`, SystemSketch
 * `src/blocks/connections/connectionRules.ts:37-45`, opened — the same
 * donor `batchWire.ts`'s `DEFAULT_REFUSAL_PRECEDENCE`/`REFUSAL_WORDS` are
 * already written against). Translating here, once, is what lets
 * `describeWireRefusal` and the precedence table keep meaning the same
 * thing once the real engine sits behind the seam instead of the stand-in.
 *
 * `self-connection` maps to `same-polarity` — the stand-in's own choice
 * for a same-node candidate (`batchWire.standIn.ts`'s `judge`, first line)
 * — even though `planBatchWire` already skips a source equal to its
 * target's node before any judge sees it (donor :427-429), so this arm is
 * unreached in practice and kept only so an unmapped code never leaks
 * through unmapped (see the fallback below).
 */
const REFUSAL_CODE: Readonly<Record<string, WireRefusal>> = {
  "dangling-edge": "missing-port",
  "self-connection": "same-polarity",
  polarity: "same-polarity",
  "many-to-one": "input-occupied",
  "duplicate-edge": "duplicate",
  cycle: "cycle",
  "no-shared-scope": "no-shared-scope",
  "type-mismatch": "type-mismatch",
};

export interface BatchWireJudgeOptions {
  portsOf: PortsOf;
  /** This host family's polarity reader — `hostPolarityOf` (`hostScene.ts`)
   *  for the `HostScene` family; omitted, polarity contributes nothing and
   *  every candidate orients by gesture order, the same "undefined =
   *  unknown, no judgement" convention `lint.ts` documents throughout. */
  directionOf?: PortDirectionOf;
  typeOf?: PortTypeOf;
  compatible?: TypeCompatible;
  /**
   * Which rules gate, as `ConnectionPolicy` PERMISSIONS — the batch
   * story's own `StandInRules` named the same three as PROHIBITIONS
   * (`singleFeed`/`acyclic`/`sameScope`); a caller inverts at its own call
   * site (`allowFanIn: !singleFeed`, etc.), which keeps this file from
   * knowing that vocabulary exists.
   *
   * `allowSelfConnection`/`allowDuplicates` are NOT exposed here — they
   * are forced `false` below, unconditionally, matching the stand-in's own
   * unconditional duplicate/self refusal: batch wiring never had a toggle
   * for either, and `DEFAULT_CONNECTION_POLICY`'s permissive default for
   * duplicates is `wiring.ts`'s drag-time stance (`edgeValidation.ts`'s own
   * header), not a rule batch wiring ever adopted.
   */
  policy?: Pick<Partial<ConnectionPolicy>, "allowFanIn" | "allowCycles" | "allowCrossScope">;
}

/**
 * `validateConnection`, behind batch-wiring's own `WireJudge` seam.
 *
 * `scene` is a `HostScene` (or any `LintScene`-shaped record) passed
 * straight through — no adapter needed on that side, because `LintScene`
 * is already the same structural-slice contract `batchWire.ts`'s own
 * `BlockScene` satisfies.
 */
export function validateConnectionJudge(scene: LintScene, options: BatchWireJudgeOptions): WireJudge {
  const { portsOf, directionOf, typeOf, compatible, policy } = options;
  return ({ source, target }: BatchWirePair): WireVerdict => {
    const candidate = {
      id: "__batch-candidate__",
      source: source.nodeId,
      sourceHandle: source.portId,
      target: target.nodeId,
      targetHandle: target.portId,
    };
    const verdict = validateConnection(scene, candidate, {
      portsOf,
      directionOf,
      typeOf,
      compatible,
      policy: { allowSelfConnection: false, allowDuplicates: false, ...policy },
    });
    if (!verdict.allowed) {
      // `refusal.code` is `Diagnostic`'s own optional field, but every
      // `refuse()` call site in `edgeValidation.ts` sets it — the fallback
      // is only for a hand-built `ConnectionVerdict` that omitted it.
      const code = verdict.refusal.code ?? "missing-port";
      return { ok: false, reason: REFUSAL_CODE[code] ?? code };
    }
    // The judge's own oriented pair wins over the gesture's order — see
    // `ConnectionOrientation` and `WireVerdict.oriented`'s own docs, both
    // of which this line is the reconciliation of.
    return {
      ok: true,
      oriented: {
        source: { nodeId: verdict.oriented.ends.source, portId: verdict.oriented.ends.sourceHandle ?? source.portId },
        target: { nodeId: verdict.oriented.ends.target, portId: verdict.oriented.ends.targetHandle ?? target.portId },
      },
    };
  };
}
