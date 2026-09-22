// src/editor/edgePolicy.ts — the edge-permission matrix that decides how
// much a board is allowed to refuse when drawing a cable, ported from the
// archived SystemSketch app's connection-judge settings model into this
// app's trunk.
//
// Ported from /home/bam/systemsketch/src/settings/edgePolicy.ts (300 lines) —
// every export below carries its own citation naming the exact donor line
// range; read the citation before trusting it rather than this header alone.
//
// SystemSketch spans two honest products: a whiteboard, where a line between
// two things means whatever you meant, and a typed dataflow editor, where a
// cable that cannot exist should never be drawable. Both are correct at
// different moments — sketching versus specifying — so the boundary between
// them is a setting rather than a hard-coded taste.
//
// WHY every field is spelled as a PERMISSION, never a restriction (donor
// :12-15): the whiteboard end of the ladder is "all true", so the most
// permissive policy is also the one with no special cases, and a rule added
// later that defaults to `true` cannot silently start refusing cables on
// someone's existing board.
//
// WHY the storage key travels character for character
// (`systemsketch.edgePolicy.v1`, donor :62): keeping the donor's key means
// Zach's existing browser preferences survive the move into this app — that
// is the entire point of a port, not a rewrite.
//
// WHY nothing from React travels: this app's rule (`CLAUDE.md`; precedent in
// `toolPreferences.ts`'s header) is that host-owned persistence and
// subscription do not travel with a ported model. The donor's module-level
// `snapshot`/`hydrate`/`listeners` singleton, `subscribeEdgePolicy`,
// `getEdgePolicy`, `updateEdgePolicy`, `applyEdgePolicyPreset`,
// `useEdgePolicy` (`useSyncExternalStore`), and its `resetEdgePolicyForTests`
// seam (donor :258-300) are all dropped — a host that wants a live policy
// reads it through `readEdgePolicy`/`writeEdgePolicy` and owns its own
// subscription, the same contract `appSettings.ts` and `toolPreferences.ts`
// already use here. With no module-level singleton there is nothing left for
// a reset seam to reset.

/**
 * How much the board is allowed to refuse when drawing a cable.
 *
 * The judge that reads this and nothing else (`judgeConnection`) stayed in
 * SystemSketch — this module only carries the policy shape, its presets, and
 * its persistence.
 *
 * Ported from /home/bam/systemsketch/src/settings/edgePolicy.ts:26-51.
 */
export interface EdgePolicy {
  /** Wire a port that is hidden in the current view. */
  allowHiddenPorts: boolean;
  /**
   * Wire straight across a Block boundary — a child inside one box to
   * something outside it, with no boundary port on the way.
   *
   * Off is the black-box rule: a Block's interior is reachable only through
   * its own ports, so the picture you can see is the whole contract.
   */
  allowCrossBoundary: boolean;
  /** Wire output→output or input→input, instead of demanding one of each. */
  allowSamePolarity: boolean;
  /** How hard the two ports' data types must agree. */
  typeMatching: TypeMatching;
  /** Land a cable that closes a feedback loop back onto its own upstream. */
  allowCycles: boolean;
  /** A second cable between the exact same two port faces. */
  allowDuplicates: boolean;
  /** A Block wired to itself. */
  allowSelfConnection: boolean;
  /** More than one cable INTO the same receiving face. */
  allowFanIn: boolean;
  /** More than one cable OUT of the same emitting face. */
  allowFanOut: boolean;
}

/**
 * `lenient` treats an untyped port as a wildcard, which is what a
 * half-annotated board needs; `strict` additionally demands that both ends
 * declare a type at all, which is the "only valid edges by design" end.
 *
 * Ported from /home/bam/systemsketch/src/settings/edgePolicy.ts:54-58.
 */
export type TypeMatching = "off" | "lenient" | "strict";

// Ported from /home/bam/systemsketch/src/settings/edgePolicy.ts:60.
export const TYPE_MATCHING_MODES: readonly TypeMatching[] = ["off", "lenient", "strict"];

// Ported from /home/bam/systemsketch/src/settings/edgePolicy.ts:62, character
// for character — see the file header WHY.
export const EDGE_POLICY_STORAGE_KEY = "systemsketch.edgePolicy.v1";

/* --------------------------------- presets -------------------------------- */

export type EdgePolicyPresetId = "whiteboard" | "guided" | "typed" | "strict";

export interface EdgePolicyPreset {
  id: EdgePolicyPresetId;
  label: string;
  summary: string;
  policy: EdgePolicy;
}

// The four preset bodies. Ported from
// /home/bam/systemsketch/src/settings/edgePolicy.ts:75-126.

/** Anything to anything: the plain whiteboard, with the judge fully stood down. */
const WHITEBOARD: EdgePolicy = {
  allowHiddenPorts: true,
  allowCrossBoundary: true,
  allowSamePolarity: true,
  typeMatching: "off",
  allowCycles: true,
  allowDuplicates: true,
  allowSelfConnection: true,
  allowFanIn: true,
  allowFanOut: true,
};

/**
 * The rules SystemSketch shipped with, and the default: direction and
 * containment are real, types are still free text so they are not policed.
 */
const GUIDED: EdgePolicy = {
  allowHiddenPorts: false,
  allowCrossBoundary: false,
  allowSamePolarity: false,
  typeMatching: "off",
  allowCycles: false,
  allowDuplicates: false,
  allowSelfConnection: true,
  allowFanIn: true,
  allowFanOut: true,
};

/** Guided, plus the types have to line up wherever they are declared. */
const TYPED: EdgePolicy = {
  ...GUIDED,
  typeMatching: "lenient",
  allowFanIn: false,
};

/**
 * Every rule on, except one. Fan-OUT stays legal on purpose — one value read
 * by two consumers is ordinary dataflow, not an ambiguity, whereas two
 * producers writing one input is a question the picture cannot answer. That
 * judgement is made two rungs earlier, at `typed`, which already refuses
 * fan-in (one producer per input); `strict` never walks it back, it only adds
 * the containment and type rules `typed` still left open.
 */
const STRICT: EdgePolicy = {
  allowHiddenPorts: false,
  allowCrossBoundary: false,
  allowSamePolarity: false,
  typeMatching: "strict",
  allowCycles: false,
  allowDuplicates: false,
  allowSelfConnection: false,
  allowFanIn: false,
  allowFanOut: true,
};

// Ported from /home/bam/systemsketch/src/settings/edgePolicy.ts:128-153,
// labels and summaries verbatim.
export const EDGE_POLICY_PRESETS: readonly EdgePolicyPreset[] = Object.freeze([
  {
    id: "whiteboard",
    label: "Whiteboard",
    summary: "Any port to any port. Nothing is refused — the board means whatever you meant.",
    policy: Object.freeze(WHITEBOARD),
  },
  {
    id: "guided",
    label: "Guided",
    summary: "Direction and containment are real; data types stay free text. The SystemSketch default.",
    policy: Object.freeze(GUIDED),
  },
  {
    id: "typed",
    label: "Typed",
    summary: "Guided, plus declared types must agree and each input takes one producer.",
    policy: Object.freeze(TYPED),
  },
  {
    id: "strict",
    label: "Strict",
    summary: "Only edges that could exist in the running program. Both ends must declare a matching type.",
    policy: Object.freeze(STRICT),
  },
]);

// Ported from /home/bam/systemsketch/src/settings/edgePolicy.ts:155.
export const DEFAULT_EDGE_POLICY: EdgePolicy = Object.freeze(GUIDED);

/** Ported from /home/bam/systemsketch/src/settings/edgePolicy.ts:157-159. */
export function edgePolicyPreset(id: EdgePolicyPresetId): EdgePolicyPreset {
  return EDGE_POLICY_PRESETS.find((preset) => preset.id === id) ?? EDGE_POLICY_PRESETS[1];
}

/** Ported from /home/bam/systemsketch/src/settings/edgePolicy.ts:161-164. */
export function edgePoliciesEqual(a: EdgePolicy, b: EdgePolicy): boolean {
  return EDGE_POLICY_BOOLEAN_KEYS.every((key) => a[key] === b[key]) && a.typeMatching === b.typeMatching;
}

/**
 * Which preset a policy IS, or null when the toggles have been taken
 * somewhere no preset names — the view is expected to show "Custom" in that
 * case. The presets are shortcuts into the same nine switches, never a
 * second source of truth beside them, so this is DERIVED every time it is
 * asked, never stored alongside the policy.
 *
 * Ported from /home/bam/systemsketch/src/settings/edgePolicy.ts:166-173.
 */
export function matchingEdgePolicyPreset(policy: EdgePolicy): EdgePolicyPresetId | null {
  return EDGE_POLICY_PRESETS.find((preset) => edgePoliciesEqual(preset.policy, policy))?.id ?? null;
}

/**
 * How many of the judge's rules this policy actually enforces, for a "2 of 9"
 * readout.
 *
 * Ported from /home/bam/systemsketch/src/settings/edgePolicy.ts:175-179.
 */
export function enforcedRuleCount(policy: EdgePolicy): number {
  const booleans = EDGE_POLICY_BOOLEAN_KEYS.filter((key) => !policy[key]).length;
  return booleans + (policy.typeMatching === "off" ? 0 : 1);
}

// Ported from /home/bam/systemsketch/src/settings/edgePolicy.ts:181.
export const EDGE_POLICY_RULE_COUNT = 9;

/* ------------------------------- persistence ------------------------------- */

// Ported from /home/bam/systemsketch/src/settings/edgePolicy.ts:185-194.
const EDGE_POLICY_BOOLEAN_KEYS = [
  "allowHiddenPorts",
  "allowCrossBoundary",
  "allowSamePolarity",
  "allowCycles",
  "allowDuplicates",
  "allowSelfConnection",
  "allowFanIn",
  "allowFanOut",
] as const satisfies readonly (keyof EdgePolicy)[];

// Ported from /home/bam/systemsketch/src/settings/edgePolicy.ts:196.
export type EdgePolicyBooleanKey = (typeof EDGE_POLICY_BOOLEAN_KEYS)[number];

// Ported from /home/bam/systemsketch/src/settings/edgePolicy.ts:198-200.
interface StoredEdgePolicy extends EdgePolicy {
  version: 1;
}

// Ported from /home/bam/systemsketch/src/settings/edgePolicy.ts:202-204.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Ported from /home/bam/systemsketch/src/settings/edgePolicy.ts:206-208.
function isTypeMatching(value: unknown): value is TypeMatching {
  return typeof value === "string" && (TYPE_MATCHING_MODES as readonly string[]).includes(value);
}

/**
 * A field the stored record predates is `undefined`, not wrong — it falls
 * back to its own default rather than discarding every other choice the user
 * made. A field present with the wrong type means the record is corrupt, and
 * the whole thing resets to the defaults.
 *
 * That is a deliberately different parse SEMANTIC from this app's other
 * settings model (`appSettings.ts`'s `parsePreferences`, which is
 * field-independent — one bad field never resets its siblings): the task
 * here is a faithful port, and per-field-reset-to-default-on-type-mismatch is
 * the donor's own stated contract, not an accident of its shape. Never hands
 * back `DEFAULT_EDGE_POLICY` itself for a caller to mutate — every return
 * path spreads into a fresh object first.
 *
 * Ported from /home/bam/systemsketch/src/settings/edgePolicy.ts:210-230.
 */
export function parseStoredEdgePolicy(value: unknown): EdgePolicy {
  if (!isRecord(value) || value.version !== 1) return { ...DEFAULT_EDGE_POLICY };
  for (const key of EDGE_POLICY_BOOLEAN_KEYS) {
    if (value[key] !== undefined && typeof value[key] !== "boolean") return { ...DEFAULT_EDGE_POLICY };
  }
  if (value.typeMatching !== undefined && !isTypeMatching(value.typeMatching)) return { ...DEFAULT_EDGE_POLICY };

  const parsed = { ...DEFAULT_EDGE_POLICY };
  for (const key of EDGE_POLICY_BOOLEAN_KEYS) {
    const stored = value[key];
    if (typeof stored === "boolean") parsed[key] = stored;
  }
  if (isTypeMatching(value.typeMatching)) parsed.typeMatching = value.typeMatching;
  return parsed;
}

/**
 * Reads `EDGE_POLICY_STORAGE_KEY` through `parseStoredEdgePolicy`. A null
 * storage, a throwing `getItem` (private window, blocked site data), or
 * corrupt JSON all fall back to the defaults. Never throws.
 *
 * Signature matches this app's `appSettings.ts` (`readAppSettings`) rather
 * than the donor's — storage first, no implicit `window.localStorage`
 * default — because this model layer never reaches for `window` itself; the
 * host supplies the adapter.
 *
 * Ported from /home/bam/systemsketch/src/settings/edgePolicy.ts:232-241.
 */
export function readEdgePolicy(storage: Pick<Storage, "getItem"> | null): EdgePolicy {
  if (!storage) return DEFAULT_EDGE_POLICY;
  try {
    const stored = storage.getItem(EDGE_POLICY_STORAGE_KEY);
    return stored === null ? DEFAULT_EDGE_POLICY : parseStoredEdgePolicy(JSON.parse(stored));
  } catch {
    return DEFAULT_EDGE_POLICY;
  }
}

/**
 * Writes `policy` under `EDGE_POLICY_STORAGE_KEY`. A null storage or a
 * throwing `setItem` (private window, full quota) is swallowed — "a
 * preference is a convenience; the board must keep working without it"
 * (donor :251, and `appSettings.ts`'s identical rule). Never throws, and —
 * unlike the donor — returns nothing: the donor returned the policy it was
 * given so its now-dropped `updateEdgePolicy` singleton could chain off it
 * (see the file header); with no singleton there is nothing left to chain.
 *
 * Ported from /home/bam/systemsketch/src/settings/edgePolicy.ts:243-254.
 */
export function writeEdgePolicy(storage: Pick<Storage, "setItem"> | null, policy: EdgePolicy): void {
  if (!storage) return;
  const stored: StoredEdgePolicy = { version: 1, ...policy };
  try {
    storage.setItem(EDGE_POLICY_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Swallowed on purpose — see the doc comment above.
  }
}
